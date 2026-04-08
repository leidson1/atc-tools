import './styles/main.css';
import './styles/panel.css';
import './styles/map.css';
import './styles/components.css';

import { calculateRdl, getAerodromeInfo, lookupPoint } from './api.js';
import { initMap, setAerodrome, showRdlOnMap } from './map.js';
import { drawCompassRose } from './compass-rose.js';
import { initAirspaceLayers, toggleLayer } from './airspace-layers.js';
import { getFirForPoint, getFirInfo } from './fir-data.js';
import { displayResult, clearHistory, initCopyButton, showToast } from './results-panel.js';
import { initSettings, getDefaultAerodrome } from './settings.js';
import { showWelcomeIfNeeded } from './welcome.js';
import { checkForUpdates } from './updater.js';

// App state
let baseAerodrome = null;
let map = null;

async function init() {
  // Show welcome screen on first run - waits for user to select base AD
  const selectedBase = await showWelcomeIfNeeded();

  // Initialize map
  map = initMap('map', onMapClick);

  // Initialize airspace layers
  initAirspaceLayers(map);

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

  // Layer toggle buttons
  setupLayerToggle('btn-toggle-fir', 'fir', 'FIR');
  setupLayerToggle('btn-toggle-tma', 'tma', 'TMA');
  setupLayerToggle('btn-toggle-ctr', 'ctr', 'CTR');

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

  // Check for updates (non-blocking)
  checkForUpdates();
}

async function loadBaseAerodrome() {
  try {
    const defaultIcao = await getDefaultAerodrome();
    const info = await getAerodromeInfo(defaultIcao);
    setBaseAerodrome(info);
  } catch (err) {
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

  // Determine FIR
  const baseFir = getFirForPoint(info.arp_lat, info.arp_lon);
  const firInfo = getFirInfo(baseFir);

  // Update header
  document.getElementById('header-base-icao').textContent = info.icao_code;

  // Update base info card
  document.getElementById('base-name').textContent = info.name;
  document.getElementById('base-icao').textContent = info.icao_code;
  document.getElementById('base-city').textContent = `${info.city}/${info.state}`;
  document.getElementById('base-arp').textContent = `${info.arp_lat.toFixed(4)}, ${info.arp_lon.toFixed(4)}`;
  document.getElementById('base-elev').textContent = `${info.elevation_ft} ft`;
  document.getElementById('base-fir').textContent = `${baseFir} (${firInfo.label})`;
  document.getElementById('base-fir').style.color = firInfo.color;

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

  updateStatus(`Base: ${info.icao_code} | ${baseFir}`);
}

async function onCalculateClick() {
  if (!baseAerodrome) {
    showToast('Aeródromo base não carregado', 'error');
    return;
  }

  const targetIcao = document.getElementById('target-input').value.trim().toUpperCase();
  if (!targetIcao || targetIcao.length < 2) {
    showToast('Digite o indicativo (AD, fixo ou waypoint)', 'warning');
    document.getElementById('target-input').focus();
    return;
  }

  const btn = document.getElementById('btn-calculate');
  const originalText = btn.textContent;
  btn.textContent = 'Buscando...';
  btn.disabled = true;

  try {
    const point = await lookupPoint(targetIcao);

    const result = await calculateRdl(
      baseAerodrome.icao_code,
      point.lat,
      point.lon
    );

    // Add target info
    result.target_name = point.name;
    result.target_icao = point.identifier;
    result.target_type = point.point_type;
    result.target_info = point.info;

    // Determine FIR of target
    const targetFir = getFirForPoint(point.lat, point.lon);
    const firInfo = getFirInfo(targetFir);
    result.target_fir = targetFir;
    result.target_fir_label = firInfo.label;

    // Display result
    displayResult(result);
    showRdlOnMap(result);

    // Update target name with FIR
    const typeLabel = point.point_type === 'AD' ? '' : `[${point.point_type}] `;
    document.getElementById('rdl-target-name').textContent =
      `${typeLabel}${point.identifier} - ${point.name} ${point.info ? '(' + point.info + ')' : ''}`;

    // Show FIR in result
    const firEl = document.getElementById('rdl-fir');
    if (firEl) {
      firEl.textContent = `${targetFir} (${firInfo.label})`;
      firEl.style.color = firInfo.color;
    }

    showToast(`${targetIcao}: RDL ${result.formatted} | FIR ${targetFir}`, 'success');
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

    const targetFir = getFirForPoint(lat, lon);
    const firInfo = getFirInfo(targetFir);
    result.target_fir = targetFir;

    displayResult(result);
    showRdlOnMap(result);

    document.getElementById('rdl-target-name').textContent =
      `Ponto: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    const firEl = document.getElementById('rdl-fir');
    if (firEl) {
      firEl.textContent = `${targetFir} (${firInfo.label})`;
      firEl.style.color = firInfo.color;
    }
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

function setupLayerToggle(btnId, layerType, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const visible = toggleLayer(layerType);
    btn.textContent = visible ? `${label}` : `${label}`;
    btn.classList.toggle('active', visible);
  });
}

function updateStatus(text) {
  const el = document.getElementById('connection-status');
  el.textContent = text;
  el.classList.add('connected');
}

// Start app
document.addEventListener('DOMContentLoaded', init);
