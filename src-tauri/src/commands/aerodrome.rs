use crate::aisweb::{cache::AerodromeCache, client, embedded_data::WaypointCache, models::*};
use tauri::State;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn search_aerodrome(
    query: String,
    cache: State<'_, AerodromeCache>,
) -> Result<Vec<AerodromeSummary>, String> {
    let all = cache.list_all();
    Ok(client::search_in_list(&all, &query))
}

#[tauri::command]
pub async fn get_aerodrome_info(
    icao: String,
    api_config: State<'_, std::sync::Mutex<ApiConfig>>,
    cache: State<'_, AerodromeCache>,
    app: tauri::AppHandle,
) -> Result<AerodromeInfo, String> {
    let icao = icao.to_uppercase();

    // Check cache first - if it was fetched from API (not default), return it
    if let Some(info) = cache.get(&icao) {
        if info.cached_at.as_deref() != Some("default") {
            return Ok(info);
        }
    }

    // Try to fetch from API
    let config = api_config
        .lock()
        .map_err(|e| format!("Erro ao acessar configuração: {}", e))?
        .clone();

    if !config.api_key.is_empty() && !config.api_pass.is_empty() {
        match client::fetch_aerodrome(&config.api_key, &config.api_pass, &icao).await {
            Ok(info) => {
                // Save to in-memory cache
                cache.insert(info.clone());

                // Persist to store so we never need to fetch again
                persist_aerodrome_to_store(&app, &info);

                return Ok(info);
            }
            Err(e) => {
                log::warn!("Falha ao buscar {} da API: {}", icao, e);
            }
        }
    }

    // Return cached/default if available
    cache
        .get(&icao)
        .ok_or_else(|| format!("Aeródromo {} não encontrado. Configure a API Key nas configurações.", icao))
}

#[tauri::command]
pub async fn list_cached_aerodromes(
    cache: State<'_, AerodromeCache>,
) -> Result<Vec<AerodromeSummary>, String> {
    let all = cache.list_all();
    let mut summaries: Vec<AerodromeSummary> = all
        .iter()
        .map(|a| AerodromeSummary {
            icao_code: a.icao_code.clone(),
            name: a.name.clone(),
            city: a.city.clone(),
            state: a.state.clone(),
        })
        .collect();

    // Sort alphabetically by ICAO
    summaries.sort_by(|a, b| a.icao_code.cmp(&b.icao_code));
    Ok(summaries)
}

/// Universal lookup: searches for an identifier as aerodrome in cache or API.
/// This is the main command used by the frontend - user types any ICAO identifier.
#[tauri::command]
pub async fn lookup_point(
    identifier: String,
    api_config: State<'_, std::sync::Mutex<ApiConfig>>,
    cache: State<'_, AerodromeCache>,
    wpt_cache: State<'_, WaypointCache>,
    app: tauri::AppHandle,
) -> Result<NavPoint, String> {
    let id = identifier.trim().to_uppercase();

    // 1. Check aerodrome cache (embedded + API fetched + defaults)
    if let Some(info) = cache.get(&id) {
        return Ok(client::aerodrome_to_navpoint(&info));
    }

    // 2. Check waypoint cache (6756 embedded waypoints)
    if let Some(wpt) = wpt_cache.get(&id) {
        return Ok(wpt);
    }

    // 3. Try to fetch from AIS Web API (ROTAER) - for ADs not in embedded data
    let config = api_config
        .lock()
        .map_err(|e| format!("Erro: {}", e))?
        .clone();

    if !config.api_key.is_empty() && !config.api_pass.is_empty() {
        match client::fetch_aerodrome(&config.api_key, &config.api_pass, &id).await {
            Ok(info) => {
                cache.insert(info.clone());
                persist_aerodrome_to_store(&app, &info);
                log::info!("Aeródromo {} buscado da API e salvo no cache", id);
                return Ok(client::aerodrome_to_navpoint(&info));
            }
            Err(e) => {
                log::info!("'{}' não encontrado na API: {}", id, e);
            }
        }
    }

    Err(format!(
        "'{}' não encontrado como aeródromo nem como waypoint.",
        id
    ))
}

/// Saves an aerodrome to the persistent store
fn persist_aerodrome_to_store(app: &tauri::AppHandle, info: &AerodromeInfo) {
    let store = match app.store("aerodromes.json") {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Não foi possível abrir store de aeródromos: {}", e);
            return;
        }
    };

    let key = format!("ad_{}", info.icao_code);
    if let Ok(json) = serde_json::to_value(info) {
        store.set(&key, json);
        if let Err(e) = store.save() {
            log::warn!("Erro ao salvar aeródromo no store: {}", e);
        }
    }
}

/// Loads all persisted aerodromes from store into the in-memory cache on startup
pub fn load_aerodromes_from_store<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cache: &AerodromeCache,
) {
    let store = match app.store("aerodromes.json") {
        Ok(s) => s,
        Err(_) => return,
    };

    let keys = store.keys();

    let mut count = 0;
    for key in keys {
        if key.starts_with("ad_") {
            if let Some(value) = store.get(key.as_str()) {
                if let Ok(info) = serde_json::from_value::<AerodromeInfo>(value.clone()) {
                    cache.insert(info);
                    count += 1;
                }
            }
        }
    }

    if count > 0 {
        log::info!("Carregados {} aeródromos do cache persistente", count);
    }
}
