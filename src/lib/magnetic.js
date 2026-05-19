import vorMagvar from '../data/magvar.json' with { type: 'json' };
import { normalizeBearing } from './bearing.js';

export function magneticDeclination(lat, lon) {
  const k = 5;
  const power = 2.0;

  const distances = vorMagvar
    .map((v) => {
      const dlat = lat - v.lat;
      const dlon = lon - v.lon;
      return { dist: Math.sqrt(dlat * dlat + dlon * dlon), decl: v.var };
    })
    .sort((a, b) => a.dist - b.dist);

  if (distances[0].dist < 0.01) return distances[0].decl;

  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < Math.min(k, distances.length); i++) {
    const { dist, decl } = distances[i];
    const weight = 1.0 / Math.pow(dist, power);
    weightSum += weight;
    valueSum += weight * decl;
  }

  return weightSum > 0 ? valueSum / weightSum : -21.0;
}

export function trueToMagnetic(trueBearing, lat, lon) {
  const decl = magneticDeclination(lat, lon);
  return normalizeBearing(trueBearing - decl);
}

export function magneticToTrue(magBearing, lat, lon) {
  const decl = magneticDeclination(lat, lon);
  return normalizeBearing(magBearing + decl);
}
