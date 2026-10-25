#!/usr/bin/env node
// Data freshness report for official DECEA sources.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WFS_BASES, fetchDecea, fetchWfs, isAcessoBloqueado, isNetworkError } from './lib/decea-fetch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROTAER_PAGE = 'https://aisweb.decea.mil.br/?i=aerodromos&tab=rotaer';
const ROTAER_PDF = 'https://aisweb.decea.mil.br/downloads/rotaer/rotaer_completo.pdf';
const METADATA_PATH = resolve(ROOT, 'src/data/metadata.json');
const WRITE_METADATA = process.argv.includes('--write-metadata');
const FAIL_ON_CHANGE = process.argv.includes('--fail-on-change');
// Idade maxima da ultima sincronizacao completa antes de forcar uma nova.
const SYNC_MAX_DIAS = 7;

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

// Portas do WFS que de fato responderam nesta checagem (ver WFS_BASES).
const basesUsadas = new Set();

async function fetchLayerSummary(item) {
  const qs = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: item.layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  });
  const { res, base } = await fetchWfs(qs);
  if (!res.ok) throw new Error(`${item.layer} HTTP ${res.status}`);
  // So conta como porta usada a que de fato entregou a camada.
  basesUsadas.add(base);
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
    fetchDecea(ROTAER_PAGE),
    fetchDecea(ROTAER_PDF, { method: 'HEAD' }),
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
  const falhas = [];
  const metadata = {
    generated_at: new Date().toISOString(),
    sources: {
      rotaer_page: ROTAER_PAGE,
      rotaer_pdf: ROTAER_PDF,
      geoserver_wfs: WFS_BASES[0],
    },
    rotaer: null,
    layers: {},
  };

  const rotaer = await fetchRotaerSummary();
  metadata.rotaer = rotaer;
  // So publicacao de verdade conta como mudanca: numero da D-AMDT e vigencia.
  // ETag, Last-Modified e tamanho do PDF mudam quase todo dia sem emenda nova
  // (de 09/09 a 27/09, 18 dias seguidos), e compara-los disparava sync, commit
  // e deploy diarios sem nenhum dado novo. Continuam gravados, como registro.
  const sinalRotaer = (r) => r && { damdt: r.damdt, effective: r.effective };
  const rotaerChanged = hasChanged(sinalRotaer(rotaer), sinalRotaer(previous?.rotaer));
  if (rotaerChanged) shouldFail = true;

  // Rede de seguranca. O ruido diario do PDF tinha um efeito colateral util:
  // forcava um sync completo todo dia, o que pegava de brinde uma correcao do
  // DECEA que nao alterasse contagem nem emenda de nenhuma camada. Sem ele,
  // essa correcao passaria despercebida ate a proxima emenda; com este limite,
  // e pega em no maximo SYNC_MAX_DIAS.
  const ultimaSync = Date.parse(previous?.generated_at || '');
  const idadeDias = Number.isFinite(ultimaSync) ? (Date.now() - ultimaSync) / 86_400_000 : null;
  const syncVencido = idadeDias !== null && idadeDias >= SYNC_MAX_DIAS;
  if (syncVencido) shouldFail = true;

  if (idadeDias !== null) {
    console.log(
      `Ultima sincronizacao completa: ha ${idadeDias.toFixed(1)} dia(s)` +
        (syncVencido ? ` | REVALIDACAO (limite de ${SYNC_MAX_DIAS} dias)` : '') +
        '\n'
    );
  }

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
      // Registra em vez de so imprimir: antes este catch engolia o erro e o
      // script saia com codigo 0, entao uma camada renomeada pelo DECEA
      // congelava os dados aeronauticos com o workflow verde.
      falhas.push({ layer: item.layer, label: item.label, err });
      console.log(`  ${item.label}: erro - ${err.message}`);
    }
  }

  if (basesUsadas.size) {
    // Registra a porta que de fato serviu os dados; se um dia ela trocar
    // (por bloqueio ou queda), isso fica visivel no log e no historico.
    metadata.sources.geoserver_wfs = [...basesUsadas].join(', ');
    const hosts = [...basesUsadas].map((b) => new URL(b).host).join(', ');
    const reserva = !basesUsadas.has(WFS_BASES[0]);
    console.log(`  Servidor WFS: ${hosts}${reserva ? ' (porta reserva: a principal falhou)' : ''}`);
  }

  if (falhas.length) {
    const nomes = falhas.map((f) => f.label).join(', ');

    // Fonte fora do ar e diferente de fonte quebrada. Queda de rede ja tem
    // tratamento proprio (codigo 3 = pula hoje, tenta amanha); qualquer
    // outro erro significa que a camada mudou de nome/sumiu, e isso precisa
    // falhar alto.
    if (falhas.every((f) => isNetworkError(f.err))) {
      console.log(`\nFontes inacessiveis (rede): ${nomes}. Pulando hoje.`);
      process.exit(3);
    }

    // Bloqueio por politica de acesso: nem rede (insistir nao adianta) nem
    // camada renomeada. Codigo proprio para o workflow nao mandar ninguem
    // procurar rename de camada, como a primeira versao desta mensagem fazia.
    const bloqueios = falhas.filter((f) => isAcessoBloqueado(f.err));
    if (bloqueios.length) {
      // Compara com o total de camadas, nao de falhas: com so TMA e CTR
      // bloqueadas, "todas" seria falso e esconderia que o resto respondeu.
      const alcance = bloqueios.length === LAYERS.length
        ? 'todas as camadas consultadas'
        : `as camadas ${bloqueios.map((f) => f.label).join(', ')}`;
      relatarBloqueio(bloqueios.map((f) => f.err), alcance);
      process.exit(5);
    }

    console.log(`\nFALHA: camada(s) do GeoAISWEB inacessiveis por erro nao-transitorio: ${nomes}.`);
    console.log('Verifique se o DECEA renomeou ou removeu a camada (ja aconteceu antes;');
    console.log('veja LAYER_CANDIDATES em scripts/sync-waypoints.mjs).');
    process.exit(4);
  }

  // Rede de seguranca: mesmo sem excecao, o metadata precisa ter as 7 camadas.
  const ausentes = LAYERS.filter((i) => !metadata.layers[i.layer]).map((i) => i.label);
  if (ausentes.length) {
    console.log(`\nFALHA: camada(s) ausentes no metadata apos a coleta: ${ausentes.join(', ')}.`);
    process.exit(4);
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

function relatarBloqueio(errosBrutos, alcance) {
  // Cada erro pode trazer as outras portas do WFS que tambem bloquearam.
  const erros = errosBrutos.flatMap((e) => [e, ...(e.outros || [])]);
  const hosts = [...new Set(erros.map((e) => e.host))].join(', ');
  const rays = [...new Set(erros.map((e) => e.cfRay).filter(Boolean))].slice(0, 3).join(', ');
  const desafio = erros.some((e) => e.tipo === 'desafio');
  console.log(`\nBLOQUEIO em ${hosts}: ${alcance} recusada(s) com ${desafio ? 'o desafio anti-robo' : 'um bloqueio'} do Cloudflare`);
  console.log(desafio
    ? '(HTTP 403, cf-mitigated: challenge, pagina "Just a moment...").'
    : `(HTTP ${erros[0].status} com a pagina de erro do Cloudflare, ex.: erro 1020 ou 1015).`);
  console.log('Nao e queda de rede nem camada renomeada: e uma politica de acesso do DECEA, e');
  console.log('enquanto ela valer os dados aeronauticos nao atualizam. A checagem diaria volta a');
  console.log('sincronizar sozinha quando o acesso for liberado.');
  if (rays) console.log(`Referencia para o DECEA (cf-ray): ${rays}`);
}

main().catch((e) => {
  // O ROTAER e buscado fora do laco de camadas; um bloqueio nele chega aqui.
  if (isAcessoBloqueado(e)) {
    relatarBloqueio([e], 'a consulta');
    process.exit(5);
  }
  console.error(e);
  process.exit(isNetworkError(e) ? 3 : 1);
});
