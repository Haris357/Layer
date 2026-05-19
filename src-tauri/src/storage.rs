use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn layer_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("Layer");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

pub fn canvas_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(layer_dir(app)?.join("canvas.json"))
}

pub fn journal_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(layer_dir(app)?.join("journal.json"))
}

pub fn templates_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(layer_dir(app)?.join("templates.json"))
}

pub fn read_templates(app: &AppHandle) -> Result<String, String> {
    let path = templates_file(app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn write_templates(app: &AppHandle, json: &str) -> Result<(), String> {
    let path = templates_file(app)?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn read_journal(app: &AppHandle) -> Result<String, String> {
    let path = journal_file(app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn write_journal(app: &AppHandle, json: &str) -> Result<(), String> {
    let path = journal_file(app)?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = layer_dir(app)?.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn read_canvas(app: &AppHandle) -> Result<String, String> {
    let path = canvas_file(app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn write_canvas(app: &AppHandle, json: &str) -> Result<(), String> {
    let path = canvas_file(app)?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn clear_canvas(app: &AppHandle) -> Result<(), String> {
    let path = canvas_file(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let assets = assets_dir(app)?;
    if assets.exists() {
        for entry in fs::read_dir(&assets).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}
