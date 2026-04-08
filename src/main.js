import './styles/main.css';
import './styles/panel.css';
import './styles/map.css';
import './styles/components.css';

import { calculateRdl, getAerodromeInfo, lookupPoint } from './api.js';
import { initMap, setAerodrome, showRdlOnMap } from './map.js';
import { drawCompassRose } from './compass-rose.js';
import { displayResult, clearHistory, initCopyButton, showToast } from './results-panel.js';
import { initSettings, getDefaultAerodrome } from './settings.js';

// App state
let baseAerodrome = null;
let map = null;

async function init() {
  // Initialize map
  map = initMap('map', onMapClick);

  // Initialize settings
  initSettings(onSettingsSave);

  // Initialize copy button
  initCopyButton();

  // Target input - Enter to calculate
  const targetInput = document.getElementById('target-input');
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCalculateClick();
    }
  });

  // Auto uppercase
  targetInput.addEventListener('input', () => {
    targetInput.value = targetInput.value.toUpperCase();
  });

  // Calculate button
  document.getElementById('btn-calculate').addEventListener('click', onCalculateClick);

  // Clear history button
  document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

  // History click handler
  window.__onHistoryClick = (result) => {
    displayResult(result);
    showRdlOnMap(result);
  };

  // Keyboard shortcut: Ctrl+Enter to calculate
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      onCalculateClick();
    }
  });

  // Load base aerodrome
  await loadBaseAerodrome();

  // Focus on target input
  targetInput.focus();
}

async function loadBaseAerodrome() {
  try {
    const defaultIcao = await getDefaultAerodrome();
    const info = await getAerodromeInfo(defaultIcao);
    setBaseAerodrome(info);
  } catch (err) {
    // Fallback to SBPJ from hardcoded
    try {
      const info = await getAerodromeInfo('SBPJ');
      setBaseAerodrome(info);
    } catch {
      showToast('Configure o Aeródromo Base nas configurações', 'info');
    }
  }
}

function setBaseAerodrome(info) {
  baseAerodrome = info;

  // Update header
  document.getElementById('header-base-icao').textContent = info.icao_code;

  // Update base info card
  document.getElementById('base-name').textContent = info.name;
  document.getElementById('base-icao').textContent = info.icao_code;
  document.getElementById('base-city').textContent = `${info.city}/${info.state}`;
  document.getElementById('base-arp').textContent = `${info.arp_lat.toFixed(4)}, ${info.arp_lon.toFixed(4)}`;
  document.getElementById('base-elev').textContent = `${info.elevation_ft} ft`;

  const varMag = info.magnetic_variation;
  document.getElementById('base-var').textContent = varMag
    ? `${Math.abs(varMag).toFixed(1)}° ${varMag < 0 ? 'W' : 'E'}`
    : '--';

  // Update RDL label
  const rdlBaseLabel = document.getElementById('rdl-base-icao');
  if (rdlBaseLabel) rdlBaseLabel.textContent = info.icao_code;

  // Update map
  setAerodrome(info.arp_lat, info.arp_lon, info.name, info.icao_code);

  // Draw compass rose
  const decl = varMag || -21;
  drawCompassRose(map, info.arp_lat, info.arp_lon, decl);

  updateStatus(`Base: ${info.icao_code}`);
}

async function onCalculateClick() {
  if (!baseAerodrome) {
    showToast('Aeródromo base não carregado', 'error');
    return;
  }

  const targetIcao = document.getElementById('target-input').value.trim().toUpperCase();
  if (!targetIcao || targetIcao.length < 4) {
    showToast('Digite o indicativo ICAO do aeródromo (4 letras)', 'warning');
    document.getElementById('target-input').focus();
    return;
  }

  // Show loading state
  const btn = document.getElementById('btn-calculate');
  const originalText = btn.textContent;
  btn.textContent = 'Buscando...';
  btn.disabled = true;

  try {
    // Step 1: Lookup the point (AD or FIX) - fetches from cache or API automatically
    const point = await lookupPoint(targetIcao);

    // Step 2: Calculate RDL from base to target
    const result = await calculateRdl(
      baseAerodrome.icao_code,
      point.lat,
      point.lon
    );

    // Add target info to result for display
    result.target_name = point.name;
    result.target_icao = point.identifier;
    result.target_type = point.point_type;
    result.target_info = point.info;

    // Step 3: Display result
    displayResult(result);
    showRdlOnMap(result);

    // Update target name in result section
    const typeLabel = point.point_type === 'AD' ? '' : `[${point.point_type}] `;
    document.getElementById('rdl-target-name').textContent =
      `${typeLabel}${point.identifier} - ${point.name} ${point.info ? '(' + point.info + ')' : ''}`;

    showToast(`${targetIcao}: RDL ${result.formatted}`, 'success');
  } catch (err) {
    showToast(`Erro ao buscar ${targetIcao}: ${err}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    document.getElementById('target-input').select();
  }
}

async function onMapClick(lat, lon) {
  if (!baseAerodrome) {
    showToast('Aeródromo base não carregado', 'warning');
    return;
  }

  try {
    const result = await calculateRdl(baseAerodrome.icao_code, lat, lon);
    result.target_name = `Ponto no mapa`;
    result.target_icao = 'MAP';
    displayResult(result);
    showRdlOnMap(result);

    document.getElementById('rdl-target-name').textContent =
      `Ponto: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch (err) {
    showToast(`Erro no cálculo: ${err}`, 'error');
  }
}

async function onSettingsSave(config) {
  if (config.defaultAerodrome) {
    try {
      const info = await getAerodromeInfo(config.defaultAerodrome);
      setBaseAerodrome(info);
      showToast(`Base atualizada: ${info.icao_code}`, 'success');
    } catch (err) {
      showToast(`Erro ao carregar ${config.defaultAerodrome}: ${err}`, 'error');
    }
  }
}

function updateStatus(text) {
  const el = document.getElementById('connection-status');
  el.textContent = text;
  el.classList.add('connected');
}

// Start app
document.addEventListener('DOMContentLoaded', init);
