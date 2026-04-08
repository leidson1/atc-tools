use crate::aisweb::cache::AerodromeCache;
use crate::aisweb::models::{AerodromeInfo, NavPoint};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;

/// Embedded aerodrome data from ROTAER (downloaded from AIS Web API)
const AERODROMES_JSON: &str = include_str!("../../data_aerodromes.json");

/// Embedded waypoint data (downloaded from AIS Web API)
const WAYPOINTS_JSON: &str = include_str!("../../data_waypoints.json");

#[derive(Deserialize)]
struct RawAerodrome {
    icao: String,
    name: String,
    city: String,
    uf: String,
    lat: f64,
    lon: f64,
}

#[derive(Deserialize)]
struct RawWaypoint {
    id: String,
    lat: f64,
    lon: f64,
}

/// Waypoint cache for offline lookups
pub struct WaypointCache {
    pub data: Mutex<HashMap<String, NavPoint>>,
}

impl Default for WaypointCache {
    fn default() -> Self {
        Self {
            data: Mutex::new(HashMap::new()),
        }
    }
}

impl WaypointCache {
    pub fn get(&self, ident: &str) -> Option<NavPoint> {
        let data = self.data.lock().ok()?;
        data.get(&ident.to_uppercase()).cloned()
    }

    pub fn len(&self) -> usize {
        self.data.lock().map(|d| d.len()).unwrap_or(0)
    }
}

/// Loads all embedded aerodromes into the cache.
/// Called once at app startup.
pub fn load_embedded_aerodromes(cache: &AerodromeCache) -> usize {
    let raw: Vec<RawAerodrome> = match serde_json::from_str(AERODROMES_JSON) {
        Ok(data) => data,
        Err(e) => {
            log::error!("Erro ao carregar aeródromos embutidos: {}", e);
            return 0;
        }
    };

    let mut count = 0;
    for ad in raw {
        cache.insert(AerodromeInfo {
            icao_code: ad.icao,
            name: ad.name,
            city: ad.city,
            state: ad.uf,
            arp_lat: ad.lat,
            arp_lon: ad.lon,
            elevation_ft: 0.0,
            magnetic_variation: None,
            cached_at: Some("embedded".to_string()),
        });
        count += 1;
    }

    count
}

/// Loads all embedded waypoints into the waypoint cache.
/// Called once at app startup.
pub fn load_embedded_waypoints(cache: &WaypointCache) -> usize {
    let raw: Vec<RawWaypoint> = match serde_json::from_str(WAYPOINTS_JSON) {
        Ok(data) => data,
        Err(e) => {
            log::error!("Erro ao carregar waypoints embutidos: {}", e);
            return 0;
        }
    };

    let mut count = 0;
    if let Ok(mut data) = cache.data.lock() {
        for wpt in raw {
            data.insert(
                wpt.id.to_uppercase(),
                NavPoint {
                    identifier: wpt.id.to_uppercase(),
                    point_type: "WPT".to_string(),
                    name: wpt.id.clone(),
                    lat: wpt.lat,
                    lon: wpt.lon,
                    info: String::new(),
                    cached_at: Some("embedded".to_string()),
                },
            );
            count += 1;
        }
    }

    count
}
