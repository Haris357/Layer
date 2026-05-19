mod commands;
mod storage;
mod window;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("toggle-mode", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            window::setup_window(app)?;
            let _ = app.global_shortcut().register("CmdOrControl+Shift+Space");

            let toggle_item =
                MenuItemBuilder::with_id("toggle", "Toggle edit mode").build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", "Quit Layer").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Layer — click to toggle edit mode")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        let _ = app.emit("toggle-mode", ());
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
            commands::save_templates,
            commands::load_templates,
            commands::write_text_file,
            commands::read_text_file,
            commands::reset_all,
            commands::open_url,
            commands::import_asset,
            commands::delete_asset,
            commands::quit_app,
            commands::get_app_version,
            commands::get_system_stats,
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
