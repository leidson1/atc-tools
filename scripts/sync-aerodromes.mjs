#!/usr/bin/env node
// Sync aerodromes from AISWEB (DECEA) ROTAER API into src/data/aerodromes.json
//
// Usage:
//   node scripts/sync-aerodromes.mjs
//   AISWEB_KEY=... AISWEB_PASS=... node scripts/sync-aerodromes.mjs
//
// The defaults below are the same credentials that shipped with the previous
// Tauri build; override with env vars if you have your own.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const API_KEY = process.env.AISWEB_KEY || '1131205333';
const API_PASS = process.env.AISWEB_PASS || '426320c8-30a9-11f0-a1fe-0050569ac2e1';
const BASE = 'https://aisweb.decea.mil.br/api/';

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

function extractField(xml, field) {
  const open = `<${field}>`;
  const close = `</${field}>`;
  const start = xml.indexOf(open);
  if (start < 0) return null;
  const end = xml.indexOf(close, start);
  if (end < 0) return null;
  const value = xml.slice(start + open.length, end).trim();
  return value || null;
}

function extractCdata(xml, field) {
  const raw = extractField(xml, field);
  if (!raw) return null;
  const cdataStart = raw.indexOf('<![CDATA[');
  if (cdataStart < 0) return raw;
  const cdataEnd = raw.indexOf(']]>');
  if (cdataEnd < 0) return raw;
  return raw.slice(cdataStart + 9, cdataEnd).trim() || null;
}

function parseItems(xml) {
  const items = [];
  let cursor = 0;
  while (true) {
    const itemStart = xml.indexOf('<item', cursor);
    if (itemStart < 0) break;
    const itemEnd = xml.indexOf('</item>', itemStart);
    if (itemEnd < 0) break;
    const block = xml.slice(itemStart, itemEnd + 7);
    cursor = itemEnd + 7;

    const icao = extractField(block, 'AeroCode');
    const lat = parseFloat(extractField(block, 'lat'));
    const lon = parseFloat(extractField(block, 'lng'));
    if (!icao || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    items.push({
      icao,
      name: extractCdata(block, 'name') || icao,
      city: extractCdata(block, 'city') || '',
      uf: extractField(block, 'uf') || '',
      lat,
      lon,
    });
  }
  return items;
}

async function fetchUfPage(uf, page) {
  const url = `${BASE}?apiKey=${API_KEY}&apiPass=${API_PASS}&area=rotaer&uf=${uf}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${uf} page ${page}`);
  return parseItems(await res.text());
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`Sincronizando aeródromos do ROTAER (AISWEB)...`);
  const collected = new Map();
  let errors = 0;

  for (let i = 0; i < UFS.length; i++) {
    const uf = UFS[i];
    let page = 1;
    let ufCount = 0;

    while (true) {
      try {
        const items = await fetchUfPage(uf, page);
        if (items.length === 0) break;
        for (const a of items) collected.set(a.icao, a);
        ufCount += items.length;
        if (items.length < 100) break;
        page++;
        await sleep(50);
      } catch (e) {
        console.warn(`  ! ${uf} pag ${page}: ${e.message}`);
        errors++;
        break;
      }
    }
    console.log(`  [${i + 1}/${UFS.length}] ${uf}: ${ufCount} aeródromos (total: ${collected.size})`);
    await sleep(100);
  }

  const sorted = Array.from(collected.values()).sort((a, b) => a.icao.localeCompare(b.icao));
  const outPath = resolve(ROOT, 'src/data/aerodromes.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(sorted) + '\n');

  console.log(`\nGravado ${sorted.length} aeródromos em ${outPath}`);
  if (errors > 0) console.log(`Atenção: ${errors} erros durante o sync.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
