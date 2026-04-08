use std::f64::consts::PI;

const EARTH_RADIUS_KM: f64 = 6371.0;
const KM_PER_NM: f64 = 1.852;

/// Converts degrees to radians
fn to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

/// Calculates great circle distance between two points using the Haversine formula.
/// Inputs: latitude and longitude in decimal degrees.
/// Returns: distance in nautical miles.
pub fn distance_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = to_rad(lat1);
    let phi2 = to_rad(lat2);
    let delta_phi = to_rad(lat2 - lat1);
    let delta_lambda = to_rad(lon2 - lon1);

    let a = (delta_phi / 2.0).sin().powi(2)
        + phi1.cos() * phi2.cos() * (delta_lambda / 2.0).sin().powi(2);

    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    let distance_km = EARTH_RADIUS_KM * c;
    distance_km / KM_PER_NM
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_same_point() {
        let d = distance_nm(-10.2914, -48.3569, -10.2914, -48.3569);
        assert!(d.abs() < 0.001, "Same point distance should be ~0, got {}", d);
    }

    #[test]
    fn test_sbpj_to_sbbr() {
        // SBPJ (Palmas) to SBBR (Brasília) ~340 NM
        let d = distance_nm(-10.2914, -48.3569, -15.8711, -47.9186);
        assert!(
            (d - 340.0).abs() < 20.0,
            "SBPJ-SBBR should be ~340 NM, got {:.1}",
            d
        );
    }

    #[test]
    fn test_short_distance() {
        // Two points ~1 NM apart (approx 1 minute of latitude)
        let d = distance_nm(0.0, 0.0, 1.0 / 60.0, 0.0);
        assert!(
            (d - 1.0).abs() < 0.1,
            "1 minute of lat should be ~1 NM, got {:.3}",
            d
        );
    }

    #[test]
    fn test_symmetry() {
        let d1 = distance_nm(-10.0, -48.0, -15.0, -47.0);
        let d2 = distance_nm(-15.0, -47.0, -10.0, -48.0);
        assert!(
            (d1 - d2).abs() < 0.001,
            "Distance should be symmetric: {} vs {}",
            d1,
            d2
        );
    }
}
