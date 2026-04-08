use crate::aisweb::{cache::AerodromeCache, models::*};
use crate::navigation::{bearing, haversine, magnetic};
use tauri::State;

#[tauri::command]
pub async fn calculate_rdl(
    aerodrome_icao: String,
    point_lat: f64,
    point_lon: f64,
    _api_config: State<'_, std::sync::Mutex<ApiConfig>>,
    cache: State<'_, AerodromeCache>,
) -> Result<RdlResult, String> {
    let icao = aerodrome_icao.to_uppercase();

    // Get aerodrome info
    let aero = cache
        .get(&icao)
        .ok_or_else(|| format!("Aeródromo {} não encontrado no cache", icao))?;

    // Calculate true bearing FROM aerodrome TO point
    let true_brg = bearing::true_bearing(aero.arp_lat, aero.arp_lon, point_lat, point_lon);

    // Get magnetic declination
    let decl = aero
        .magnetic_variation
        .unwrap_or_else(|| magnetic::magnetic_declination(aero.arp_lat, aero.arp_lon));

    // Convert to magnetic bearing
    let mag_brg = bearing::normalize_bearing(true_brg - decl);

    // Calculate distance
    let dist = haversine::distance_nm(aero.arp_lat, aero.arp_lon, point_lat, point_lon);

    // Format as ATC standard: "RDL 247/15.3"
    let formatted = format!("{:03.0}/{:.1}", mag_brg, dist);

    // Timestamp
    let timestamp = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}", secs)
    };

    Ok(RdlResult {
        radial_magnetic: (mag_brg * 10.0).round() / 10.0,
        radial_true: (true_brg * 10.0).round() / 10.0,
        distance_nm: (dist * 10.0).round() / 10.0,
        magnetic_declination: decl,
        aerodrome_icao: icao,
        aerodrome_name: aero.name.clone(),
        aerodrome_lat: aero.arp_lat,
        aerodrome_lon: aero.arp_lon,
        point_lat,
        point_lon,
        formatted,
        timestamp,
    })
}

#[tauri::command]
pub async fn calculate_rdl_batch(
    aerodrome_icao: String,
    points: Vec<Point>,
    _api_config: State<'_, std::sync::Mutex<ApiConfig>>,
    cache: State<'_, AerodromeCache>,
) -> Result<Vec<RdlResult>, String> {
    let icao = aerodrome_icao.to_uppercase();

    let aero = cache
        .get(&icao)
        .ok_or_else(|| format!("Aeródromo {} não encontrado no cache", icao))?;

    let decl = aero
        .magnetic_variation
        .unwrap_or_else(|| magnetic::magnetic_declination(aero.arp_lat, aero.arp_lon));

    let timestamp = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}", secs)
    };

    let results: Vec<RdlResult> = points
        .iter()
        .map(|p| {
            let true_brg = bearing::true_bearing(aero.arp_lat, aero.arp_lon, p.lat, p.lon);
            let mag_brg = bearing::normalize_bearing(true_brg - decl);
            let dist = haversine::distance_nm(aero.arp_lat, aero.arp_lon, p.lat, p.lon);
            let formatted = format!("{:03.0}/{:.1}", mag_brg, dist);

            RdlResult {
                radial_magnetic: (mag_brg * 10.0).round() / 10.0,
                radial_true: (true_brg * 10.0).round() / 10.0,
                distance_nm: (dist * 10.0).round() / 10.0,
                magnetic_declination: decl,
                aerodrome_icao: icao.clone(),
                aerodrome_name: aero.name.clone(),
                aerodrome_lat: aero.arp_lat,
                aerodrome_lon: aero.arp_lon,
                point_lat: p.lat,
                point_lon: p.lon,
                formatted,
                timestamp: timestamp.clone(),
            }
        })
        .collect();

    Ok(results)
}
