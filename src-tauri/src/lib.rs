mod commands;
mod screensaver;
mod storage;
mod window;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, ShortcutState};

pub fn run() {
    // Decide up front whether Windows launched us as a screensaver (/s). /p and
    // /c are handled and exit inside here, so we only continue for /s or a
    // normal launch.
    let is_screensaver =
        screensaver::launch_mode_from_args() == screensaver::LaunchMode::Screensaver;

    // A second instance of the same app can't share the main app's WebView2
    // data folder, so give the screensaver its own — it runs fine alongside a
    // running Layer.
    if is_screensaver {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            std::env::set_var(
                "WEBVIEW2_USER_DATA_FOLDER",
                format!("{local}\\Layer\\screensaver-webview"),
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    // Ctrl+Shift+N → Quick capture. Bring the window forward
                    // first so the modal is actually visible.
                    if shortcut.key == Code::KeyN {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            window::set_layer(&w, true);
                        }
                        let _ = app.emit("quick-capture", ());
                    } else if shortcut.key == Code::KeyS {
                        // Ctrl+Shift+S → preview the screensaver right now.
                        screensaver::preview();
                    } else if shortcut.key == Code::KeyE {
                        // Ctrl+Shift+E → cycle to the next space.
                        let _ = app.emit("cycle-space", ());
                    } else {
                        let _ = app.emit("toggle-mode", ());
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.manage(screensaver::Launch {
                screensaver: is_screensaver,
            });

            // Screensaver mode: just show the ambient view on top — no tray,
            // no global shortcuts, no desktop pinning.
            if is_screensaver {
                window::setup_screensaver(app)?;
                return Ok(());
            }

            window::setup_window(app)?;
            let _ = app.global_shortcut().register("CmdOrControl+Shift+Space");
            let _ = app.global_shortcut().register("CmdOrControl+Shift+N");
            let _ = app.global_shortcut().register("CmdOrControl+Shift+S");
            let _ = app.global_shortcut().register("CmdOrControl+Shift+E");

            let toggle_item =
                MenuItemBuilder::with_id("toggle", "Toggle edit mode").build(app)?;
            let templates_item =
                MenuItemBuilder::with_id("spaces", "Spaces…").build(app)?;
            let notifications_item =
                MenuItemBuilder::with_id("notifications", "Notifications…").build(app)?;
            let settings_item =
                MenuItemBuilder::with_id("settings", "Settings…").build(app)?;
            let lock_item =
                MenuItemBuilder::with_id("lock-all", "Toggle widget lock")
                    .build(app)?;
            let update_item =
                MenuItemBuilder::with_id("check-updates", "Check for updates")
                    .build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", "Quit Layer").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[
                    &toggle_item,
                    &templates_item,
                    &notifications_item,
                    &settings_item,
                ])
                .separator()
                .items(&[&lock_item, &update_item])
                .separator()
                .items(&[&quit_item])
                .build()?;

            // Bring the window forward and emit a UI event in one go.
            let open_panel = |app: &tauri::AppHandle, name: &str| {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    window::set_layer(&w, true);
                }
                let _ = app.emit(name, ());
            };

            let mut tray = TrayIconBuilder::new()
                .tooltip("Layer — click to toggle edit mode")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "toggle" => {
                        let _ = app.emit("toggle-mode", ());
                    }
                    "spaces" => open_panel(app, "open-spaces"),
                    "notifications" => open_panel(app, "open-notifications"),
                    "settings" => open_panel(app, "open-settings"),
                    "lock-all" => {
                        let _ = app.emit("toggle-lock-all", ());
                    }
                    "check-updates" => {
                        let _ = app.emit("check-updates", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = tray.app_handle().emit("toggle-mode", ());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_hit_regions,
            commands::set_force_interactive,
            commands::set_front,
            commands::save_canvas,
            commands::load_canvas,
            commands::save_journal,
            commands::load_journal,
            commands::save_spaces,
            commands::load_spaces,
            commands::write_text_file,
            commands::read_text_file,
            commands::reset_all,
            commands::open_url,
            commands::import_asset,
            commands::delete_asset,
            commands::quit_app,
            commands::get_app_version,
            commands::get_launch_mode,
            commands::exit_screensaver,
            commands::set_screensaver_enabled,
            commands::preview_screensaver,
            commands::set_screensaver_theme,
            commands::get_screensaver_theme,
            commands::show_in_folder,
            commands::get_wallpaper_accent,
            commands::set_hotcorner,
            commands::get_system_stats,
            commands::get_system_location,
            commands::list_apps,
            commands::launch_app,
            commands::get_app_icon,
            commands::get_now_playing,
            commands::media_control,
            commands::get_notifications,
            commands::clear_notification,
            commands::clear_all_notifications,
            commands::get_volume,
            commands::set_volume,
            commands::register_hotkey,
            commands::capture_screen,
            commands::capture_screen_base64,
            commands::write_binary_file,
            commands::read_binary_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Layer");
}
