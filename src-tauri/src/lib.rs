mod aisweb;
mod commands;
mod error;
mod navigation;

use aisweb::{
    cache::AerodromeCache,
    embedded_data::{self, WaypointCache},
    models::ApiConfig,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ad_cache = AerodromeCache::default();
    let wpt_cache = WaypointCache::default();

    // Load embedded data (hardcoded in the binary)
    let ad_count = embedded_data::load_embedded_aerodromes(&ad_cache);
    let wpt_count = embedded_data::load_embedded_waypoints(&wpt_cache);

    // Also load hardcoded defaults (with elevation/mag_var data)
    ad_cache.load_defaults();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(ad_cache)
        .manage(wpt_cache)
        .manage(std::sync::Mutex::new(ApiConfig::default()))
        .setup(move |app| {
            log::info!(
                "Dados embutidos: {} aeródromos, {} waypoints",
                ad_count, wpt_count
            );

            // Load persisted config
            let config = commands::settings::load_config_from_store(&app.handle());
            let state = app.state::<std::sync::Mutex<ApiConfig>>();
            if let Ok(mut cfg) = state.lock() {
                *cfg = config;
            }

            // Load persisted aerodromes (from API calls) - these override embedded data
            let cache = app.state::<AerodromeCache>();
            commands::aerodrome::load_aerodromes_from_store(&app.handle(), &cache);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::aerodrome::search_aerodrome,
            commands::aerodrome::get_aerodrome_info,
            commands::aerodrome::list_cached_aerodromes,
            commands::aerodrome::lookup_point,
            commands::calculation::calculate_rdl,
            commands::calculation::calculate_rdl_batch,
            commands::settings::get_api_config,
            commands::settings::save_api_config,
            commands::sync::sync_rotaer,
            commands::sync::get_cache_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
