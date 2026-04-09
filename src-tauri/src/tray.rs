use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

pub fn setup_tray(app: &AppHandle) -> Result<tauri::tray::TrayIcon, Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Flock", true, None::<&str>)?;
    let new_claude = MenuItem::with_id(app, "new_claude", "New Claude Pane", true, None::<&str>)?;
    let new_shell = MenuItem::with_id(app, "new_shell", "New Shell Pane", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &new_claude, &new_shell, &quit])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "new_claude" => {
                let _ = app.emit("tray-new-pane", "claude");
            }
            "new_shell" => {
                let _ = app.emit("tray-new-pane", "shell");
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(tray)
}
