mod account;
mod assistant;
mod assistant_server;
mod crash;
mod export;
mod files;
mod history;
mod link;
mod links;
mod project;
mod projects;
mod web;
mod zotero;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(assistant::Requests::default())
        .setup(|app| {
            crash::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crash::take_last_crash,
            project::project_load,
            project::project_write_page,
            project::project_create_folder,
            project::project_rename,
            project::project_remove,
            history::project_history_list,
            history::project_history_keep,
            project::project_files,
            project::project_read_file,
            project::project_write_file,
            project::project_open_file,
            projects::binders_list,
            projects::binders_create,
            projects::binders_opened,
            projects::binders_pick,
            projects::binders_rename,
            projects::binders_trash,
            account::account_signed_in,
            account::account_server,
            account::account_sign_in,
            account::account_cancel_sign_in,
            account::account_sign_out,
            account::server_request,
            link::link_load,
            link::link_save,
            link::link_remove,
            files::link_upload_file,
            files::link_download_file,
            zotero::zotero_local_fetch,
            zotero::zotero_key_kept,
            zotero::zotero_cloud_fetch,
            zotero::zotero_key_set,
            zotero::zotero_key_delete,
            zotero::bibtex_read,
            export::export_save,
            links::open_in_browser,
            web::web_fetch,
            web::web_download,
            assistant::assistant_key_exists,
            assistant::assistant_key_set,
            assistant::assistant_key_delete,
            assistant::assistant_models,
            assistant::assistant_chat,
            assistant_server::assistant_turn,
            assistant::assistant_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Binder");
}
