use crate::aisweb::models::AerodromeInfo;
use std::collections::HashMap;
use std::sync::Mutex;

/// In-memory cache for aerodrome data
pub struct AerodromeCache {
    pub data: Mutex<HashMap<String, AerodromeInfo>>,
}

impl Default for AerodromeCache {
    fn default() -> Self {
        Self {
            data: Mutex::new(HashMap::new()),
        }
    }
}

impl AerodromeCache {
    pub fn get(&self, icao: &str) -> Option<AerodromeInfo> {
        let data = self.data.lock().ok()?;
        data.get(&icao.to_uppercase()).cloned()
    }

    pub fn insert(&self, info: AerodromeInfo) {
        if let Ok(mut data) = self.data.lock() {
            data.insert(info.icao_code.clone(), info);
        }
    }

    pub fn list_all(&self) -> Vec<AerodromeInfo> {
        self.data
            .lock()
            .map(|data| data.values().cloned().collect())
            .unwrap_or_default()
    }

    /// Loads hardcoded major Brazilian aerodromes as fallback
    pub fn load_defaults(&self) {
        let defaults = vec![
            AerodromeInfo {
                icao_code: "SBPJ".to_string(),
                name: "Brigadeiro Lysias Rodrigues".to_string(),
                city: "Palmas".to_string(),
                state: "TO".to_string(),
                arp_lat: -10.2914,
                arp_lon: -48.3569,
                elevation_ft: 774.0,
                magnetic_variation: Some(-21.5),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBBR".to_string(),
                name: "Presidente Juscelino Kubitschek".to_string(),
                city: "Brasília".to_string(),
                state: "DF".to_string(),
                arp_lat: -15.8711,
                arp_lon: -47.9186,
                elevation_ft: 3497.0,
                magnetic_variation: Some(-22.0),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBGR".to_string(),
                name: "Guarulhos - Gov André Franco Montoro".to_string(),
                city: "Guarulhos".to_string(),
                state: "SP".to_string(),
                arp_lat: -23.4356,
                arp_lon: -46.4731,
                elevation_ft: 2459.0,
                magnetic_variation: Some(-22.5),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBGL".to_string(),
                name: "Galeão - Antonio Carlos Jobim".to_string(),
                city: "Rio de Janeiro".to_string(),
                state: "RJ".to_string(),
                arp_lat: -22.8100,
                arp_lon: -43.2506,
                elevation_ft: 28.0,
                magnetic_variation: Some(-23.0),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBEG".to_string(),
                name: "Eduardo Gomes".to_string(),
                city: "Manaus".to_string(),
                state: "AM".to_string(),
                arp_lat: -3.0386,
                arp_lon: -60.0497,
                elevation_ft: 264.0,
                magnetic_variation: Some(-15.0),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBRF".to_string(),
                name: "Guararapes - Gilberto Freyre".to_string(),
                city: "Recife".to_string(),
                state: "PE".to_string(),
                arp_lat: -8.1264,
                arp_lon: -34.9231,
                elevation_ft: 33.0,
                magnetic_variation: Some(-22.0),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBBE".to_string(),
                name: "Val de Cans - Júlio Cezar Ribeiro".to_string(),
                city: "Belém".to_string(),
                state: "PA".to_string(),
                arp_lat: -1.3792,
                arp_lon: -48.4764,
                elevation_ft: 54.0,
                magnetic_variation: Some(-20.5),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBCF".to_string(),
                name: "Tancredo Neves".to_string(),
                city: "Confins".to_string(),
                state: "MG".to_string(),
                arp_lat: -19.6244,
                arp_lon: -43.9719,
                elevation_ft: 2715.0,
                magnetic_variation: Some(-22.5),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBSV".to_string(),
                name: "Deputado Luís Eduardo Magalhães".to_string(),
                city: "Salvador".to_string(),
                state: "BA".to_string(),
                arp_lat: -12.9086,
                arp_lon: -38.3225,
                elevation_ft: 64.0,
                magnetic_variation: Some(-22.5),
                cached_at: Some("default".to_string()),
            },
            AerodromeInfo {
                icao_code: "SBPA".to_string(),
                name: "Salgado Filho".to_string(),
                city: "Porto Alegre".to_string(),
                state: "RS".to_string(),
                arp_lat: -29.9944,
                arp_lon: -51.1714,
                elevation_ft: 11.0,
                magnetic_variation: Some(-19.0),
                cached_at: Some("default".to_string()),
            },
        ];

        if let Ok(mut data) = self.data.lock() {
            for ad in defaults {
                data.entry(ad.icao_code.clone()).or_insert(ad);
            }
        }
    }
}
