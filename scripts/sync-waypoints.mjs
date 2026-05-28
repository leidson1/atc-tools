#!/usr/bin/env node
// Sync waypoints/fixos from the DECEA GeoServer (WFS) into src/data/waypoints.json
//
// Usage:
//   node scripts/sync-waypoints.mjs
//
// The DECEA GeoServer publishes aeronautical waypoints as a WFS layer with
// GeoJSON output. The exact layer name may change over time — if this stops
// returning data, check the layer name at:
//   https://geoaisweb.decea.mil.br/geoserver/web/

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Candidate layer names tried in order (DECEA has renamed these over time)
const LAYER_CANDIDATES = [
  'ICA:waypoint_aisweb',
  'ICA:waypoint',
  'ICA:enr_wpt',
  'ICA:wpt',
];

const WFS_BASE = 'https://geoaisweb.decea.mil.br/geoserver/ICA/wfs';

async function tryFetchLayer(layer) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  const url = `${WFS_BASE}?${params.toString()}`;
  console.log(`Tentando layer: ${layer}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  -> HTTP ${res.status}`);
    return null;
  }
  try {
    return await res.json();
  } catch (e) {
    console.warn(`  -> resposta não é JSON (${e.message})`);
    return null;
  }
}

function pickField(props, candidates) {
  for (const k of candidates) {
    if (props[k] != null && String(props[k]).trim()) {
      return String(props[k]).trim();
    }
  }
  return null;
}

function featureToWaypoint(feature) {
  const props = feature.properties || {};
  const geom = feature.geometry;

  const id = pickField(props, ['ident', 'identifier', 'name', 'wpt_id', 'codeId']);
  if (!id) return null;

  let coords = null;
  if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) coords = geom.coordinates;
  if (geom?.type === 'MultiPoint' && Array.isArray(geom.coordinates?.[0])) coords = geom.coordinates[0];

  const lon = Number.isFinite(props.longitude) ? props.longitude : coords?.[0];
  const lat = Number.isFinite(props.latitude) ? props.latitude : coords?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    id: id.toUpperCase(),
    lat: Math.round(lat * 1_000_000) / 1_000_000,
    lon: Math.round(lon * 1_000_000) / 1_000_000,
    type: pickField(props, ['tipo', 'codetype']) || '',
  };
}

async function main() {
  console.log('Sincronizando waypoints do GeoServer DECEA...');
  let payload = null;
  for (const layer of LAYER_CANDIDATES) {
    payload = await tryFetchLayer(layer);
    if (payload?.features?.length) {
      console.log(`  -> ${payload.features.length} features recebidas\n`);
      break;
    }
  }

  if (!payload?.features?.length) {
    console.error(
      'Nenhuma camada de waypoints retornou dados.\n' +
      'Verifique os nomes de layer em https://geoaisweb.decea.mil.br/geoserver/web/ ' +
      'e edite LAYER_CANDIDATES neste script.'
    );
    process.exit(1);
  }

  const seen = new Map();
  for (const feat of payload.features) {
    const wpt = featureToWaypoint(feat);
    if (wpt && !seen.has(wpt.id)) seen.set(wpt.id, wpt);
  }

  const sorted = Array.from(seen.values()).sort((a, b) => a.id.localeCompare(b.id));
  const outPath = resolve(ROOT, 'src/data/waypoints.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(sorted) + '\n');

  console.log(`Gravado ${sorted.length} waypoints em ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
