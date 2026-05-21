#!/usr/bin/env node
// Sincroniza limites de TMA e CTR a partir do export de airspace do Brasil
// do OpenAIP. Regrava src/{tma,ctr}-boundaries.json.
//
// Fonte: bucket público de exports do OpenAIP no Google Cloud Storage.
// (O site openaip.net costuma ser bloqueado por allowlist, mas o bucket
//  storage.googleapis.com normalmente é acessível.)
//
// ATENÇÃO: OpenAIP é uma base COMUNITÁRIA (não-oficial). Use ciente disso.
// FIR não vem deste export (mantém-se a base existente).
//
// Uso:
//   node scripts/sync-airspace.mjs           # país padrão: br
//   AIRSPACE_COUNTRY=ar node scripts/sync-airspace.mjs

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTRY = (process.env.AIRSPACE_COUNTRY || 'br').toLowerCase();
const BUCKET = 'https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f';
const URL = `${BUCKET}/${COUNTRY}_asp.geojson`;

const PREPS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del', 'la']);

// OpenAIP fornece nomes sem acento — re-acentua localidades brasileiras.
const ACCENTS = {
  Amazonica: 'Amazônica', Anapolis: 'Anápolis', Belem: 'Belém', Brasilia: 'Brasília',
  Corumba: 'Corumbá', Cuiaba: 'Cuiabá', Florianopolis: 'Florianópolis', Galeao: 'Galeão',
  Guara: 'Guará', Ilheus: 'Ilhéus', Jose: 'José', Luis: 'Luís', Macae: 'Macaé',
  Macapa: 'Macapá', Maceio: 'Maceió', Maraba: 'Marabá', Maringa: 'Maringá',
  Ribeirao: 'Ribeirão', Santarem: 'Santarém', Sao: 'São', Taubate: 'Taubaté',
  Uberlandia: 'Uberlândia', Vitoria: 'Vitória',
};

function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && PREPS.has(w)) return w;
      const c = w.charAt(0).toUpperCase() + w.slice(1);
      return ACCENTS[c] || c;
    })
    .join(' ');
}

function cleanName(raw) {
  return titleCase(
    raw
      .replace(/^(TMA|CTR|ATZ|FIR|CTA|UTA)[-\s]+/i, '')
      .replace(/_/g, ' ')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .trim()
  );
}

// OpenAIP altitude units: 1=ft, 6=FL (flight level), 0=m
function fmtLimit(l) {
  if (!l || l.value == null) return '';
  if (l.unit === 6) return `FL${l.value}`;
  if (l.unit === 1) return l.value === 0 ? 'SFC' : `${l.value} ft`;
  if (l.unit === 0) return l.value === 0 ? 'SFC' : `${l.value} m`;
  return String(l.value);
}

function isPolygon(g) {
  return g && (g.type === 'Polygon' || g.type === 'MultiPolygon');
}

async function main() {
  console.log(`Baixando airspace do OpenAIP: ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${URL}`);
  const data = await res.json();
  console.log(`  ${data.features.length} áreas recebidas.\n`);

  const TYPES = { tma: /^TMA[-\s]/i, ctr: /^CTR[-\s]/i };

  for (const [type, re] of Object.entries(TYPES)) {
    const features = data.features
      .filter((f) => re.test(f.properties?.name || '') && isPolygon(f.geometry))
      .map((f) => ({
        type: 'Feature',
        properties: {
          id: f.properties.name,
          name: cleanName(f.properties.name),
          upper: fmtLimit(f.properties.upperLimit),
          lower: fmtLimit(f.properties.lowerLimit),
        },
        geometry: f.geometry,
      }))
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    const path = resolve(ROOT, `src/${type}-boundaries.json`);
    writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }));
    console.log(`  ${type}: ${features.length} polígonos -> ${path}`);
  }

  console.log('\nConcluído. FIR não foi alterado (não vem deste export).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
