use crate::aisweb::models::ApiConfig;
use tauri::State;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn get_api_config(
    config: State<'_, std::sync::Mutex<ApiConfig>>,
) -> Result<ApiConfig, String> {
    let cfg = config
        .lock()
        .map_err(|e| format!("Erro ao acessar configuração: {}", e))?;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn save_api_config(
    api_key: String,
    api_pass: String,
    default_aerodrome: String,
    config: State<'_, std::sync::Mutex<ApiConfig>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Update in-memory config
    {
        let mut cfg = config
            .lock()
            .map_err(|e| format!("Erro ao acessar configuração: {}", e))?;
        cfg.api_key = api_key.clone();
        cfg.api_pass = api_pass.clone();
        cfg.default_aerodrome = if default_aerodrome.is_empty() {
            "SBPJ".to_string()
        } else {
            default_aerodrome.to_uppercase()
        };
    }

    // Persist to store
    let store = app
        .store("config.json")
        .map_err(|e| format!("Erro ao abrir store: {}", e))?;

    store.set("api_key", serde_json::json!(api_key));
    store.set("api_pass", serde_json::json!(api_pass));
    store.set(
        "default_aerodrome",
        serde_json::json!(default_aerodrome.to_uppercase()),
    );

    store
        .save()
        .map_err(|e| format!("Erro ao salvar configuração: {}", e))?;

    Ok(())
}

/// Loads configuration from persistent store on app startup
pub fn load_config_from_store<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> ApiConfig {
    let store = match app.store("config.json") {
        Ok(s) => s,
        Err(_) => return ApiConfig::default(),
    };

    let api_key = store
        .get("api_key")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from))
        .unwrap_or_default();

    let api_pass = store
        .get("api_pass")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from))
        .unwrap_or_default();

    let default_aerodrome = store
        .get("default_aerodrome")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from))
        .unwrap_or_else(|| "SBPJ".to_string());

    ApiConfig {
        api_key,
        api_pass,
        default_aerodrome,
    }
}
