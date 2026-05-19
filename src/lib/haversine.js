const EARTH_RADIUS_KM = 6371.0;
const KM_PER_NM = 1.852;

const toRad = (deg) => (deg * Math.PI) / 180.0;

export function distanceNm(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return (EARTH_RADIUS_KM * c) / KM_PER_NM;
}
