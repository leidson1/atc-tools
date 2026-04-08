use crate::aisweb::{cache::AerodromeCache, models::*};
use crate::error::AppError;
use tauri::{Emitter, State};
use tauri_plugin_http::reqwest;
use tauri_plugin_store::StoreExt;

const AISWEB_BASE_URL: &str = "https://aisweb.decea.mil.br/api/";

/// All Brazilian states (UF)
const ESTADOS: &[&str] = &[
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
    "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
    "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

/// Progress event emitted during sync
#[derive(Clone, serde::Serialize)]
pub struct SyncProgress {
    pub current: usize,
    pub total: usize,
    pub state_uf: String,
    pub status: String,
    pub message: String,
    pub aerodromes_found: usize,
}

/// Sync result summary
#[derive(Clone, serde::Serialize)]
pub struct SyncResult {
    pub total_aerodromes: usize,
    pub total_states: usize,
    pub errors: usize,
}

/// Syncs ALL aerodromes from ROTAER by querying each Brazilian state.
/// The API returns paginated results (100 per page) with lat/lng for each AD.
/// Emits "sync-progress" events for the frontend progress bar.
#[tauri::command]
pub async fn sync_rotaer(
    api_config: State<'_, std::sync::Mutex<ApiConfig>>,
    cache: State<'_, AerodromeCache>,
    app: tauri::AppHandle,
) -> Result<SyncResult, String> {
    let config = api_config
        .lock()
        .map_err(|e| format!("Erro: {}", e))?
        .clone();

    if config.api_key.is_empty() || config.api_pass.is_empty() {
        return Err("API Key não configurada.".to_string());
    }

    let store = app
        .store("aerodromes.json")
        .map_err(|e| format!("Erro ao abrir store: {}", e))?;

    let total_states = ESTADOS.len();
    let mut total_aerodromes = 0;
    let mut errors = 0;

    let client = reqwest::Client::new();

    for (i, uf) in ESTADOS.iter().enumerate() {
        let mut page = 1;
        let mut state_count = 0;

        loop {
            let url = format!(
                "{}?apiKey={}&apiPass={}&area=rotaer&uf={}&page={}",
                AISWEB_BASE_URL, config.api_key, config.api_pass, uf, page
            );

            match fetch_rotaer_page(&client, &url).await {
                Ok(aerodromes) => {
                    let count = aerodromes.len();
                    if count == 0 {
                        break; // No more pages
                    }

                    for info in &aerodromes {
                        cache.insert(info.clone());
                        let key = format!("ad_{}", info.icao_code);
                        if let Ok(json) = serde_json::to_value(info) {
                            store.set(&key, json);
                        }
                    }

                    state_count += count;
                    total_aerodromes += count;

                    if count < 100 {
                        break; // Last page
                    }
                    page += 1;
                }
                Err(e) => {
                    log::warn!("Erro ao buscar {}/pag {}: {}", uf, page, e);
                    errors += 1;
                    break;
                }
            }

            // Small delay between pages
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        let _ = app.emit("sync-progress", SyncProgress {
            current: i + 1,
            total: total_states,
            state_uf: uf.to_string(),
            status: if state_count > 0 { "ok".to_string() } else { "empty".to_string() },
            message: format!("{}: {} aeródromos", uf, state_count),
            aerodromes_found: total_aerodromes,
        });

        // Delay between states
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // Save everything to disk
    if let Err(e) = store.save() {
        log::warn!("Erro ao salvar store: {}", e);
    }

    log::info!(
        "Sync ROTAER completo: {} aeródromos de {} estados ({} erros)",
        total_aerodromes, total_states, errors
    );

    Ok(SyncResult {
        total_aerodromes,
        total_states,
        errors,
    })
}

/// Fetches one page of ROTAER results and parses all items
async fn fetch_rotaer_page(
    client: &reqwest::Client,
    url: &str,
) -> Result<Vec<AerodromeInfo>, AppError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Erro de conexão: {}", e)))?;

    let body = response
        .text()
        .await
        .map_err(|e| AppError::Network(format!("Erro ao ler: {}", e)))?;

    parse_rotaer_list(&body)
}

/// Parses the bulk ROTAER XML response with multiple <item> elements
fn parse_rotaer_list(xml: &str) -> Result<Vec<AerodromeInfo>, AppError> {
    let mut aerodromes = Vec::new();
    let mut search_from = 0;

    let now = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        format!("{}", d.as_secs())
    };

    loop {
        // Find next <item
        let item_start = match xml[search_from..].find("<item") {
            Some(pos) => search_from + pos,
            None => break,
        };

        // Find closing </item>
        let item_end = match xml[item_start..].find("</item>") {
            Some(pos) => item_start + pos + 7,
            None => break,
        };

        let item_xml = &xml[item_start..item_end];

        // Parse individual item
        if let Some(info) = parse_item(item_xml, &now) {
            aerodromes.push(info);
        }

        search_from = item_end;
    }

    Ok(aerodromes)
}

/// Parses a single <item> element from the bulk response
fn parse_item(xml: &str, timestamp: &str) -> Option<AerodromeInfo> {
    let icao = extract_field(xml, "AeroCode")?;
    let lat = extract_field(xml, "lat")?.parse::<f64>().ok()?;
    let lng = extract_field(xml, "lng")?.parse::<f64>().ok()?;

    let name = extract_cdata(xml, "name")
        .or_else(|| extract_field(xml, "name"))
        .unwrap_or_else(|| icao.clone());

    let city = extract_cdata(xml, "city")
        .or_else(|| extract_field(xml, "city"))
        .unwrap_or_default();

    let state = extract_field(xml, "uf").unwrap_or_default();

    Some(AerodromeInfo {
        icao_code: icao,
        name,
        city,
        state,
        arp_lat: lat,
        arp_lon: lng,
        elevation_ft: 0.0, // Not in bulk response, will be fetched on individual lookup
        magnetic_variation: None,
        cached_at: Some(timestamp.to_string()),
    })
}

fn extract_field(xml: &str, field: &str) -> Option<String> {
    let open = format!("<{}>", field);
    let close = format!("</{}>", field);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let val = xml[start..end].trim().to_string();
    if val.is_empty() { None } else { Some(val) }
}

fn extract_cdata(xml: &str, field: &str) -> Option<String> {
    let open = format!("<{}>", field);
    let close = format!("</{}>", field);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let content = xml[start..end].trim();

    if content.contains("<![CDATA[") {
        let cs = content.find("<![CDATA[")? + 9;
        let ce = content.find("]]>")?;
        let val = content[cs..ce].trim().to_string();
        if val.is_empty() { None } else { Some(val) }
    } else if content.is_empty() {
        None
    } else {
        Some(content.to_string())
    }
}

/// Returns the current cache stats
#[tauri::command]
pub async fn get_cache_stats(
    cache: State<'_, AerodromeCache>,
    wpt_cache: State<'_, crate::aisweb::embedded_data::WaypointCache>,
) -> Result<CacheStats, String> {
    let all = cache.list_all();
    let from_api = all.iter().filter(|a| {
        let c = a.cached_at.as_deref();
        c != Some("default") && c != Some("embedded")
    }).count();
    let embedded = all.iter().filter(|a| {
        a.cached_at.as_deref() == Some("embedded") || a.cached_at.as_deref() == Some("default")
    }).count();
    let waypoints = wpt_cache.len();

    Ok(CacheStats {
        total_ads: all.len(),
        from_api,
        embedded,
        waypoints,
    })
}

#[derive(Clone, serde::Serialize)]
pub struct CacheStats {
    pub total_ads: usize,
    pub from_api: usize,
    pub embedded: usize,
    pub waypoints: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_rotaer_list() {
        let xml = r#"<?xml version="1.0"?><aisweb>
        <rotaer pagesize="100" total="2">
          <item ciad_id="123">
            <AeroCode>SBPJ</AeroCode>
            <name><![CDATA[Brigadeiro Lysias Rodrigues]]></name>
            <city><![CDATA[Palmas]]></city>
            <uf>TO</uf>
            <lat>-10.29</lat>
            <lng>-48.357</lng>
          </item>
          <item ciad_id="456">
            <AeroCode>SDNC</AeroCode>
            <name><![CDATA[Fazenda Cabeceira]]></name>
            <city><![CDATA[Dom Aquino]]></city>
            <uf>MT</uf>
            <lat>-15.43</lat>
            <lng>-54.737</lng>
          </item>
        </rotaer></aisweb>"#;

        let result = parse_rotaer_list(xml).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].icao_code, "SBPJ");
        assert_eq!(result[0].name, "Brigadeiro Lysias Rodrigues");
        assert!((result[0].arp_lat - (-10.29)).abs() < 0.01);
        assert_eq!(result[1].icao_code, "SDNC");
        assert_eq!(result[1].city, "Dom Aquino");
    }
}
