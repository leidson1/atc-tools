#!/usr/bin/env node
// Sync aerodromes and heliports from the official DECEA GeoAISWEB WFS layer.
//
// Source layer: ICA:airport_heliport
// Output: src/data/aerodromes.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WFS_BASE = 'https://geoaisweb.decea.mil.br/geoserver/ICA/wfs';
const LAYER = 'ICA:airport_heliport';

function wfsUrl(params = {}) {
  const qs = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    ...params,
  });
  return `${WFS_BASE}?${qs.toString()}`;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metersToFeet(value) {
  const n = asNumber(value);
  return n == null ? null : Math.round(n * 3.28084);
}

function firstPoint(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) return geom.coordinates;
  if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates?.[0])) return geom.coordinates[0];
  return null;
}

function featureToAerodrome(feature) {
  const p = feature.properties || {};
  const code = String(p.localidade_id || '').trim().toUpperCase();
  if (!code) return null;

  const point = firstPoint(feature);
  const lon = asNumber(p.longitude_dec) ?? asNumber(point?.[0]);
  const lat = asNumber(p.latitude_dec) ?? asNumber(point?.[1]);
  if (lat == null || lon == null) return null;

  const elevationM = asNumber(p.elevacao);
  const elevationFt = p.elev_uom === 'M' ? metersToFeet(elevationM) : elevationM;

  return {
    icao: code,
    name: String(p.nome || code).trim(),
    city: String(p.cidade || '').trim(),
    uf: String(p.uf || '').trim(),
    lat: Math.round(lat * 1_000_000) / 1_000_000,
    lon: Math.round(lon * 1_000_000) / 1_000_000,
    type: String(p.tipo || '').trim(),
    fir: String(p.fir || '').trim(),
    elevation_ft: elevationFt,
  };
}

async function fetchAerodromes() {
  const url = wfsUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoAISWEB ${LAYER} returned HTTP ${res.status}`);

  const data = await res.json();
  if (!data?.features?.length) {
    throw new Error(`GeoAISWEB ${LAYER} returned no features`);
  }

  return data.features;
}

async function main() {
  console.log(`Sincronizando aerodromos/helipontos do GeoAISWEB (${LAYER})...`);
  const features = await fetchAerodromes();
  const collected = new Map();
  let skipped = 0;

  for (const feature of features) {
    const item = featureToAerodrome(feature);
    if (!item) {
      skipped++;
      continue;
    }
    collected.set(item.icao, item);
  }

  const sorted = Array.from(collected.values()).sort((a, b) => a.icao.localeCompare(b.icao));
  const outPath = resolve(ROOT, 'src/data/aerodromes.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(sorted) + '\n');

  const amendments = new Map();
  for (const feature of features) {
    const amendment = feature.properties?.emenda;
    if (amendment) amendments.set(amendment, (amendments.get(amendment) || 0) + 1);
  }

  console.log(`Gravado ${sorted.length} localidades em ${outPath}`);
  console.log(`Ignorados sem codigo/coordenada: ${skipped}`);
  if (amendments.size) {
    console.log(
      `Emendas: ${Array.from(amendments.entries())
        .sort()
        .map(([key, count]) => `${key} (${count})`)
        .join(', ')}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
