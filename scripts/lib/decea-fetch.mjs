// Cliente HTTP unico para as fontes do DECEA (GeoAISWEB e AISWEB), usado pela
// checagem e pelos tres scripts de sincronizacao.

// Identificacao honesta: um operador do DECEA que olhar o log de acesso precisa
// saber quem e o cliente e onde encontrar o projeto. Tambem e o que permitiria
// a eles liberar este acesso especifico, se decidirem fazer isso.
export const USER_AGENT = 'ATC-Tools-DataSync/1.0 (+https://github.com/leidson1/atc-tools)';

// A fonte respondeu com o desafio anti-robo do Cloudflare. O GeoAISWEB passou a
// ficar atras do Cloudflare em 22/10/2026 e, desde entao, toda requisicao
// automatizada recebe HTTP 403 com `cf-mitigated: challenge` e a pagina
// "Just a moment...", que so um navegador executando JavaScript resolve.
// Nao e queda de rede (insistir nao adianta) nem camada renomeada (todas as
// URLs do host respondem igual): e uma politica de acesso do DECEA.
export class AcessoBloqueadoError extends Error {
  constructor(url, res, tipo = 'desafio') {
    const host = new URL(url).host;
    const oque = tipo === 'desafio' ? 'desafio anti-robo' : 'bloqueio';
    super(`${host} respondeu HTTP ${res.status} com ${oque} do Cloudflare`);
    this.name = 'AcessoBloqueadoError';
    this.host = host;
    this.status = res.status;
    this.tipo = tipo;
    this.cfRay = res.headers.get('cf-ray') || null;
  }
}

// Bloqueio na borda do Cloudflare sem desafio (regra com acao "Block", erro
// 1020, limite de taxa 1015): vem sem `cf-mitigated`, mas com a pagina de erro
// do proprio Cloudflare. Um erro do GeoServer repassado pelo Cloudflare tambem
// traz `server: cloudflare`, so que com o corpo do GeoServer — por isso o teste
// olha a assinatura da pagina, nao so o cabecalho.
async function isBloqueioCloudflare(res) {
  if (res.ok || ![403, 429, 503].includes(res.status)) return false;
  if (!/cloudflare/i.test(res.headers.get('server') || '')) return false;
  try {
    const corpo = await res.clone().text();
    return /cf-error-details|Cloudflare Ray ID|error code:\s*10\d\d|Attention Required! \| Cloudflare/i.test(corpo);
  } catch {
    return false;
  }
}

export function isAcessoBloqueado(e) {
  return e instanceof AcessoBloqueadoError;
}

// Resposta de gateway dizendo que o servidor de origem nao respondeu: 502/504
// de qualquer proxy, 503 (indisponivel) e os 520-526 do Cloudflare ("origem
// inalcancavel", "timeout de origem"...). Na pratica e o servidor fora do ar,
// e precisa ser tratado como falha de rede — repetido, e "pula hoje" se nao
// voltar — e nao como camada quebrada. Sem isso, com a .gov.br fora por rede e
// o Cloudflare da .mil.br respondendo 522, o alarme diria "camada renomeada".
const STATUS_ORIGEM_INDISPONIVEL = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);

export class OrigemIndisponivelError extends Error {
  constructor(url, res) {
    super(`${new URL(url).host} respondeu HTTP ${res.status} (servidor de origem indisponivel)`);
    this.name = 'OrigemIndisponivelError';
    this.status = res.status;
  }
}

// Erro de rede (fonte fora do ar) nao e falha do projeto.
export function isNetworkError(e) {
  if (isAcessoBloqueado(e)) return false;
  if (e instanceof OrigemIndisponivelError) return true;
  const code = String(e?.cause?.code || e?.code || '');
  const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR|ABORT/i.test(code)
    || /fetch failed|network|timeout|aborted/i.test(msg);
}

// Fetch resiliente: as fontes do DECEA caem com frequencia (ECONNRESET/timeout),
// entao falha de rede — e gateway avisando que a origem caiu — e repetida com
// backoff. Demais respostas HTTP nao sao repetidas, e desafio ou bloqueio do
// Cloudflare vira AcessoBloqueadoError na primeira resposta.
export async function fetchDecea(url, options = {}, { attempts = 4, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
        signal: controller.signal,
      });
      if (res.headers.get('cf-mitigated') === 'challenge') {
        throw new AcessoBloqueadoError(url, res, 'desafio');
      }
      if (await isBloqueioCloudflare(res)) {
        throw new AcessoBloqueadoError(url, res, 'bloqueio');
      }
      // Depois do teste de bloqueio: um 503 com a pagina de erro do
      // Cloudflare e bloqueio; um 503 qualquer e servidor indisponivel.
      if (STATUS_ORIGEM_INDISPONIVEL.has(res.status)) {
        throw new OrigemIndisponivelError(url, res);
      }
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
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

// Duas portas oficiais para o mesmo GeoServer do DECEA (workspace ICA), com as
// mesmas camadas e contagens. Desde 22/10/2026 a .mil.br fica atras do desafio
// anti-robo do Cloudflare; a .gov.br responde direto dos servidores do DECEA,
// com o certificado do proprio orgao (*.decea.gov.br), e e o endereco que o
// AISWEB usa no botao de download da pagina de Fixos. A ordem e a de
// preferencia. A troca acontece so por bloqueio ou falha de rede — erro HTTP de
// uma camada (404, 500) e devolvido como veio, porque e um problema real que
// precisa aparecer, nao ser mascarado pela outra porta.
export const WFS_BASES = [
  'https://geoaisweb.decea.gov.br/geoserver/ICA/wfs',
  'https://geoaisweb.decea.mil.br/geoserver/ICA/wfs',
];

export async function fetchWfs(params, options) {
  const qs = new URLSearchParams(params).toString();
  const falhas = [];
  for (const base of WFS_BASES) {
    try {
      return { res: await fetchDecea(`${base}?${qs}`, options), base };
    } catch (e) {
      if (!isAcessoBloqueado(e) && !isNetworkError(e)) throw e;
      falhas.push(e);
    }
  }
  // Todas as portas falharam. Se alguma caiu por rede, e transitorio: melhor
  // "pula hoje, tenta amanha" do que anunciar bloqueio definitivo. So e
  // bloqueio quando todas responderam com a barreira do Cloudflare.
  const rede = falhas.find((e) => isNetworkError(e));
  if (rede) throw rede;
  // Todas bloquearam: o erro carrega as demais portas, para o relatorio dizer
  // que nenhuma porta passou — e nao so a primeira.
  const [primeiro, ...outros] = falhas;
  primeiro.outros = outros;
  throw primeiro;
}
