import rawAerodromes from '../data/aerodromes.json';
import rawWaypoints from '../data/waypoints.json';
import { DEFAULT_AERODROMES } from './defaults.js';

const aerodromes = new Map();
const waypoints = new Map();

for (const ad of rawAerodromes) {
  aerodromes.set(ad.icao.toUpperCase(), {
    icao_code: ad.icao.toUpperCase(),
    name: ad.name,
    city: ad.city,
    state: ad.uf,
    arp_lat: ad.lat,
    arp_lon: ad.lon,
    elevation_ft: ad.elevation_ft ?? 0,
    magnetic_variation: null,
    type: ad.type || 'AD',
    use: ad.use || '',
    operation: ad.operation || '',
    fir: ad.fir || '',
    amendment: ad.amendment || '',
  });
}

for (const [icao, info] of Object.entries(DEFAULT_AERODROMES)) {
  aerodromes.set(icao, { ...aerodromes.get(icao), ...info });
}

for (const wpt of rawWaypoints) {
  const id = wpt.id.toUpperCase();
  waypoints.set(id, {
    identifier: id,
    point_type: 'WPT',
    name: id,
    lat: wpt.lat,
    lon: wpt.lon,
    info: '',
  });
}

export function getAerodrome(icao) {
  return aerodromes.get(icao.toUpperCase()) || null;
}

export function getWaypoint(id) {
  return waypoints.get(id.toUpperCase()) || null;
}

export function listAerodromes() {
  return Array.from(aerodromes.values());
}

export function searchAerodromes(query, limit = 20) {
  const q = query.toUpperCase();
  const out = [];
  for (const a of aerodromes.values()) {
    if (
      a.icao_code.includes(q) ||
      a.name.toUpperCase().includes(q) ||
      a.city.toUpperCase().includes(q)
    ) {
      out.push({
        icao_code: a.icao_code,
        name: a.name,
        city: a.city,
        state: a.state,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function getStats() {
  return {
    total_ads: aerodromes.size,
    waypoints: waypoints.size,
  };
}
