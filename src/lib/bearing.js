const toRad = (deg) => (deg * Math.PI) / 180.0;
const toDeg = (rad) => (rad * 180.0) / Math.PI;

export function normalizeBearing(bearing) {
  return ((bearing % 360.0) + 360.0) % 360.0;
}

export function trueBearing(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const x = Math.sin(deltaLambda) * Math.cos(phi2);
  const y =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return normalizeBearing(toDeg(Math.atan2(x, y)));
}

export function destinationPoint(lat, lon, bearingDeg, distanceNm) {
  const r = 6371.0;
  const d = distanceNm * 1.852;

  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);
  const theta = toRad(bearingDeg);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d / r) +
      Math.cos(phi1) * Math.sin(d / r) * Math.cos(theta)
  );

  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(d / r) * Math.cos(phi1),
      Math.cos(d / r) - Math.sin(phi1) * Math.sin(phi2)
    );

  return [toDeg(phi2), toDeg(lambda2)];
}
