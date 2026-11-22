use tauri_plugin_dialog::DialogExt;

/// The extensions an export may be saved with.
const EXTENSIONS: [&str; 3] = ["bib", "ris", "json"];

/// Saves exported references where the reader picks, in the system's
/// save dialog. The page names the file and its text; only the dialog
/// chooses where it goes, so the window can't write anywhere else.
/// Gives false when the reader cancels.
#[tauri::command]
pub async fn export_save(
    app: tauri::AppHandle,
    name: String,
    format: String,
    extension: String,
    text: String,
) -> Result<bool, String> {
    if !EXTENSIONS.contains(&extension.as_str()) {
        return Err("Binder can't save this kind of file.".into());
    }
    let picked = app
        .dialog()
        .file()
        .set_title("Export references")
        .set_file_name(&name)
        .add_filter(&format, &[extension.as_str()])
        .blocking_save_file();
    let Some(picked) = picked else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let path = with_extension(path, &extension);
    std::fs::write(&path, text)
        .map_err(|e| format!("Binder couldn't save {}: {e}", path.display()))?;
    Ok(true)
}

/// The path with the extension, when the dialog left it off.
fn with_extension(path: std::path::PathBuf, extension: &str) -> std::path::PathBuf {
    let has = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case(extension));
    if has {
        path
    } else {
        let mut name = path.file_name().unwrap_or_default().to_os_string();
        name.push(".");
        name.push(extension);
        path.with_file_name(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn adds_a_missing_extension() {
        assert_eq!(
            with_extension(PathBuf::from("/a/Thesis"), "bib"),
            PathBuf::from("/a/Thesis.bib")
        );
        assert_eq!(
            with_extension(PathBuf::from("/a/Thesis.BIB"), "bib"),
            PathBuf::from("/a/Thesis.BIB")
        );
        assert_eq!(
            with_extension(PathBuf::from("/a/Thesis.v2"), "ris"),
            PathBuf::from("/a/Thesis.v2.ris")
        );
    }
}
