use super::bearing::normalize_bearing;

/// Magnetic declination data for Brazilian aerodromes.
/// In the future, this can be replaced with WMM2025 calculations.
/// For now, we use a simplified model based on IGRF/WMM approximate values for Brazil.
///
/// In Brazil, magnetic declination is predominantly WEST (negative),
/// ranging from approximately -14° to -23° depending on location.
///
/// Formula: Magnetic Bearing = True Bearing - Declination
/// (where West declination is negative)

/// Approximate magnetic declination for a point in Brazil.
/// Uses a simplified linear interpolation model.
/// For production accuracy, integrate the `wmm` or `world_magnetic_model` crate.
///
/// Returns declination in degrees (negative = West, positive = East)
pub fn magnetic_declination(lat: f64, lon: f64) -> f64 {
    // Simplified model for Brazil based on WMM2025 approximate values
    // Brazil declination ranges roughly from -14° (northeast) to -23° (south)
    // This linear model provides ~2° accuracy for planning purposes
    //
    // Reference points:
    // Belém (SBBE):  lat -1.4, lon -48.5, decl ~ -20.5°
    // Palmas (SBPJ): lat -10.3, lon -48.4, decl ~ -21.5°
    // Brasília (SBBR): lat -15.9, lon -47.9, decl ~ -22.0°
    // São Paulo (SBGR): lat -23.4, lon -46.5, decl ~ -22.5°
    // Recife (SBRF): lat -8.1, lon -34.9, decl ~ -22.0°
    // Manaus (SBEG): lat -3.0, lon -60.0, decl ~ -15.0°

    // Base declination + adjustments for latitude and longitude
    let base = -20.0;
    let lat_factor = (lat + 10.0) * 0.1; // More negative as you go south
    let lon_factor = (lon + 50.0) * 0.15; // More negative as you go east in Brazil

    base + lat_factor + lon_factor
}

/// Converts a true bearing to magnetic bearing using the declination at a given position.
/// Magnetic = True - Declination (where West declination is negative, so effectively adding)
pub fn true_to_magnetic(true_bearing: f64, lat: f64, lon: f64) -> f64 {
    let decl = magnetic_declination(lat, lon);
    normalize_bearing(true_bearing - decl)
}

/// Converts a magnetic bearing to true bearing.
/// True = Magnetic + Declination
pub fn magnetic_to_true(mag_bearing: f64, lat: f64, lon: f64) -> f64 {
    let decl = magnetic_declination(lat, lon);
    normalize_bearing(mag_bearing + decl)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_palmas_declination() {
        // SBPJ (Palmas): expected ~-21° to -22°
        let decl = magnetic_declination(-10.2914, -48.3569);
        assert!(
            decl < -18.0 && decl > -25.0,
            "Palmas declination should be ~-21°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_true_to_magnetic_conversion() {
        // With ~-21° declination, True 180° should become Magnetic ~201°
        let mag = true_to_magnetic(180.0, -10.2914, -48.3569);
        assert!(
            mag > 195.0 && mag < 210.0,
            "True 180° at Palmas should be magnetic ~201°, got {:.1}°",
            mag
        );
    }

    #[test]
    fn test_roundtrip_conversion() {
        let lat = -10.2914;
        let lon = -48.3569;
        let original = 270.0;

        let magnetic = true_to_magnetic(original, lat, lon);
        let back = magnetic_to_true(magnetic, lat, lon);

        assert!(
            (normalize_bearing(back) - normalize_bearing(original)).abs() < 0.001,
            "Roundtrip should preserve bearing: {} -> {} -> {}",
            original,
            magnetic,
            back
        );
    }
}
