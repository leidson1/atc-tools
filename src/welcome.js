import { getAerodromeInfo, getApiConfig, saveApiConfig } from './api.js';

/**
 * Shows the welcome screen on first run.
 * Returns a Promise that resolves with the selected aerodrome ICAO code.
 * If the user already configured a base aerodrome, resolves immediately.
 */
export function showWelcomeIfNeeded() {
  return new Promise(async (resolve) => {
    // Check if user already has a configured aerodrome (not first run)
    try {
      const config = await getApiConfig();
      if (config.default_aerodrome && config.default_aerodrome !== 'SBPJ') {
        // User already configured - skip welcome
        resolve(config.default_aerodrome);
        return;
      }

      // Check if there's a stored flag for "welcome completed"
      if (localStorage.getItem('atc_welcome_done') === 'true') {
        resolve(config.default_aerodrome || 'SBPJ');
        return;
      }
    } catch {
      // First run - show welcome
    }

    // Show welcome screen
    const screen = document.getElementById('welcome-screen');
    const input = document.getElementById('welcome-ad-input');
    const infoDiv = document.getElementById('welcome-ad-info');
    const infoName = document.getElementById('welcome-ad-name');
    const btnStart = document.getElementById('btn-welcome-start');

    screen.classList.remove('hidden');
    input.focus();

    let selectedIcao = null;
    let debounce = null;

    // Auto-lookup as user types
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      const icao = input.value.trim();

      clearTimeout(debounce);
      infoDiv.classList.add('hidden');
      btnStart.disabled = true;
      selectedIcao = null;

      if (icao.length === 4) {
        debounce = setTimeout(async () => {
          try {
            const info = await getAerodromeInfo(icao);
            infoName.textContent = `${info.icao_code} - ${info.name} (${info.city}/${info.state})`;
            infoDiv.classList.remove('hidden');
            btnStart.disabled = false;
            selectedIcao = icao;
          } catch {
            infoName.textContent = `${icao} não encontrado`;
            infoDiv.classList.remove('hidden');
            infoDiv.style.background = '#fef2f2';
            infoDiv.style.borderColor = '#fca5a5';
            infoName.style.color = '#dc2626';
          }
        }, 300);
      }
    });

    // Enter to confirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && selectedIcao) {
        confirmSelection();
      }
    });

    // Start button
    btnStart.addEventListener('click', confirmSelection);

    async function confirmSelection() {
      if (!selectedIcao) return;

      // Save the selection
      try {
        const config = await getApiConfig();
        await saveApiConfig(config.api_key, config.api_pass, selectedIcao);
      } catch {
        // Ignore save errors
      }

      // Mark welcome as done
      localStorage.setItem('atc_welcome_done', 'true');

      // Hide welcome with fade
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.4s ease';
      setTimeout(() => {
        screen.classList.add('hidden');
        screen.style.opacity = '';
        resolve(selectedIcao);
      }, 400);
    }
  });
}
