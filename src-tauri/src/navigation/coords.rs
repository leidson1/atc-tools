use crate::error::AppError;

/// Represents a geographic coordinate
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Coordinate {
    pub lat: f64,
    pub lon: f64,
}

/// Parses a coordinate string in multiple formats:
/// 1. Decimal degrees: "-10.2914, -48.3569"
/// 2. DMS: "10°17'29\"S 048°21'25\"W" or "10 17 29 S 48 21 25 W"
/// 3. DMS compact: "101729S 0482125W"
/// 4. Degrees decimal minutes: "10 17.483'S 048 21.417'W"
pub fn parse_coordinates(input: &str) -> Result<Coordinate, AppError> {
    let input = input.trim();

    // Try decimal degrees first (most common programmatic format)
    if let Some(coord) = try_parse_decimal(input) {
        return Ok(coord);
    }

    // Try DMS compact format: "101729S 0482125W"
    if let Some(coord) = try_parse_dms_compact(input) {
        return Ok(coord);
    }

    // Try DMS with separators: "10°17'29"S 048°21'25"W" or "10 17 29 S 48 21 25 W"
    if let Some(coord) = try_parse_dms(input) {
        return Ok(coord);
    }

    // Try DDM: "10 17.483 S 048 21.417 W"
    if let Some(coord) = try_parse_ddm(input) {
        return Ok(coord);
    }

    Err(AppError::Parse(format!(
        "Não foi possível interpretar as coordenadas: '{}'. Formatos aceitos: decimal (-10.29, -48.35), DMS (101729S 0482125W), DMS (10°17'29\"S 048°21'25\"W)",
        input
    )))
}

/// Try parsing "lat, lon" in decimal degrees
fn try_parse_decimal(input: &str) -> Option<Coordinate> {
    let parts: Vec<&str> = input.split([',', ' ', ';']).filter(|s| !s.is_empty()).collect();

    if parts.len() == 2 {
        let lat = parts[0].trim().parse::<f64>().ok()?;
        let lon = parts[1].trim().parse::<f64>().ok()?;

        if lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0 {
            return Some(Coordinate { lat, lon });
        }
    }
    None
}

/// Try parsing DMS compact: "101729S 0482125W" or "101729.5S 0482125.3W"
fn try_parse_dms_compact(input: &str) -> Option<Coordinate> {
    let upper = input.to_uppercase();
    let parts: Vec<&str> = upper.split_whitespace().collect();

    if parts.len() != 2 {
        return None;
    }

    let lat = parse_dms_compact_part(parts[0], &['N', 'S'])?;
    let lon = parse_dms_compact_part(parts[1], &['E', 'W'])?;

    Some(Coordinate { lat, lon })
}

fn parse_dms_compact_part(s: &str, directions: &[char]) -> Option<f64> {
    let last = s.chars().last()?;
    if !directions.contains(&last) {
        return None;
    }

    let num_str = &s[..s.len() - 1];

    // Find the decimal point position if any
    let (integer_part, decimal_part) = if let Some(dot_pos) = num_str.find('.') {
        (&num_str[..dot_pos], num_str[dot_pos..].parse::<f64>().unwrap_or(0.0))
    } else {
        (num_str, 0.0)
    };

    let len = integer_part.len();
    if len < 5 || len > 7 {
        return None;
    }

    // For latitude: DDMMSS (6 digits) or DMMSS (5 digits)
    // For longitude: DDDMMSS (7 digits) or DDMMSS (6 digits)
    let (deg_len, is_lon) = if directions.contains(&'E') || directions.contains(&'W') {
        // Longitude: 7 digits = DDD MM SS, 6 digits = DD MM SS
        if len == 7 { (3, true) } else { (2, true) }
    } else {
        // Latitude: 6 digits = DD MM SS, 5 digits = D MM SS
        if len == 6 { (2, false) } else { (1, false) }
    };

    let _ = is_lon; // Used for context only

    let deg: f64 = integer_part[..deg_len].parse().ok()?;
    let min: f64 = integer_part[deg_len..deg_len + 2].parse().ok()?;
    let sec: f64 = integer_part[deg_len + 2..].parse::<f64>().ok()? + decimal_part;

    if min >= 60.0 || sec >= 60.0 {
        return None;
    }

    let mut result = deg + min / 60.0 + sec / 3600.0;

    if last == 'S' || last == 'W' {
        result = -result;
    }

    Some(result)
}

/// Try parsing DMS with separators: "10°17'29"S 048°21'25"W" or "10 17 29 S 48 21 25 W"
fn try_parse_dms(input: &str) -> Option<Coordinate> {
    let clean = input
        .replace('°', " ")
        .replace('\'', " ")
        .replace('"', " ")
        .replace("''", " ")
        .replace(',', " ");

    let upper = clean.to_uppercase();
    let tokens: Vec<&str> = upper.split_whitespace().collect();

    if tokens.len() == 8 {
        // Format: D M S dir D M S dir
        let lat_deg: f64 = tokens[0].parse().ok()?;
        let lat_min: f64 = tokens[1].parse().ok()?;
        let lat_sec: f64 = tokens[2].parse().ok()?;
        let lat_dir = tokens[3];

        let lon_deg: f64 = tokens[4].parse().ok()?;
        let lon_min: f64 = tokens[5].parse().ok()?;
        let lon_sec: f64 = tokens[6].parse().ok()?;
        let lon_dir = tokens[7];

        if lat_min >= 60.0 || lat_sec >= 60.0 || lon_min >= 60.0 || lon_sec >= 60.0 {
            return None;
        }

        let mut lat = lat_deg + lat_min / 60.0 + lat_sec / 3600.0;
        let mut lon = lon_deg + lon_min / 60.0 + lon_sec / 3600.0;

        if lat_dir == "S" {
            lat = -lat;
        }
        if lon_dir == "W" {
            lon = -lon;
        }

        return Some(Coordinate { lat, lon });
    }

    None
}

/// Try parsing DDM: "10 17.483 S 048 21.417 W"
fn try_parse_ddm(input: &str) -> Option<Coordinate> {
    let clean = input.replace('°', " ").replace('\'', " ").replace(',', " ");
    let upper = clean.to_uppercase();
    let tokens: Vec<&str> = upper.split_whitespace().collect();

    if tokens.len() == 6 {
        let lat_deg: f64 = tokens[0].parse().ok()?;
        let lat_min: f64 = tokens[1].parse().ok()?;
        let lat_dir = tokens[2];

        let lon_deg: f64 = tokens[3].parse().ok()?;
        let lon_min: f64 = tokens[4].parse().ok()?;
        let lon_dir = tokens[5];

        if lat_min >= 60.0 || lon_min >= 60.0 {
            return None;
        }

        let mut lat = lat_deg + lat_min / 60.0;
        let mut lon = lon_deg + lon_min / 60.0;

        if lat_dir == "S" {
            lat = -lat;
        }
        if lon_dir == "W" {
            lon = -lon;
        }

        return Some(Coordinate { lat, lon });
    }

    None
}

/// Formats a coordinate as DMS string (e.g., "10°17'29\"S 048°21'25\"W")
pub fn format_dms(lat: f64, lon: f64) -> String {
    let lat_str = decimal_to_dms(lat.abs(), if lat >= 0.0 { 'N' } else { 'S' });
    let lon_str = decimal_to_dms_lon(lon.abs(), if lon >= 0.0 { 'E' } else { 'W' });
    format!("{} {}", lat_str, lon_str)
}

fn decimal_to_dms(decimal: f64, direction: char) -> String {
    let deg = decimal.floor() as u32;
    let min_float = (decimal - deg as f64) * 60.0;
    let min = min_float.floor() as u32;
    let sec = (min_float - min as f64) * 60.0;
    format!("{:02}°{:02}'{:04.1}\"{}", deg, min, sec, direction)
}

fn decimal_to_dms_lon(decimal: f64, direction: char) -> String {
    let deg = decimal.floor() as u32;
    let min_float = (decimal - deg as f64) * 60.0;
    let min = min_float.floor() as u32;
    let sec = (min_float - min as f64) * 60.0;
    format!("{:03}°{:02}'{:04.1}\"{}", deg, min, sec, direction)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_decimal() {
        let c = parse_coordinates("-10.2914, -48.3569").unwrap();
        assert!((c.lat - (-10.2914)).abs() < 0.0001);
        assert!((c.lon - (-48.3569)).abs() < 0.0001);
    }

    #[test]
    fn test_parse_decimal_space() {
        let c = parse_coordinates("-10.2914 -48.3569").unwrap();
        assert!((c.lat - (-10.2914)).abs() < 0.0001);
        assert!((c.lon - (-48.3569)).abs() < 0.0001);
    }

    #[test]
    fn test_parse_dms_compact() {
        // 10°17'29"S = 10 + 17/60 + 29/3600 = 10.2914°
        let c = parse_coordinates("101729S 0482125W").unwrap();
        assert!(
            (c.lat - (-10.2914)).abs() < 0.01,
            "Lat should be ~-10.29, got {}",
            c.lat
        );
        assert!(
            (c.lon - (-48.3569)).abs() < 0.01,
            "Lon should be ~-48.36, got {}",
            c.lon
        );
    }

    #[test]
    fn test_parse_dms_with_symbols() {
        let c = parse_coordinates("10°17'29\"S 048°21'25\"W").unwrap();
        assert!(
            (c.lat - (-10.2914)).abs() < 0.01,
            "Lat should be ~-10.29, got {}",
            c.lat
        );
    }

    #[test]
    fn test_parse_dms_spaces() {
        let c = parse_coordinates("10 17 29 S 48 21 25 W").unwrap();
        assert!(
            (c.lat - (-10.2914)).abs() < 0.01,
            "Lat should be ~-10.29, got {}",
            c.lat
        );
    }

    #[test]
    fn test_parse_ddm() {
        let c = parse_coordinates("10 17.483 S 048 21.417 W").unwrap();
        assert!(
            (c.lat - (-10.2914)).abs() < 0.01,
            "Lat should be ~-10.29, got {}",
            c.lat
        );
    }

    #[test]
    fn test_invalid_input() {
        assert!(parse_coordinates("invalid").is_err());
        assert!(parse_coordinates("").is_err());
    }

    #[test]
    fn test_format_dms() {
        let s = format_dms(-10.2914, -48.3569);
        assert!(s.contains('S'), "Should contain S: {}", s);
        assert!(s.contains('W'), "Should contain W: {}", s);
        assert!(s.contains("10°"), "Should contain 10°: {}", s);
    }
}
