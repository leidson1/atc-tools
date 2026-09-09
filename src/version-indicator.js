const VERSION_URL = 'https://leidson1.github.io/atc-tools/version.json';
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : 'dev';
// Data dos dados oficiais embutidos neste build (ROTAER/GeoAISWEB).
const DATA_DATE = (typeof __DATA_GENERATED_AT__ !== 'undefined') ? __DATA_GENERATED_AT__ : null;

function formatarData(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
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
  // A data dos dados importa mais que a versao do app: e ela que diz se o
  // ROTAER/TMA em maos ainda vale.
  const dados = DATA_DATE ? ` · dados de ${formatarData(DATA_DATE)}` : '';
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

    // Mesma versao de app, porem dados oficiais mais recentes. Este e o caso
    // comum: o ROTAER muda toda semana e a versao do app quase nunca.
    if (data?.data_generated_at && DATA_DATE && data.data_generated_at !== DATA_DATE) {
      const remota = new Date(data.data_generated_at);
      const local = new Date(DATA_DATE);
      if (remota > local) {
        showUpdateBanner(
          `Dados oficiais atualizados em <strong>${formatarData(data.data_generated_at)}</strong> ` +
            `(esta cópia é de ${formatarData(DATA_DATE)})`
        );
      }
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
