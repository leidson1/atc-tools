import './styles/main.css';
import './styles/panel.css';
import './styles/map.css';
import './styles/components.css';

import { calculateRdlFromPoint, getAerodromeInfo, lookupPoint } from './api.js';
import { initMap, setAerodrome, showRdlOnMap } from './map.js';
import { drawCompassRose } from './compass-rose.js';
import { initAirspaceLayers, toggleLayer } from './airspace-layers.js';
import { getFirForPoint, getFirInfo } from './fir-data.js';
import { displayResult, clearHistory, initCopyButton, showToast } from './results-panel.js';
import { initSettings, getDefaultAerodrome } from './settings.js';
import { showWelcomeIfNeeded } from './welcome.js';
import { initDrawer } from './drawer.js';
import { initVersionIndicator } from './version-indicator.js';
import { initFlightParams, computeRoute } from './trajectory.js';
import { initAerodromeLayer, toggleAerodromeLayer } from './aerodrome-layer.js';

let baseAerodrome = null;
let map = null;

async function init() {
  await showWelcomeIfNeeded();

  map = initMap('map', onMapClick);
  initAirspaceLayers(map);
  initAerodromeLayer(map);
  initSettings(onSettingsSave);
  initCopyButton();
  initDrawer();
  initVersionIndicator();
  initFlightParams();
  initTabs();
  initTheme();

  const targetInput = document.getElementById('target-input');
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onCalculate(); }
  });
  targetInput.addEventListener('input', () => { targetInput.value = targetInput.value.toUpperCase(); });

  const fromInput = document.getElementById('traj-from');
  fromInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onCalculate(); }
  });
  fromInput.addEventListener('input', () => { fromInput.value = fromInput.value.toUpperCase(); });

  document.getElementById('btn-calculate').addEventListener('click', onCalculate);

  // Swap origin <-> destination
  document.getElementById('btn-traj-swap')?.addEventListener('click', () => {
    const from = document.getElementById('traj-from');
    const to = document.getElementById('target-input');
    [from.value, to.value] = [to.value, from.value];
    if (to.value.trim()) onCalculate();
  });

  document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

  // Airspace layer toggles (header)
  setupLayerToggle('btn-toggle-fir', 'fir');
  setupLayerToggle('btn-toggle-tma', 'tma');
  setupLayerToggle('btn-toggle-ctr', 'ctr');
  const adBtn = document.getElementById('btn-toggle-ad');
  adBtn?.addEventListener('click', () => {
    adBtn.classList.toggle('active', toggleAerodromeLayer());
  });

  window.__onHistoryClick = (result) => {
    activateTab('consulta');
    displayResult(result);
    showRdlOnMap(result);
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') onCalculate();
  });

  await loadBaseAerodrome();
  targetInput.focus();
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

  const baseFir = getFirForPoint(info.arp_lat, info.arp_lon);
  const firInfo = getFirInfo(baseFir);

  document.getElementById('header-base-icao').textContent = info.icao_code;
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

  // Origem padrão = base
  const fromInput = document.getElementById('traj-from');
  if (fromInput) fromInput.value = info.icao_code;
  const rdlBaseLabel = document.getElementById('rdl-base-icao');
  if (rdlBaseLabel) rdlBaseLabel.textContent = info.icao_code;

  setAerodrome(info.arp_lat, info.arp_lon, info.name, info.icao_code);
  drawCompassRose(map, info.arp_lat, info.arp_lon, varMag || -21);
  updateStatus(`FIR ${baseFir}`);
}

// Fluxo unificado: origem (campo De, padrão base) -> destino (campo Para)
async function onCalculate() {
  const destInput = document.getElementById('target-input');
  const destRaw = destInput.value.trim();
  if (!destRaw || destRaw.length < 2) {
    showToast('Digite o destino (AD, fixo ou coordenada)', 'warning');
    destInput.focus();
    return;
  }
  const fromRaw = (document.getElementById('traj-from').value.trim() || baseAerodrome?.icao_code || '').trim();
  if (!fromRaw) {
    showToast('Defina a origem ou o aeródromo base', 'error');
    return;
  }

  const btn = document.getElementById('btn-calculate');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const origin = await lookupPoint(fromRaw);
    const dest = await lookupPoint(destRaw);

    const result = calculateRdlFromPoint(origin, dest.lat, dest.lon);
    result.target_name = dest.name;
    result.target_icao = dest.identifier;
    result.target_type = dest.point_type;

    const destFir = getFirForPoint(dest.lat, dest.lon);
    const firInfo = getFirInfo(destFir);
    result.target_fir = destFir;

    activateTab('consulta');
    displayResult(result);

    const typeLabel = dest.point_type === 'AD' ? '' : `[${dest.point_type}] `;
    document.getElementById('rdl-target-name').textContent =
      `${typeLabel}${dest.identifier}${dest.name && dest.name !== dest.identifier ? ' - ' + dest.name : ''}`;
    document.getElementById('rdl-base-icao').textContent = origin.identifier || fromRaw;
    const firEl = document.getElementById('rdl-fir');
    if (firEl) {
      firEl.textContent = `${destFir} (${firInfo.label})`;
      firEl.style.color = firInfo.color;
    }

    // Linha do tempo FIR/TMA + desenho da rota no mapa
    computeRoute(origin, dest);

    const note = dest.point_type === 'COORD' && dest.coord?.assumed ? ' — assumi S/W, confira!' : '';
    showToast(`${origin.identifier || fromRaw} → ${dest.identifier}: RDL ${result.formatted}${note}`, note ? 'warning' : 'success');
  } catch (err) {
    showToast(`Erro: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function onMapClick(lat, lon) {
  const destInput = document.getElementById('target-input');
  destInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  onCalculate();
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

function setupLayerToggle(rowId, layerType) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.addEventListener('click', () => {
    const visible = toggleLayer(layerType);
    row.classList.toggle('active', visible);
  });
}

const SVG_MOON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>';
const SVG_SUN = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = theme === 'dark' ? SVG_MOON : SVG_SUN;
}

function initTheme() {
  applyTheme(localStorage.getItem('atc-theme') || 'light');
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('atc-theme', next);
    applyTheme(next);
  });
}

export function activateTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.view));
  });
}

function updateStatus(text) {
  const el = document.getElementById('connection-status');
  if (!el) return;
  el.textContent = text;
  el.classList.add('connected');
}

document.addEventListener('DOMContentLoaded', init);
