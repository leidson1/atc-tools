use std::f64::consts::PI;

/// Converts degrees to radians
fn to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

/// Converts radians to degrees
fn to_deg(rad: f64) -> f64 {
    rad * 180.0 / PI
}

/// Normalizes an angle to the range [0, 360)
pub fn normalize_bearing(bearing: f64) -> f64 {
    ((bearing % 360.0) + 360.0) % 360.0
}

/// Calculates the initial true bearing FROM point 1 TO point 2.
/// In ATC terms: this is the radial FROM the station TO the aircraft.
/// Inputs: latitude and longitude in decimal degrees.
/// Returns: true bearing in degrees [0, 360).
pub fn true_bearing(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = to_rad(lat1);
    let phi2 = to_rad(lat2);
    let delta_lambda = to_rad(lon2 - lon1);

    let x = delta_lambda.sin() * phi2.cos();
    let y = phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * delta_lambda.cos();

    let theta = x.atan2(y);
    normalize_bearing(to_deg(theta))
}

/// Calculates the destination point given a start point, bearing, and distance.
/// Used for drawing radial lines on the map.
/// Returns: (latitude, longitude) in decimal degrees.
pub fn destination_point(lat: f64, lon: f64, bearing_deg: f64, distance_nm: f64) -> (f64, f64) {
    let r = 6371.0; // Earth radius in km
    let d = distance_nm * 1.852; // Convert NM to km

    let phi1 = to_rad(lat);
    let lambda1 = to_rad(lon);
    let theta = to_rad(bearing_deg);

    let phi2 = (phi1.sin() * (d / r).cos() + phi1.cos() * (d / r).sin() * theta.cos()).asin();

    let lambda2 = lambda1
        + (theta.sin() * (d / r).sin() * phi1.cos())
            .atan2((d / r).cos() - phi1.sin() * phi2.sin());

    (to_deg(phi2), to_deg(lambda2))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_due_north() {
        let b = true_bearing(0.0, 0.0, 1.0, 0.0);
        assert!(
            (b - 0.0).abs() < 0.1 || (b - 360.0).abs() < 0.1,
            "Due north should be ~0/360, got {:.1}",
            b
        );
    }

    #[test]
    fn test_due_east() {
        let b = true_bearing(0.0, 0.0, 0.0, 1.0);
        assert!(
            (b - 90.0).abs() < 0.1,
            "Due east should be ~90, got {:.1}",
            b
        );
    }

    #[test]
    fn test_due_south() {
        let b = true_bearing(0.0, 0.0, -1.0, 0.0);
        assert!(
            (b - 180.0).abs() < 0.1,
            "Due south should be ~180, got {:.1}",
            b
        );
    }

    #[test]
    fn test_due_west() {
        let b = true_bearing(0.0, 0.0, 0.0, -1.0);
        assert!(
            (b - 270.0).abs() < 0.1,
            "Due west should be ~270, got {:.1}",
            b
        );
    }

    #[test]
    fn test_normalize_bearing() {
        assert!((normalize_bearing(-90.0) - 270.0).abs() < 0.001);
        assert!((normalize_bearing(450.0) - 90.0).abs() < 0.001);
        assert!((normalize_bearing(0.0) - 0.0).abs() < 0.001);
        assert!((normalize_bearing(360.0) - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_destination_point_roundtrip() {
        let (lat2, lon2) = destination_point(0.0, 0.0, 90.0, 60.0);
        // 60 NM east from equator/prime meridian should be ~1 degree east
        assert!(
            (lat2 - 0.0).abs() < 0.1,
            "Latitude should stay ~0, got {}",
            lat2
        );
        assert!(
            (lon2 - 1.0).abs() < 0.1,
            "Longitude should be ~1, got {}",
            lon2
        );
    }
}
