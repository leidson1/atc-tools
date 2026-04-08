import { getApiConfig, saveApiConfig, syncRotaer, getCacheStats } from './api.js';
import { listen } from '@tauri-apps/api/event';
import { showToast } from './results-panel.js';

export function initSettings(onSave) {
  const modal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const btnSave = document.getElementById('btn-save-settings');
  const btnSync = document.getElementById('btn-sync-rotaer');

  btnOpen.addEventListener('click', async () => {
    await loadCurrentConfig();
    await loadCacheStats();
    modal.classList.remove('hidden');
  });

  btnClose.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });

  btnSave.addEventListener('click', async () => {
    const apiKey = document.getElementById('settings-api-key').value.trim();
    const apiPass = document.getElementById('settings-api-pass').value.trim();
    const defaultAero = document.getElementById('settings-default-aero').value.trim().toUpperCase();

    try {
      await saveApiConfig(apiKey, apiPass, defaultAero);
      showToast('Configurações salvas!', 'success');

      if (onSave) {
        onSave({ apiKey, apiPass, defaultAerodrome: defaultAero || 'SBPJ' });
      }
    } catch (err) {
      showToast('Erro ao salvar: ' + err, 'error');
    }
  });

  // Sync ROTAER button
  btnSync.addEventListener('click', startSync);

  // Listen for sync progress events from Rust
  listen('sync-progress', (event) => {
    const p = event.payload;
    updateSyncProgress(p.current, p.total, p.state_uf, p.status, p.message, p.aerodromes_found);
  });
}

async function startSync() {
  const btn = document.getElementById('btn-sync-rotaer');
  const progressContainer = document.getElementById('sync-progress-container');

  btn.disabled = true;
  btn.textContent = 'Sincronizando...';
  progressContainer.classList.remove('hidden');

  try {
    const result = await syncRotaer();

    showToast(
      `ROTAER sincronizado! ${result.total_aerodromes} aeródromos de ${result.total_states} estados.${result.errors > 0 ? ` (${result.errors} erros)` : ''}`,
      result.errors > 0 ? 'warning' : 'success'
    );

    await loadCacheStats();
  } catch (err) {
    showToast('Erro na sincronização: ' + err, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sincronizar ROTAER Completo';

    // Hide progress after 3 seconds
    setTimeout(() => {
      progressContainer.classList.add('hidden');
    }, 3000);
  }
}

function updateSyncProgress(current, total, stateUf, status, message, aerodromesFound) {
  const bar = document.getElementById('sync-bar');
  const statusEl = document.getElementById('sync-status');
  const countEl = document.getElementById('sync-count');

  const pct = (current / total) * 100;
  bar.style.width = `${pct}%`;

  const icon = status === 'ok' ? '✓' : status === 'empty' ? '○' : '✗';
  statusEl.textContent = `${icon} ${message}`;
  countEl.textContent = `${current}/${total} UFs | ${aerodromesFound} ADs`;
}

async function loadCacheStats() {
  try {
    const stats = await getCacheStats();
    const el = document.getElementById('stats-text');
    el.textContent = `${stats.total_ads} ADs (${stats.embedded} embutidos, ${stats.from_api} da API) + ${stats.waypoints} waypoints`;
  } catch (err) {
    console.error('Failed to load cache stats:', err);
  }
}

async function loadCurrentConfig() {
  try {
    const config = await getApiConfig();
    document.getElementById('settings-api-key').value = config.api_key || '';
    document.getElementById('settings-api-pass').value = config.api_pass || '';
    document.getElementById('settings-default-aero').value = config.default_aerodrome || 'SBPJ';
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

export async function getDefaultAerodrome() {
  try {
    const config = await getApiConfig();
    return config.default_aerodrome || 'SBPJ';
  } catch {
    return 'SBPJ';
  }
}
