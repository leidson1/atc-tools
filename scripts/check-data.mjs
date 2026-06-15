#!/usr/bin/env node
// Data freshness report for official DECEA sources.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WFS_BASE = 'https://geoaisweb.decea.mil.br/geoserver/ICA/wfs';
const ROTAER_PAGE = 'https://aisweb.decea.mil.br/?i=aerodromos&tab=rotaer';
const ROTAER_PDF = 'https://aisweb.decea.mil.br/downloads/rotaer/rotaer_completo.pdf';
const METADATA_PATH = resolve(ROOT, 'src/data/metadata.json');
const WRITE_METADATA = process.argv.includes('--write-metadata');
const FAIL_ON_CHANGE = process.argv.includes('--fail-on-change');

const LAYERS = [
  { label: 'Aerodromos/Helipontos', layer: 'ICA:airport_heliport', local: 'src/data/aerodromes.json', uniqueField: 'localidade_id' },
  { label: 'Fixos', layer: 'ICA:waypoint_aisweb', local: 'src/data/waypoints.json', uniqueField: 'ident' },
  { label: 'VOR', layer: 'ICA:vor' },
  { label: 'NDB', layer: 'ICA:ndb' },
  { label: 'TMA', layer: 'ICA:TMA', local: 'src/tma-boundaries.json', localGeoJson: true },
  { label: 'CTR', layer: 'ICA:CTR', local: 'src/ctr-boundaries.json', localGeoJson: true },
  { label: 'FIR', layer: 'ICA:fir', local: 'src/fir-boundaries.json', localGeoJson: true },
];

function localCount(item) {
  if (!item.local) return null;
  try {
    const data = JSON.parse(readFileSync(resolve(ROOT, item.local), 'utf8'));
    return item.localGeoJson ? data.features?.length ?? null : data.length ?? null;
  } catch {
    return null;
  }
}

function readLocalMetadata() {
  try {
    return JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function summarize(values) {
  const counts = new Map();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  if (!counts.size) return '-';
  return Array.from(counts.entries())
    .sort()
    .map(([value, count]) => `${value} (${count})`)
    .join(', ');
}

function hasChanged(current, previous) {
  if (!previous) return false;
  for (const [key, value] of Object.entries(current)) {
    if (String(value) !== String(previous[key])) return true;
  }
  return false;
}

// Fetch resiliente: as fontes do DECEA caem com frequencia (ECONNRESET/timeout).
// Sem isso, uma unica queda de rede derruba o run inteiro.
async function fetchWithRetry(url, options = {}, { attempts = 4, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        const backoff = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        console.log(`    (rede instavel: ${err.message}; tentativa ${attempt}/${attempts}, novo try em ${backoff}ms)`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function fetchLayerSummary(item) {
  const qs = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: item.layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  const res = await fetchWithRetry(`${WFS_BASE}?${qs.toString()}`);
  if (!res.ok) throw new Error(`${item.layer} HTTP ${res.status}`);
  const data = await res.json();
  const features = data.features || [];
  const amendments = features.map((f) => f.properties?.emenda);
  const futureAmendments = features.map((f) => f.properties?.emenda_futura);
  const uniqueCount = item.uniqueField
    ? new Set(features.map((f) => String(f.properties?.[item.uniqueField] || '').trim()).filter(Boolean)).size
    : null;

  return {
    layer: item.layer,
    officialCount: features.length,
    comparableCount: uniqueCount ?? features.length,
    uniqueCount,
    amendment: summarize(amendments),
    futureAmendment: summarize(futureAmendments),
  };
}

async function fetchRotaerSummary() {
  const [pageRes, pdfRes] = await Promise.all([
    fetchWithRetry(ROTAER_PAGE),
    fetchWithRetry(ROTAER_PDF, { method: 'HEAD' }),
  ]);

  let page = '';
  if (pageRes.ok) page = await pageRes.text();

  const damdt = page.match(/D-AMDT\s+\d+-\d+/i)?.[0] || page.match(/AMDT\s+\d+\/\d+/i)?.[0] || '-';
  const effective = page.match(/entrada em vigor[^:]*:\s*<strong[^>]*>([^<]+)/i)?.[1] || '-';

  return {
    damdt,
    effective,
    pdfLastModified: pdfRes.headers.get('last-modified') || '-',
    pdfEtag: pdfRes.headers.get('etag') || '-',
    pdfSize: pdfRes.headers.get('content-length') || '-',
  };
}

async function main() {
  console.log('ATC Tools - checagem de dados oficiais\n');

  const previous = readLocalMetadata();
  let shouldFail = false;
  const metadata = {
    generated_at: new Date().toISOString(),
    sources: {
      rotaer_page: ROTAER_PAGE,
      rotaer_pdf: ROTAER_PDF,
      geoserver_wfs: WFS_BASE,
    },
    rotaer: null,
    layers: {},
  };

  const rotaer = await fetchRotaerSummary();
  metadata.rotaer = rotaer;
  const rotaerChanged = hasChanged(rotaer, previous?.rotaer);
  if (rotaerChanged) shouldFail = true;

  console.log('ROTAER');
  console.log(`  Emenda pagina: ${rotaer.damdt}${rotaerChanged ? ' | MUDOU' : ''}`);
  console.log(`  Vigencia pagina: ${rotaer.effective}`);
  console.log(`  PDF Last-Modified: ${rotaer.pdfLastModified}`);
  console.log(`  PDF ETag: ${rotaer.pdfEtag}`);
  console.log(`  PDF bytes: ${rotaer.pdfSize}\n`);

  console.log('GeoAISWEB');
  for (const item of LAYERS) {
    try {
      const summary = await fetchLayerSummary(item);
      metadata.layers[item.layer] = summary;
      const local = localCount(item);
      const previousLayer = previous?.layers?.[item.layer];
      const remoteChanged = hasChanged(summary, previousLayer);
      if (remoteChanged) shouldFail = true;
      const status = local == null
        ? ''
        : local === summary.comparableCount
          ? 'OK'
          : `DIFERENTE local=${local}`;
      if (status.startsWith('DIFERENTE')) shouldFail = true;
      const unique = summary.uniqueCount == null ? '' : ` | unicos=${summary.uniqueCount}`;
      const changed = remoteChanged ? ' | MUDOU' : '';

      console.log(`  ${item.label}: oficial=${summary.officialCount}${unique}${status ? ` | ${status}` : ''}${changed}`);
      console.log(`    emenda: ${summary.amendment}`);
      console.log(`    futura: ${summary.futureAmendment}`);
    } catch (err) {
      console.log(`  ${item.label}: erro - ${err.message}`);
    }
  }

  if (WRITE_METADATA) {
    mkdirSync(dirname(METADATA_PATH), { recursive: true });
    writeFileSync(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`\nMetadata gravada em ${METADATA_PATH}`);
  } else if (!previous) {
    console.log('\nSem metadata local. Rode `npm run data:sync` para gravar uma fotografia da fonte oficial.');
    if (FAIL_ON_CHANGE) shouldFail = true;
  }

  if (FAIL_ON_CHANGE && shouldFail) {
    console.log('\nMudanca detectada na fonte oficial ou nos dados locais.');
    process.exit(2);
  }
}

// Erro de rede (fonte do DECEA fora do ar) nao e falha do projeto: sai com
// codigo 3 para o workflow tratar como "pula hoje, tenta amanha".
function isNetworkError(e) {
  const code = String(e?.cause?.code || e?.code || '');
  const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR|ABORT/i.test(code)
    || /fetch failed|network|timeout|aborted/i.test(msg);
}

main().catch((e) => {
  console.error(e);
  process.exit(isNetworkError(e) ? 3 : 1);
});
