use serde::{Deserialize, Serialize};

/// Aerodrome information from ROTAER/AIS Web
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AerodromeInfo {
    pub icao_code: String,
    pub name: String,
    pub city: String,
    pub state: String,
    pub arp_lat: f64,
    pub arp_lon: f64,
    pub elevation_ft: f64,
    pub magnetic_variation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_at: Option<String>,
}

/// Summary for search results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AerodromeSummary {
    pub icao_code: String,
    pub name: String,
    pub city: String,
    pub state: String,
}

/// RDL calculation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdlResult {
    /// Magnetic radial FROM the aerodrome TO the point (0-360)
    pub radial_magnetic: f64,
    /// True radial FROM the aerodrome TO the point (0-360)
    pub radial_true: f64,
    /// Distance in nautical miles
    pub distance_nm: f64,
    /// Magnetic declination used (negative = West)
    pub magnetic_declination: f64,
    /// Aerodrome ICAO code
    pub aerodrome_icao: String,
    /// Aerodrome name
    pub aerodrome_name: String,
    /// Aerodrome ARP coordinates
    pub aerodrome_lat: f64,
    pub aerodrome_lon: f64,
    /// Point coordinates
    pub point_lat: f64,
    pub point_lon: f64,
    /// Formatted RDL string (e.g., "247/15.3")
    pub formatted: String,
    /// Timestamp ISO 8601
    pub timestamp: String,
}

/// Point for batch calculations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub lat: f64,
    pub lon: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Navigation point - can be an aerodrome or a navigation fix (waypoint/VOR/NDB)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavPoint {
    /// Identifier (ICAO code for AD, or fix name like "UXAM", "PMS")
    pub identifier: String,
    /// Type: "AD" (aerodrome), "WPT" (waypoint), "VOR", "NDB"
    pub point_type: String,
    /// Name or description
    pub name: String,
    /// Latitude in decimal degrees
    pub lat: f64,
    /// Longitude in decimal degrees
    pub lon: f64,
    /// Additional info (city/state for AD, route for fixes)
    pub info: String,
    /// Source: "api", "cache", "default"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_at: Option<String>,
}

/// API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub api_key: String,
    pub api_pass: String,
    pub default_aerodrome: String,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            api_key: "1131205333".to_string(),
            api_pass: "426320c8-30a9-11f0-a1fe-0050569ac2e1".to_string(),
            default_aerodrome: "SBPJ".to_string(),
        }
    }
}
