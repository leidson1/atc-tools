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
  constructor(url, res) {
    const host = new URL(url).host;
    super(`${host} respondeu HTTP ${res.status} com desafio anti-robo do Cloudflare`);
    this.name = 'AcessoBloqueadoError';
    this.host = host;
    this.status = res.status;
    this.cfRay = res.headers.get('cf-ray') || null;
  }
}

export function isAcessoBloqueado(e) {
  return e instanceof AcessoBloqueadoError;
}

// Erro de rede (fonte fora do ar) nao e falha do projeto.
export function isNetworkError(e) {
  if (isAcessoBloqueado(e)) return false;
  const code = String(e?.cause?.code || e?.code || '');
  const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR|ABORT/i.test(code)
    || /fetch failed|network|timeout|aborted/i.test(msg);
}

// Fetch resiliente: as fontes do DECEA caem com frequencia (ECONNRESET/timeout),
// entao falha de rede e repetida com backoff. Resposta HTTP nao e repetida, e
// desafio do Cloudflare vira AcessoBloqueadoError na primeira resposta.
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
        throw new AcessoBloqueadoError(url, res);
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
