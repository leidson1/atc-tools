#!/usr/bin/env node
// Sincroniza os limites de espaço aéreo (FIR / TMA / CTR) do GeoServer
// do DECEA — a MESMA fonte de onde os boundaries originais foram tirados
// (commit v0.2.0). Regrava src/{fir,tma,ctr}-boundaries.json.
//
// IMPORTANTE: o GeoServer do DECEA NÃO é acessível do ambiente de nuvem
// (a política de rede só libera o GitHub). Rode este script na SUA
// máquina, que tem acesso a geoaisweb.decea.mil.br.
//
// Uso:
//   node scripts/sync-airspace.mjs
//
// Antes, confirme os nomes das layers abrindo no navegador:
//   https://geoaisweb.decea.mil.br/geoserver/ICA/ows?service=WFS&version=2.0.0&request=GetCapabilities
// e ajuste LAYER_CANDIDATES / FIELD_HINTS abaixo se necessário.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WFS = 'https://geoaisweb.decea.mil.br/geoserver/ICA/ows';

// Nomes de layer tentados em ordem (o DECEA já renomeou essas no passado).
const LAYER_CANDIDATES = {
  fir: ['ICA:fir', 'ICA:firs', 'ICA:fir_p'],
  tma: ['ICA:tma', 'ICA:tmas', 'ICA:tma_p'],
  ctr: ['ICA:ctr', 'ICA:ctrs', 'ICA:ctr_p'],
};

// Campos prováveis para id e nome (case-insensitive). O script também
// imprime TODAS as propriedades da 1ª feature pra você conferir/ajustar.
const FIELD_HINTS = {
  id: ['localidade_id', 'id', 'codigo', 'cd_loc', 'sigla', 'ident'],
  name: ['nome', 'name', 'localidade', 'denominacao', 'txt_name'],
};

async function fetchLayer(typeName) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  const res = await fetch(`${WFS}?${params}`);
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return data?.features?.length ? data : null;
  } catch {
    return null;
  }
}

function pick(props, hints) {
  const keys = Object.keys(props);
  for (const hint of hints) {
    const k = keys.find((x) => x.toLowerCase() === hint.toLowerCase());
    if (k && props[k] != null && String(props[k]).trim()) return String(props[k]).trim();
  }
  return '';
}

function isPolygon(geom) {
  return geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon');
}

async function syncType(type) {
  let raw = null;
  for (const layer of LAYER_CANDIDATES[type]) {
    process.stdout.write(`  ${type}: tentando ${layer} ... `);
    raw = await fetchLayer(layer);
    console.log(raw ? `${raw.features.length} features` : 'vazio');
    if (raw) break;
  }
  if (!raw) {
    console.warn(`  ! ${type}: nenhuma layer retornou dados — ajuste LAYER_CANDIDATES.`);
    return;
  }

  console.log(`  ${type}: propriedades disponíveis ->`, Object.keys(raw.features[0].properties || {}).join(', '));

  const features = raw.features
    .filter((f) => isPolygon(f.geometry))
    .map((f) => ({
      type: 'Feature',
      properties: {
        id: pick(f.properties, FIELD_HINTS.id),
        name: pick(f.properties, FIELD_HINTS.name),
      },
      geometry: f.geometry,
    }));

  const out = { type: 'FeatureCollection', features };
  const path = resolve(ROOT, `src/${type}-boundaries.json`);
  writeFileSync(path, JSON.stringify(out));
  console.log(`  ${type}: gravado ${features.length} polígonos em ${path}\n`);
}

async function main() {
  console.log('Sincronizando espaço aéreo do GeoServer DECEA...\n');
  for (const type of ['fir', 'tma', 'ctr']) {
    await syncType(type);
  }
  console.log('Concluído. Confira `git diff src/*-boundaries.json` (inclusive se a TMA Palmas apareceu).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
