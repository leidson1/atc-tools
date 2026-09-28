const VERSION_URL = 'https://leidson1.github.io/atc-tools/version.json';
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : 'dev';
// Identidade dos dados oficiais embutidos neste build: hash do conteúdo e a
// emenda AIRAC de onde vieram (ex.: "2026-09-03").
const DATA_HASH = (typeof __DATA_HASH__ !== 'undefined') ? __DATA_HASH__ : null;
const DATA_AMENDMENT = (typeof __DATA_AMENDMENT__ !== 'undefined') ? __DATA_AMENDMENT__ : null;

// "2026-09-03" -> "03/09/2026". Formata a string à mão: new Date("2026-09-03")
// é meia-noite UTC, que no fuso de Brasília ainda é o dia anterior. Aceitar só
// esse formato também garante que nada além de dígitos vá parar no innerHTML.
function formatarEmenda(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function isOfflineBuild() {
  // The single-file build is loaded from file:// or has no path / lives outside /atc-tools/
  if (location.protocol === 'file:') return true;
  // Otherwise we're being served from somewhere — likely the GH Pages site or a local server
  return false;
}

function showUpdateBanner(texto) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="update-content">
      <span class="update-text">${texto}</span>
      <div class="update-actions">
        <a href="https://leidson1.github.io/atc-tools/offline/" target="_blank" rel="noopener" class="btn-update-install">Baixar</a>
        <button id="btn-update-dismiss" class="btn-update-dismiss">Depois</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  document.getElementById('btn-update-dismiss')?.addEventListener('click', () => banner.remove());
}

function injectVersionLabel() {
  // Always show version in the welcome screen and as a small footer in settings
  const welcomeVer = document.querySelector('.welcome-version');
  if (!welcomeVer) return;
  // A emenda dos dados importa mais que a versão do app: é ela que diz se a
  // TMA/CTR e os aeródromos em mãos ainda valem.
  const emenda = formatarEmenda(DATA_AMENDMENT);
  const dados = emenda ? ` · dados: emenda ${emenda}` : '';
  welcomeVer.textContent = `v${APP_VERSION}${isOfflineBuild() ? ' (offline)' : ''}${dados}`;
}

async function checkRemoteVersion() {
  if (!isOfflineBuild()) return;
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();

    // Versao nova do app.
    if (data?.version && data.version !== APP_VERSION) {
      showUpdateBanner(
        `Nova versão disponível: <strong>v${data.version}</strong> (você está em v${APP_VERSION})`
      );
      return;
    }

    // Mesma versão do app, dados oficiais diferentes: o caso comum, já que o
    // DECEA publica emenda a cada ciclo AIRAC e a versão do app quase nunca
    // muda. Compara o conteúdo, não datas — a data de geração mudava a cada
    // checagem diária mesmo sem dado novo, e o aviso aparecia todo dia.
    if (data?.data_hash && DATA_HASH && data.data_hash !== DATA_HASH) {
      const remota = formatarEmenda(data.data_amendment);
      const local = formatarEmenda(DATA_AMENDMENT);
      showUpdateBanner(
        remota && remota !== local
          ? `Nova emenda dos dados oficiais: <strong>${remota}</strong>` +
              (local ? ` (esta cópia é da emenda ${local})` : '')
          : 'Os dados oficiais foram corrigidos depois que esta cópia foi baixada'
      );
    }
  } catch {
    // Silently fail - no internet or CORS, etc.
  }
}

export function initVersionIndicator() {
  injectVersionLabel();
  // Defer the network check so it doesn't block startup
  setTimeout(checkRemoteVersion, 2000);
}
