import {
  getAerodrome,
  getWaypoint,
  listAerodromes,
  searchAerodromes,
  getStats,
} from './lib/data-loader.js';
import { trueBearing, normalizeBearing } from './lib/bearing.js';
import { distanceNm } from './lib/haversine.js';
import { magneticDeclination } from './lib/magnetic.js';
import { getConfig, saveConfig } from './lib/storage.js';
import { parseCoordinate } from './lib/coord-parser.js';

function aerodromeToNavPoint(info) {
  const type = info.type === 'HP' ? 'HP' : 'AD';
  return {
    identifier: info.icao_code,
    point_type: type,
    name: info.name,
    lat: info.arp_lat,
    lon: info.arp_lon,
    info: `${info.city}/${info.state}`,
  };
}

export async function searchAerodrome(query) {
  return searchAerodromes(query);
}

export async function getAerodromeInfo(icao) {
  const info = getAerodrome(icao);
  if (!info) {
    throw new Error(`Aeródromo ${icao.toUpperCase()} não encontrado`);
  }
  return info;
}

export async function listCachedAerodromes() {
  return listAerodromes()
    .map((a) => ({
      icao_code: a.icao_code,
      name: a.name,
      city: a.city,
      state: a.state,
    }))
    .sort((a, b) => a.icao_code.localeCompare(b.icao_code));
}

export async function calculateRdl(aerodromeIcao, pointLat, pointLon) {
  const icao = aerodromeIcao.toUpperCase();
  const aero = getAerodrome(icao);
  if (!aero) {
    throw new Error(`Aeródromo ${icao} não encontrado`);
  }

  const trueBrg = trueBearing(aero.arp_lat, aero.arp_lon, pointLat, pointLon);

  const decl =
    aero.magnetic_variation != null
      ? aero.magnetic_variation
      : magneticDeclination(aero.arp_lat, aero.arp_lon);

  const magBrg = normalizeBearing(trueBrg - decl);
  const dist = distanceNm(aero.arp_lat, aero.arp_lon, pointLat, pointLon);

  const formatted = `${String(Math.round(magBrg)).padStart(3, '0')}/${dist.toFixed(1)}`;

  return {
    radial_magnetic: Math.round(magBrg * 10) / 10,
    radial_true: Math.round(trueBrg * 10) / 10,
    distance_nm: Math.round(dist * 10) / 10,
    magnetic_declination: decl,
    aerodrome_icao: icao,
    aerodrome_name: aero.name,
    aerodrome_lat: aero.arp_lat,
    aerodrome_lon: aero.arp_lon,
    point_lat: pointLat,
    point_lon: pointLon,
    formatted,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

export async function calculateRdlBatch(aerodromeIcao, points) {
  return Promise.all(
    points.map((p) => calculateRdl(aerodromeIcao, p.lat, p.lon))
  );
}

export async function lookupPoint(identifier) {
  const id = identifier.trim().toUpperCase();

  const aero = getAerodrome(id);
  if (aero) return aerodromeToNavPoint(aero);

  const wpt = getWaypoint(id);
  if (wpt) return wpt;

  const coord = parseCoordinate(identifier);
  if (coord) {
    return {
      identifier: coord.packed,
      point_type: 'COORD',
      name: coord.prettyDdm,
      lat: coord.lat,
      lon: coord.lon,
      info: coord.assumed ? 'hemisfério S/W assumido' : coord.prettyDd,
      coord,
    };
  }

  throw new Error(`'${id}' não encontrado como aeródromo, waypoint nem coordenada.`);
}

export async function getCacheStats() {
  return getStats();
}

export async function getApiConfig() {
  return getConfig();
}

export async function saveApiConfig(_apiKey, _apiPass, defaultAerodrome) {
  const icao = (defaultAerodrome || 'SBPJ').toUpperCase();
  saveConfig({ default_aerodrome: icao });
}
