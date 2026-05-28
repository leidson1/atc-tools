// Geometria de trajetória: interpolação great-circle e detecção de
// cruzamento com polígonos de TMA (GeoJSON).
//
// Trajetórias são arrays de { lat, lon }. Anéis GeoJSON são [[lon, lat], ...].
// Os testes de geometria tratam lon como x e lat como y — aproximação plana
// válida nas escalas envolvidas (TMAs brasileiras).

import { distanceNm } from './haversine.js';

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Pontos ao longo do círculo máximo entre A e B (n+1 pontos). */
export function greatCirclePoints(lat1, lon1, lat2, lon2, n = 128) {
  const phi1 = toRad(lat1), lam1 = toRad(lon1);
  const phi2 = toRad(lat2), lam2 = toRad(lon2);

  const dPhi = phi2 - phi1;
  const dLam = lam2 - lam1;
  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dPhi / 2) ** 2 +
          Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
      )
    );

  if (delta === 0 || Number.isNaN(delta)) {
    return [{ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }];
  }

  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = Math.sin((1 - f) * delta) / Math.sin(delta);
    const b = Math.sin(f * delta) / Math.sin(delta);
    const x = a * Math.cos(phi1) * Math.cos(lam1) + b * Math.cos(phi2) * Math.cos(lam2);
    const y = a * Math.cos(phi1) * Math.sin(lam1) + b * Math.cos(phi2) * Math.sin(lam2);
    const z = a * Math.sin(phi1) + b * Math.sin(phi2);
    pts.push({
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lon: toDeg(Math.atan2(y, x)),
    });
  }
  return pts;
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function orient(ax, ay, bx, by, cx, cy) {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

function segmentsCross(a, b, c, d) {
  const o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
  return o1 !== o2 && o3 !== o4;
}

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((p) => p[0]);
  return [];
}

function trajectoryCrossesRing(traj, ring) {
  // Qualquer vértice da trajetória dentro do polígono?
  for (const p of traj) {
    if (pointInRing(p.lat, p.lon, ring)) return true;
  }
  // Algum segmento da trajetória cruza alguma aresta do anel?
  const ringXY = ring.map((c) => ({ x: c[0], y: c[1] }));
  const trajXY = traj.map((p) => ({ x: p.lon, y: p.lat }));
  for (let i = 0; i < trajXY.length - 1; i++) {
    for (let j = 0; j < ringXY.length - 1; j++) {
      if (segmentsCross(trajXY[i], trajXY[i + 1], ringXY[j], ringXY[j + 1])) return true;
    }
  }
  return false;
}

/**
 * Retorna as features de TMA que a trajetória cruza (lateralmente).
 * @returns {Array<{id, name, feature}>}
 */
export function tmasCrossed(traj, tmaGeoJSON) {
  const crossed = [];
  for (const feature of tmaGeoJSON.features) {
    const rings = exteriorRings(feature.geometry);
    if (rings.some((ring) => trajectoryCrossesRing(traj, ring))) {
      crossed.push({
        id: feature.properties.id || '',
        name: feature.properties.name || '',
        feature,
      });
    }
  }
  return crossed;
}

/**
 * TMAs cruzadas com a distância (NM) do ponto de entrada na rota.
 * @returns {Array<{id, name, feature, distNm}>}
 */
export function tmaEntriesAlong(traj, tmaGeoJSON) {
  const cum = new Array(traj.length);
  cum[0] = 0;
  for (let i = 1; i < traj.length; i++) {
    cum[i] = cum[i - 1] + distanceNm(traj[i - 1].lat, traj[i - 1].lon, traj[i].lat, traj[i].lon);
  }

  const out = [];
  for (const feature of tmaGeoJSON.features) {
    const rings = exteriorRings(feature.geometry);
    let entryIdx = -1;
    for (let i = 0; i < traj.length; i++) {
      if (rings.some((r) => pointInRing(traj[i].lat, traj[i].lon, r))) {
        entryIdx = i;
        break;
      }
    }
    if (entryIdx >= 0) {
      out.push({
        id: feature.properties.id || '',
        name: feature.properties.name || '',
        feature,
        distNm: cum[entryIdx],
        lat: traj[entryIdx].lat,
        lon: traj[entryIdx].lon,
      });
    }
  }
  return out;
}
