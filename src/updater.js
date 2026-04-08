import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { showToast } from './results-panel.js';

/**
 * Checks for updates on app startup.
 * If an update is available, shows a notification and offers to install.
 */
export async function checkForUpdates() {
  try {
    const update = await check();

    if (update) {
      showUpdateNotification(update);
    }
  } catch (err) {
    // Silently fail - don't bother user if update check fails
    console.log('Update check skipped:', err);
  }
}

function showUpdateNotification(update) {
  // Create update banner
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <div class="update-content">
      <span class="update-text">
        Nova versão disponível: <strong>v${update.version}</strong>
      </span>
      <div class="update-actions">
        <button id="btn-update-install" class="btn-update-install">Atualizar agora</button>
        <button id="btn-update-dismiss" class="btn-update-dismiss">Depois</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Install button
  document.getElementById('btn-update-install').addEventListener('click', async () => {
    const btn = document.getElementById('btn-update-install');
    btn.textContent = 'Baixando...';
    btn.disabled = true;

    try {
      await update.downloadAndInstall();
      showToast('Atualização instalada! Reiniciando...', 'success');
      await relaunch();
    } catch (err) {
      showToast('Erro ao atualizar: ' + err, 'error');
      btn.textContent = 'Tentar novamente';
      btn.disabled = false;
    }
  });

  // Dismiss button
  document.getElementById('btn-update-dismiss').addEventListener('click', () => {
    banner.remove();
  });
}
