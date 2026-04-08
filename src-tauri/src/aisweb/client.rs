use crate::aisweb::models::{AerodromeInfo, AerodromeSummary, NavPoint};
use crate::error::AppError;
use tauri_plugin_http::reqwest;

const AISWEB_BASE_URL: &str = "https://aisweb.decea.mil.br/api/";

/// Fetches aerodrome information from AIS Web API (ROTAER)
pub async fn fetch_aerodrome(
    api_key: &str,
    api_pass: &str,
    icao_code: &str,
) -> Result<AerodromeInfo, AppError> {
    let url = format!(
        "{}?apiKey={}&apiPass={}&area=rotaer&icaoCode={}",
        AISWEB_BASE_URL, api_key, api_pass, icao_code
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Erro de conexão com AIS Web: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Api(format!(
            "AIS Web retornou status {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|e| AppError::Network(format!("Erro ao ler resposta: {}", e)))?;

    // Check for API error
    if body.contains("<msg>") && body.contains("error") {
        let msg = extract_xml_field(&body, "msg").unwrap_or_else(|| "Erro desconhecido".to_string());
        return Err(AppError::Api(msg));
    }

    parse_rotaer_response(&body, icao_code)
}

/// Parses the XML response from AIS Web ROTAER endpoint.
/// Fields: <lat>, <lng>, <AeroCode>, <name> (CDATA), <city> (CDATA), <uf>, <altFt>
fn parse_rotaer_response(xml: &str, icao_code: &str) -> Result<AerodromeInfo, AppError> {
    // Check if aerodrome was found
    let aero_code = extract_xml_field(xml, "AeroCode");
    if aero_code.is_none() {
        return Err(AppError::NotFound(format!(
            "Aeródromo {} não encontrado no ROTAER",
            icao_code
        )));
    }

    let name = extract_cdata_field(xml, "name")
        .or_else(|| extract_xml_field(xml, "name"))
        .unwrap_or_else(|| icao_code.to_string());

    let city = extract_cdata_field(xml, "city")
        .or_else(|| extract_xml_field(xml, "city"))
        .unwrap_or_default();

    let state = extract_xml_field(xml, "uf").unwrap_or_default();

    // Coordinates: <lat> and <lng> are decimal degrees
    let lat = extract_xml_field(xml, "lat")
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| AppError::Parse(format!("Latitude não encontrada para {}", icao_code)))?;

    let lon = extract_xml_field(xml, "lng")
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| AppError::Parse(format!("Longitude não encontrada para {}", icao_code)))?;

    let elevation_ft = extract_xml_field(xml, "altFt")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let now = chrono_now_iso();

    Ok(AerodromeInfo {
        icao_code: icao_code.to_uppercase(),
        name,
        city,
        state,
        arp_lat: lat,
        arp_lon: lon,
        elevation_ft,
        magnetic_variation: None, // API doesn't provide this directly
        cached_at: Some(now),
    })
}

/// Extracts text from a simple XML tag: <tag>value</tag>
fn extract_xml_field(xml: &str, field: &str) -> Option<String> {
    let open_tag = format!("<{}", field);
    let close_tag = format!("</{}>", field);

    let start = xml.find(&open_tag)?;
    let tag_end = xml[start..].find('>')? + start + 1;
    let end = xml[tag_end..].find(&close_tag)? + tag_end;

    let value = xml[tag_end..end].trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Extracts text from a CDATA XML tag: <tag><![CDATA[value]]></tag>
fn extract_cdata_field(xml: &str, field: &str) -> Option<String> {
    let open_tag = format!("<{}", field);
    let close_tag = format!("</{}>", field);

    let start = xml.find(&open_tag)?;
    let tag_end = xml[start..].find('>')? + start + 1;
    let end = xml[tag_end..].find(&close_tag)? + tag_end;

    let content = xml[tag_end..end].trim();

    // Extract from CDATA if present
    if content.contains("<![CDATA[") {
        let cdata_start = content.find("<![CDATA[")? + 9;
        let cdata_end = content.find("]]>")?;
        let value = content[cdata_start..cdata_end].trim().to_string();
        if value.is_empty() { None } else { Some(value) }
    } else if content.is_empty() {
        None
    } else {
        Some(content.to_string())
    }
}

/// Returns current timestamp
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_secs())
}

/// Searches for aerodromes matching a query (from cached data)
pub fn search_in_list(
    aerodromes: &[AerodromeInfo],
    query: &str,
) -> Vec<AerodromeSummary> {
    let q = query.to_uppercase();
    aerodromes
        .iter()
        .filter(|a| {
            a.icao_code.contains(&q)
                || a.name.to_uppercase().contains(&q)
                || a.city.to_uppercase().contains(&q)
        })
        .take(20)
        .map(|a| AerodromeSummary {
            icao_code: a.icao_code.clone(),
            name: a.name.clone(),
            city: a.city.clone(),
            state: a.state.clone(),
        })
        .collect()
}

/// Converts an AerodromeInfo to a NavPoint
pub fn aerodrome_to_navpoint(info: &AerodromeInfo) -> NavPoint {
    NavPoint {
        identifier: info.icao_code.clone(),
        point_type: "AD".to_string(),
        name: info.name.clone(),
        lat: info.arp_lat,
        lon: info.arp_lon,
        info: format!("{}/{}", info.city, info.state),
        cached_at: info.cached_at.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_xml_field() {
        let xml = "<root><lat>-10.29</lat><lng>-48.357777777778</lng><AeroCode>SBPJ</AeroCode></root>";
        assert_eq!(extract_xml_field(xml, "lat"), Some("-10.29".to_string()));
        assert_eq!(extract_xml_field(xml, "lng"), Some("-48.357777777778".to_string()));
        assert_eq!(extract_xml_field(xml, "AeroCode"), Some("SBPJ".to_string()));
    }

    #[test]
    fn test_extract_cdata_field() {
        let xml = "<root><name><![CDATA[Brigadeiro Lysias Rodrigues]]></name></root>";
        assert_eq!(
            extract_cdata_field(xml, "name"),
            Some("Brigadeiro Lysias Rodrigues".to_string())
        );
    }

    #[test]
    fn test_extract_cdata_empty() {
        let xml = "<root><name><![CDATA[]]></name></root>";
        assert_eq!(extract_cdata_field(xml, "name"), None);
    }

    #[test]
    fn test_parse_rotaer_sbpj() {
        let xml = r#"<?xml version="1.0"?><aisweb>
            <status>Active</status>
            <AeroCode>SBPJ</AeroCode>
            <name><![CDATA[Brigadeiro Lysias Rodrigues]]></name>
            <city><![CDATA[Palmas]]></city>
            <uf>TO</uf>
            <lat>-10.29</lat>
            <lng>-48.357777777778</lng>
            <altFt>774</altFt>
        </aisweb>"#;

        let result = parse_rotaer_response(xml, "SBPJ").unwrap();
        assert_eq!(result.icao_code, "SBPJ");
        assert_eq!(result.name, "Brigadeiro Lysias Rodrigues");
        assert_eq!(result.city, "Palmas");
        assert_eq!(result.state, "TO");
        assert!((result.arp_lat - (-10.29)).abs() < 0.01);
        assert!((result.arp_lon - (-48.3578)).abs() < 0.01);
        assert!((result.elevation_ft - 774.0).abs() < 0.1);
    }
}
