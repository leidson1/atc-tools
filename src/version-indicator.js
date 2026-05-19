const VERSION_URL = 'https://leidson1.github.io/atc-tools/version.json';
const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : 'dev';

function isOfflineBuild() {
  // The single-file build is loaded from file:// or has no path / lives outside /atc-tools/
  if (location.protocol === 'file:') return true;
  // Otherwise we're being served from somewhere — likely the GH Pages site or a local server
  return false;
}

function showUpdateBanner(remoteVersion) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="update-content">
      <span class="update-text">
        Nova versão disponível: <strong>v${remoteVersion}</strong> (você está em v${APP_VERSION})
      </span>
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
  if (welcomeVer) welcomeVer.textContent = `v${APP_VERSION}${isOfflineBuild() ? ' (offline)' : ''}`;
}

async function checkRemoteVersion() {
  if (!isOfflineBuild()) return;
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.version && data.version !== APP_VERSION) {
      showUpdateBanner(data.version);
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
