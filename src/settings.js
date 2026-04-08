import { getApiConfig, saveApiConfig, getCacheStats } from './api.js';
import { showToast } from './results-panel.js';

export function initSettings(onSave) {
  const modal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const btnSave = document.getElementById('btn-save-settings');

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
    const defaultAero = document.getElementById('settings-default-aero').value.trim().toUpperCase();

    try {
      // Keep existing API keys (hardcoded), just update aerodrome
      const config = await getApiConfig();
      await saveApiConfig(config.api_key, config.api_pass, defaultAero);
      showToast('Configurações salvas!', 'success');
      modal.classList.add('hidden');

      if (onSave) {
        onSave({ defaultAerodrome: defaultAero || 'SBPJ' });
      }
    } catch (err) {
      showToast('Erro ao salvar: ' + err, 'error');
    }
  });
}

async function loadCacheStats() {
  try {
    const stats = await getCacheStats();
    const el = document.getElementById('stats-text');
    el.textContent = `${stats.total_ads} aeródromos + ${stats.waypoints} waypoints`;
  } catch (err) {
    console.error('Failed to load cache stats:', err);
  }
}

async function loadCurrentConfig() {
  try {
    const config = await getApiConfig();
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
