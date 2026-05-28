#!/usr/bin/env node
// Sync FIR, TMA, and CTR boundaries from the official DECEA GeoAISWEB WFS.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WFS_BASE = 'https://geoaisweb.decea.mil.br/geoserver/ICA/wfs';

const LAYERS = [
  { type: 'fir', layer: 'ICA:fir', path: 'src/fir-boundaries.json' },
  { type: 'tma', layer: 'ICA:TMA', path: 'src/tma-boundaries.json' },
  { type: 'ctr', layer: 'ICA:CTR', path: 'src/ctr-boundaries.json' },
];

function wfsUrl(layer) {
  const qs = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  return `${WFS_BASE}?${qs.toString()}`;
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLimit(value, unit, lower = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (lower && n === 0) return 'SFC';
  if (unit === 'FL') return `FL${n}`;
  if (unit === 'FT') return `${n} ft`;
  if (unit === 'M') return `${n} m`;
  return String(n);
}

function featureId(type, props) {
  if (type === 'fir') return props.ident || props.nam || '';
  const name = props.nam || props.ident || type.toUpperCase();
  return `${type.toUpperCase()}-${String(name).toUpperCase()}`;
}

function transformFeature(type, feature) {
  const p = feature.properties || {};
  const name = titleCase(p.nam || p.ident || type.toUpperCase());
  const props = {
    id: featureId(type, p),
    name,
  };

  if (type !== 'fir') {
    props.upper = formatLimit(p.upperlimit, p.uplimituni || p.uomdistver);
    props.lower = formatLimit(p.lowerlimi1, p.lowerlimit, true);
    props.related_fir = p.relatedfir || '';
  }

  return {
    type: 'Feature',
    properties: props,
    geometry: feature.geometry,
  };
}

async function fetchLayer(layer) {
  const res = await fetch(wfsUrl(layer));
  if (!res.ok) throw new Error(`${layer} HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.features?.length) throw new Error(`${layer} returned no features`);
  return data.features;
}

async function main() {
  console.log('Sincronizando espacos aereos do GeoAISWEB...');

  for (const item of LAYERS) {
    const features = await fetchLayer(item.layer);
    const out = {
      type: 'FeatureCollection',
      features: features
        .map((feature) => transformFeature(item.type, feature))
        .sort((a, b) => a.properties.id.localeCompare(b.properties.id)),
    };

    const path = resolve(ROOT, item.path);
    writeFileSync(path, JSON.stringify(out) + '\n');
    console.log(`  ${item.type}: ${out.features.length} poligonos -> ${path}`);
  }

  console.log('Concluido.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
