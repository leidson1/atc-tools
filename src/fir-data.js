/**
 * Brazilian FIR (Flight Information Region) data.
 * Boundaries from DECEA GeoServer (official source).
 * Simplified polygons for rendering performance.
 */

import firGeoJSON from './fir-boundaries.json';

export const FIR_COLORS = {
  SBAZ: { color: '#e63946', fill: 'rgba(230, 57, 70, 0.06)', label: 'Amazônica' },
  SBBS: { color: '#0077b6', fill: 'rgba(0, 119, 182, 0.06)', label: 'Brasília' },
  SBCW: { color: '#2a9d8f', fill: 'rgba(42, 157, 143, 0.06)', label: 'Curitiba' },
  SBRE: { color: '#e9c46a', fill: 'rgba(233, 196, 106, 0.06)', label: 'Recife' },
  SBAO: { color: '#9b5de5', fill: 'rgba(155, 93, 229, 0.06)', label: 'Atlântico' },
};

// Official DECEA FIR boundaries (simplified)
export const FIR_GEOJSON = firGeoJSON;

/**
 * Determines which FIR a point belongs to using ray casting algorithm.
 */
export function getFirForPoint(lat, lon) {
  for (const feature of FIR_GEOJSON.features) {
    const coords = feature.geometry.coordinates[0];
    if (pointInPolygon(lat, lon, coords)) {
      return feature.properties.id;
    }
  }
  return getClosestFir(lat, lon);
}

/**
 * Ray casting - polygon coords are [lon, lat] (GeoJSON standard).
 */
function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0];
    const xj = polygon[j][1], yj = polygon[j][0];

    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getClosestFir(lat, lon) {
  const centroids = {
    SBAZ: { lat: -3.0, lon: -60.0 },
    SBBS: { lat: -13.0, lon: -48.0 },
    SBCW: { lat: -26.0, lon: -51.0 },
    SBRE: { lat: -8.0, lon: -38.0 },
    SBAO: { lat: -20.0, lon: -42.0 },
  };

  let closest = null;
  let minDist = Infinity;
  for (const [fir, c] of Object.entries(centroids)) {
    const d = Math.sqrt((lat - c.lat) ** 2 + (lon - c.lon) ** 2);
    if (d < minDist) {
      minDist = d;
      closest = fir;
    }
  }
  return closest;
}

export function getFirInfo(firIcao) {
  return FIR_COLORS[firIcao] || { color: '#666', fill: 'rgba(100,100,100,0.05)', label: firIcao };
}
