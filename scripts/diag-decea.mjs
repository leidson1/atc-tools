#!/usr/bin/env node
// Sondagem das fontes do DECEA a partir do runner do GitHub Actions.
// Criado no incidente de 23/10/2026, quando todas as camadas do GeoAISWEB
// passaram a responder HTTP 403. Testa combinacoes de cabecalho e endpoint e
// imprime status, cabecalhos relevantes e o inicio do corpo de cada resposta,
// para distinguir bloqueio por User-Agent, Referer, IP, autenticacao ou URL.

const GEO = 'https://geoaisweb.decea.mil.br';
const WFS = `${GEO}/geoserver/ICA/wfs`;
const SMALL = 'service=WFS&version=2.0.0&request=GetFeature&typeNames=ICA:fir&outputFormat=application/json&srsName=EPSG:4326&count=1';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const BROWSER = {
  'User-Agent': BROWSER_UA,
  Accept: 'application/json,text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const PERFIS = [
  ['node-padrao', {}],
  ['ua-descritivo', { 'User-Agent': 'ATC-Tools/0.12 (+https://github.com/leidson1/atc-tools)' }],
  ['navegador', BROWSER],
  ['navegador+referer', { ...BROWSER, Referer: `${GEO}/`, Origin: GEO }],
];

const ALVOS = [
  ['raiz', `${GEO}/`],
  ['geoserver-web', `${GEO}/geoserver/web/`],
  ['wfs-capabilities', `${WFS}?service=WFS&request=GetCapabilities`],
  ['wfs-getfeature-fir', `${WFS}?${SMALL}`],
  ['wfs-global', `${GEO}/geoserver/wfs?${SMALL}`],
  ['ows-global', `${GEO}/geoserver/ows?${SMALL}`],
  ['http-sem-tls', `http://geoaisweb.decea.mil.br/geoserver/ICA/wfs?${SMALL}`],
  ['controle-aisweb', 'https://aisweb.decea.mil.br/?i=aerodromos&tab=rotaer'],
];

const HEADERS_INTERESSANTES = [
  'server', 'content-type', 'content-length', 'location', 'www-authenticate',
  'set-cookie', 'via', 'x-cache', 'cf-ray', 'cf-mitigated', 'x-iinfo', 'x-cdn',
  'x-amz-cf-id', 'akamai-grn', 'x-sucuri-id', 'x-powered-by', 'retry-after',
];

async function sondar(nomeAlvo, url, nomePerfil, headers) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, redirect: 'manual', signal: ctl.signal });
    const corpo = (await res.text()).replace(/\s+/g, ' ').slice(0, 260);
    const hs = HEADERS_INTERESSANTES
      .map((h) => [h, res.headers.get(h)])
      .filter(([, v]) => v)
      .map(([h, v]) => `${h}=${h === 'set-cookie' ? v.split(';')[0].split('=')[0] + '=…' : v}`)
      .join(' | ');
    console.log(`[${nomeAlvo}] [${nomePerfil}] HTTP ${res.status} em ${Date.now() - t0}ms`);
    if (hs) console.log(`    headers: ${hs}`);
    console.log(`    corpo: ${corpo}`);
    return res.status;
  } catch (e) {
    console.log(`[${nomeAlvo}] [${nomePerfil}] ERRO ${e.cause?.code || ''} ${e.message} em ${Date.now() - t0}ms`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

const matriz = {};
for (const [nomeAlvo, url] of ALVOS) {
  console.log(`\n========== ${nomeAlvo}: ${url}`);
  matriz[nomeAlvo] = {};
  for (const [nomePerfil, headers] of PERFIS) {
    matriz[nomeAlvo][nomePerfil] = await sondar(nomeAlvo, url, nomePerfil, headers);
  }
}

console.log('\n========== RESUMO (status por alvo x perfil)');
console.log(['alvo'.padEnd(20), ...PERFIS.map(([p]) => p.padEnd(18))].join(''));
for (const [nomeAlvo] of ALVOS) {
  console.log([nomeAlvo.padEnd(20), ...PERFIS.map(([p]) => String(matriz[nomeAlvo][p] ?? 'erro').padEnd(18))].join(''));
}
