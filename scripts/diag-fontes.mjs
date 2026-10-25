#!/usr/bin/env node
// Mapeia fontes oficiais alternativas no AISWEB (aisweb.decea.mil.br), que nao
// esta atras do Cloudflare, para substituir o GeoAISWEB bloqueado desde
// 23/10/2026. Le paginas publicas, lista links relevantes (API, AIP, ROTAER,
// downloads de dados geograficos) e testa o formato de resposta da API.
// Educado: so o host do AISWEB, no maximo MAX_REQ requisicoes, com pausa.

const BASE = 'https://aisweb.decea.mil.br';
const UA = 'ATC-Tools-DataSync/1.0 (+https://github.com/leidson1/atc-tools)';
const MAX_REQ = 40;
const PAUSA_MS = 400;
const INTERESSE = /api|desenvolv|developer|download|kml|kmz|shp|shape|geojson|\.zip|aip|enr|rotaer|carta|dados|xml|csv|espaco|espa%C3%A7o|tma|ctr|fir/i;

let feitas = 0;
const visto = new Set();

async function get(url) {
  if (feitas >= MAX_REQ) return null;
  feitas++;
  await new Promise((r) => setTimeout(r, PAUSA_MS));
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
    const tipo = res.headers.get('content-type') || '';
    const corpo = /text|json|xml|html/.test(tipo) ? await res.text() : '';
    const cf = res.headers.get('cf-mitigated');
    console.log(`  GET ${url}\n      -> HTTP ${res.status} | ${tipo.split(';')[0]} | ${res.headers.get('content-length') || corpo.length} bytes${cf ? ' | cf-mitigated=' + cf : ''} | server=${res.headers.get('server') || '-'}`);
    return { res, corpo, tipo };
  } catch (e) {
    console.log(`  GET ${url}\n      -> ERRO ${e.cause?.code || ''} ${e.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

function links(html, origem) {
  const out = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href;
    try { href = new URL(m[1].replace(/&amp;/g, '&'), origem).href; } catch { continue; }
    const texto = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (!out.has(href)) out.set(href, texto);
  }
  return out;
}

function interessa(href, texto) {
  return INTERESSE.test(href) || INTERESSE.test(texto);
}

console.log('==== 1. Pagina inicial do AISWEB: links relevantes');
const home = await get(`${BASE}/`);
const candidatos = [];
if (home) {
  for (const [href, texto] of links(home.corpo, `${BASE}/`)) {
    if (!href.startsWith(BASE) && !/decea\.(gov|mil)\.br/.test(href)) continue;
    if (!interessa(href, texto)) continue;
    console.log(`    • ${texto || '(sem texto)'}  →  ${href}`);
    candidatos.push(href);
  }
}

console.log('\n==== 2. Um nivel abaixo: arquivos e paginas de dados');
for (const url of candidatos.filter((u) => u.startsWith(BASE)).slice(0, 18)) {
  if (visto.has(url)) continue;
  visto.add(url);
  const p = await get(url);
  if (!p || !/html/.test(p.tipo)) continue;
  const achados = [...links(p.corpo, url)]
    .filter(([h, t]) => /\.(pdf|zip|kml|kmz|shp|xml|csv|json)(\?|$)/i.test(h) || /api|kml|shape|download|geo/i.test(h + ' ' + t))
    .slice(0, 25);
  for (const [h, t] of achados) console.log(`      ◦ ${t || '(sem texto)'}  →  ${h}`);
}

console.log('\n==== 3. API do AISWEB: formato de resposta sem credencial');
for (const q of [
  '/api/',
  '/api/?area=rotaer&icaoCode=SBPJ',
  '/api/?apiKey=teste&apiPass=teste&area=rotaer&icaoCode=SBPJ',
]) {
  const r = await get(`${BASE}${q}`);
  if (r) console.log(`      corpo: ${r.corpo.replace(/\s+/g, ' ').slice(0, 400)}`);
}

console.log(`\n${feitas} requisicoes feitas (limite ${MAX_REQ}).`);
