use super::bearing::normalize_bearing;

/// Magnetic declination data from official VOR stations (DECEA GeoServer).
/// Each entry: (latitude, longitude, declination_degrees)
/// Source: geoaisweb.decea.mil.br - ICA:vor layer, magvariati field
/// Declination is negative for West (all of Brazil is West)
const VOR_MAGVAR: &[(f64, f64, f64)] = &[
    (-22.813, -42.095, -23.4), // ADA
    (-2.372, -44.397, -20.7),  // ALR
    (-16.245, -48.979, -21.7), // APO
    (-10.982, -37.077, -22.6), // ARU
    (-19.689, -47.060, -22.2), // ARX
    (-9.868, -56.105, -18.6),  // ATF
    (-15.854, -52.396, -20.3), // BAG
    (-25.404, -49.234, -20.5), // BCH
    (-1.384, -48.479, -20.2),  // BEL
    (-31.391, -54.110, -15.0), // BGE
    (-19.836, -44.004, -23.1), // BHZ
    (-12.080, -45.007, -22.5), // BRR
    (2.852, -60.687, -16.0),   // BVI
    (-9.331, -54.965, -19.2),  // CBO
    (-23.628, -46.655, -21.8), // CGO
    (-15.656, -56.112, -18.3), // CIA
    (-19.558, -44.048, -23.1), // CNF
    (-29.950, -51.146, -17.7), // COA
    (-25.532, -49.168, -20.3), // CTB
    (-22.817, -43.260, -23.1), // CXI
    (-29.198, -51.189, -17.9), // CXS
    (-7.607, -72.773, -7.4),   // CZS
    (-29.998, -50.975, -17.7), // FIG
    (-27.670, -48.541, -20.0), // FLN
    (-3.772, -38.548, -20.6),  // FLZ
    (-3.857, -32.430, -19.2),  // FNR
    (-25.583, -54.504, -17.2), // FOZ
    (-15.556, -47.347, -22.0), // FSA
    (-0.150, -66.991, -12.5),  // GBR
    (-16.641, -49.211, -21.6), // GNV
    (-20.483, -54.689, -18.5), // GRD
    (-25.734, -54.486, -17.2), // IGU
    (-26.222, -48.798, -20.3), // JNV
    (4.693, -61.029, -15.8),   // LDP
    (-4.188, -69.939, -10.2),  // LET
    (-23.340, -51.112, -19.9), // LON
    (-16.261, -47.971, -22.0), // LUZ
    (-22.344, -41.769, -23.5), // MCA
    (-9.510, -35.787, -22.1),  // MCE
    (0.052, -51.073, -19.5),   // MCP
    (-32.342, -54.222, -12.7), // MLO
    (-3.040, -60.055, -16.6),  // MNS
    (-5.368, -49.135, -20.8),  // MRB
    (-5.197, -37.364, -20.9),  // MSS
    (-5.908, -35.249, -20.7),  // NTL
    (-22.454, -43.840, -22.9), // PAI
    (-22.715, -42.857, -23.2), // PCX
    (-21.985, -47.344, -21.8), // PIR
    (-10.288, -48.358, -21.6), // PMS (Palmas!)
    (-22.173, -51.426, -20.0), // PRR
    (-9.363, -40.562, -22.4),  // PTL
    (-31.719, -52.327, -16.1), // PTS
    (-8.714, -63.904, -14.0),  // PVH
    (-9.876, -67.905, -10.9),  // RCO
    (-23.891, -46.528, -21.8), // RDE
    (-8.137, -34.927, -21.5),  // REC
    (-21.143, -47.770, -22.0), // RPR
    (-23.507, -47.378, -21.6), // SCB
    (-23.233, -45.860, -22.2), // SCP
    (-22.950, -43.727, -22.9), // SCR
    (-5.772, -35.369, -20.7),  // SGA
    (-2.589, -44.240, -20.7),  // SLI
    (-29.710, -53.713, -16.1), // SMA
    (-2.426, -54.818, -18.8),  // STM
    (-23.488, -46.923, -21.7), // STN
    (-12.906, -38.321, -23.2), // SVD
    (-23.036, -45.513, -22.3), // TAU
    (-4.254, -69.944, -10.3),  // TBT
    (-3.388, -64.728, -13.8),  // TFE
    (-5.062, -42.825, -21.4),  // TNA
    (-14.799, -64.938, -10.0), // TRI
    (-18.877, -48.221, -21.8), // ULD
    (-25.244, -57.522, -13.1), // VAS
    (-23.009, -47.130, -21.9), // VCP
    (-15.865, -47.900, -22.0), // VJK
    (-12.694, -60.095, -16.2), // VLH
    (-20.260, -40.285, -23.9), // VRI
    (-5.524, -47.450, -21.1),  // YTZ
];

/// Calculates magnetic declination for a point using Inverse Distance Weighting (IDW)
/// interpolation from the nearest VOR stations.
/// This gives much better accuracy than a simplified linear model.
///
/// Returns declination in degrees (negative = West)
pub fn magnetic_declination(lat: f64, lon: f64) -> f64 {
    // Use IDW interpolation with the 5 nearest VOR stations
    let k = 5;
    let power = 2.0;

    // Calculate distances to all VOR stations
    let mut distances: Vec<(f64, f64)> = VOR_MAGVAR
        .iter()
        .map(|&(vlat, vlon, vdecl)| {
            let dlat = lat - vlat;
            let dlon = lon - vlon;
            let dist = (dlat * dlat + dlon * dlon).sqrt();
            (dist, vdecl)
        })
        .collect();

    // Sort by distance
    distances.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    // If very close to a VOR, use its value directly
    if distances[0].0 < 0.01 {
        return distances[0].1;
    }

    // IDW interpolation using k nearest stations
    let mut weight_sum = 0.0;
    let mut value_sum = 0.0;

    for i in 0..k.min(distances.len()) {
        let (dist, decl) = distances[i];
        let weight = 1.0 / dist.powf(power);
        weight_sum += weight;
        value_sum += weight * decl;
    }

    if weight_sum > 0.0 {
        value_sum / weight_sum
    } else {
        -21.0 // Default fallback for Brazil
    }
}

/// Converts a true bearing to magnetic bearing
/// Magnetic = True - Declination (West declination is negative, so True + |decl|)
pub fn true_to_magnetic(true_bearing: f64, lat: f64, lon: f64) -> f64 {
    let decl = magnetic_declination(lat, lon);
    normalize_bearing(true_bearing - decl)
}

/// Converts a magnetic bearing to true bearing
pub fn magnetic_to_true(mag_bearing: f64, lat: f64, lon: f64) -> f64 {
    let decl = magnetic_declination(lat, lon);
    normalize_bearing(mag_bearing + decl)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_palmas_declination() {
        // VOR PMS at SBPJ: -21.6°
        let decl = magnetic_declination(-10.288, -48.358);
        assert!(
            (decl - (-21.6)).abs() < 0.5,
            "Palmas declination should be ~-21.6°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_brasilia_declination() {
        // VOR VJK at SBBR: -22.0°
        let decl = magnetic_declination(-15.865, -47.900);
        assert!(
            (decl - (-22.0)).abs() < 0.5,
            "Brasília declination should be ~-22.0°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_manaus_declination() {
        // VOR MNS at SBEG: -16.6°
        let decl = magnetic_declination(-3.040, -60.055);
        assert!(
            (decl - (-16.6)).abs() < 0.5,
            "Manaus declination should be ~-16.6°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_recife_declination() {
        // VOR REC at SBRF: -21.5°
        let decl = magnetic_declination(-8.137, -34.927);
        assert!(
            (decl - (-21.5)).abs() < 0.5,
            "Recife declination should be ~-21.5°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_porto_alegre_declination() {
        // VOR COA near SBPA: -17.7°
        let decl = magnetic_declination(-29.950, -51.146);
        assert!(
            (decl - (-17.7)).abs() < 0.5,
            "Porto Alegre declination should be ~-17.7°, got {:.1}°",
            decl
        );
    }

    #[test]
    fn test_true_to_magnetic_palmas() {
        // True 324.5° at SBPJ with decl ~-21.6° should give ~346.1° mag
        let mag = true_to_magnetic(324.5, -10.288, -48.358);
        assert!(
            (mag - 346.1).abs() < 1.0,
            "Should be ~346.1°, got {:.1}°",
            mag
        );
    }

    #[test]
    fn test_roundtrip_conversion() {
        let lat = -10.288;
        let lon = -48.358;
        let original = 270.0;
        let magnetic = true_to_magnetic(original, lat, lon);
        let back = magnetic_to_true(magnetic, lat, lon);
        assert!(
            (normalize_bearing(back) - normalize_bearing(original)).abs() < 0.01,
            "Roundtrip: {} -> {} -> {}",
            original, magnetic, back
        );
    }
}
