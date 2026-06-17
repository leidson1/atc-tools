// Simulador APP — orquestração: radar (Leaflet), loop, strips, console.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { createAircraft, updateAircraft, applyActions } from './sim-engine.js';
import { parseCommand, buildReadback } from './sim-commands.js';
import { SCENARIOS } from './sim-scenarios.js';

const FS_ID = 'sim-fullscreen';

let map = null;
let aircraft = [];          // estado das aeronaves
let markers = new Map();    // callsign -> { icon: L.marker, trail: L.polyline, vector: L.polyline }
let loopTimer = null;
let lastTick = 0;
let simSpeed = 1;           // multiplicador de tempo (1x..8x)
let paused = false;
let log = [];               // [{ from:'ATC'|'PIL'|'SYS', text, t }]
let scenario = null;

export function initSim() {
  document.getElementById('btn-open-sim')?.addEventListener('click', openSim);
}

function openSim() {
  let el = document.getElementById(FS_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = FS_ID;
    el.className = 'sim-fullscreen';
    document.body.appendChild(el);
  }
  renderShell(el);
  loadScenario(SCENARIOS[0]);
  startLoop();
}

function closeSim() {
  stopLoop();
  if (map) { map.remove(); map = null; }
  markers.clear();
  aircraft = [];
  log = [];
  const el = document.getElementById(FS_ID);
  if (el) el.remove();
}

function renderShell(el) {
  el.innerHTML = `
    <header class="sim-header">
      <button class="sim-close" id="sim-close" title="Sair do simulador">✕ Sair</button>
      <div class="sim-title">
        <span class="sim-eyebrow">SIMULADOR APP · TREINO (não-operacional)</span>
        <h1 id="sim-scenario-name">—</h1>
      </div>
      <div class="sim-clock">
        <span id="sim-clock" class="sim-clock-time">00:00</span>
        <div class="sim-speed">
          <button data-spd="1" class="sim-spd-btn active">1×</button>
          <button data-spd="2" class="sim-spd-btn">2×</button>
          <button data-spd="4" class="sim-spd-btn">4×</button>
          <button data-spd="8" class="sim-spd-btn">8×</button>
          <button id="sim-pause" class="sim-spd-btn sim-pause">⏸</button>
        </div>
      </div>
    </header>
    <div class="sim-body">
      <div id="sim-map" class="sim-map"></div>
      <div class="sim-strips" id="sim-strips"></div>
      <div class="sim-console">
        <div class="sim-log" id="sim-log"></div>
        <form class="sim-cmd" id="sim-cmd-form">
          <input type="text" id="sim-cmd-input" placeholder="Instrução ATC (ex.: AZU4090 curva direita proa 270, desça nível 040)" autocomplete="off" />
          <button type="submit" class="sim-cmd-send">Transmitir</button>
        </form>
        <div class="sim-hint">Ex.: <b>proa 270</b> · <b>curva esquerda</b> · <b>desça nível 040</b> · <b>suba FL120</b> · <b>reduza 220</b></div>
      </div>
    </div>`;

  // Mapa estilo radar (tiles escuros)
  map = L.map('sim-map', { zoomControl: false, attributionControl: false, center: [-10.29, -48.36], zoom: 9 });
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);

  el.querySelector('#sim-close').addEventListener('click', closeSim);
  el.querySelector('#sim-cmd-form').addEventListener('submit', onCommand);
  el.querySelector('#sim-pause').addEventListener('click', togglePause);
  el.querySelectorAll('.sim-spd-btn[data-spd]').forEach((b) => {
    b.addEventListener('click', () => setSpeed(parseInt(b.dataset.spd, 10), b));
  });
  setTimeout(() => el.querySelector('#sim-cmd-input')?.focus(), 80);
}

function loadScenario(sc) {
  scenario = sc;
  aircraft = sc.aircraft.map(createAircraft);
  document.getElementById('sim-scenario-name').textContent = sc.name;
  // Aeródromo base no radar
  if (sc.base) {
    L.circleMarker([sc.base.lat, sc.base.lon], {
      radius: 5, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 1, weight: 1,
    }).addTo(map).bindTooltip(sc.base.icao, { permanent: true, direction: 'right', className: 'sim-base-label' });
    // Anéis de distância (10/20/30 NM)
    for (const nm of [10, 20, 30]) {
      L.circle([sc.base.lat, sc.base.lon], {
        radius: nm * 1852, color: 'rgba(34,211,238,0.18)', weight: 1, fill: false, dashArray: '3 6',
      }).addTo(map);
    }
    map.setView([sc.base.lat, sc.base.lon], 9);
  }
  sysLog(`Cenário "${sc.name}" carregado. ${aircraft.length} aeronave(s). Transmita uma instrução.`);
  renderAll();
}

// ============ Loop ============
function startLoop() {
  stopLoop();
  lastTick = performance.now();
  loopTimer = setInterval(tick, 100); // 10 Hz
}
function stopLoop() { if (loopTimer) { clearInterval(loopTimer); loopTimer = null; } }

function tick() {
  const now = performance.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (paused) return;
  dt *= simSpeed;
  for (const ac of aircraft) updateAircraft(ac, dt);
  renderAll();
  updateClock(dt);
}

let elapsed = 0;
function updateClock(dt) {
  elapsed += dt;
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  const el = document.getElementById('sim-clock');
  if (el) el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setSpeed(spd, btn) {
  simSpeed = spd;
  document.querySelectorAll('.sim-spd-btn[data-spd]').forEach((b) => b.classList.toggle('active', b === btn));
}
function togglePause() {
  paused = !paused;
  const b = document.getElementById('sim-pause');
  if (b) { b.textContent = paused ? '▶' : '⏸'; b.classList.toggle('active', paused); }
}

// ============ Render ============
function renderAll() {
  for (const ac of aircraft) renderAircraft(ac);
  renderStrips();
}

function renderAircraft(ac) {
  let m = markers.get(ac.callsign);
  const pos = [ac.lat, ac.lon];
  if (!m) {
    const icon = L.marker(pos, { icon: buildBlip(ac), interactive: false });
    const trail = L.polyline([], { color: '#16a34a', weight: 1, opacity: 0.5 });
    const vector = L.polyline([], { color: '#22c55e', weight: 1.5, opacity: 0.9 });
    icon.addTo(map); trail.addTo(map); vector.addTo(map);
    m = { icon, trail, vector };
    markers.set(ac.callsign, m);
  }
  m.icon.setLatLng(pos);
  m.icon.setIcon(buildBlip(ac));
  // Trilha
  m.trail.setLatLngs(ac.trail);
  // Vetor de velocidade: projeção de 1 minuto à frente
  const distNm = ac.speed / 60;
  const hdgRad = (ac.heading * Math.PI) / 180;
  const dLat = (distNm * Math.cos(hdgRad)) / 60;
  const dLon = (distNm * Math.sin(hdgRad)) / (60 * Math.cos((ac.lat * Math.PI) / 180));
  m.vector.setLatLngs([pos, [ac.lat + dLat, ac.lon + dLon]]);
}

function buildBlip(ac) {
  const fl = String(Math.round(ac.altitude / 100)).padStart(3, '0');
  const gs = Math.round(ac.speed);
  return L.divIcon({
    className: 'sim-blip',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<div class="sim-blip-dot"></div>
      <div class="sim-datablock">
        <div class="sim-db-cs">${ac.callsign}</div>
        <div class="sim-db-line">${fl} &nbsp; ${gs}</div>
      </div>`,
  });
}

function renderStrips() {
  const box = document.getElementById('sim-strips');
  if (!box) return;
  box.innerHTML = aircraft.map((ac) => {
    const fl = String(Math.round(ac.altitude / 100)).padStart(3, '0');
    const tgtFl = String(Math.round(ac.targetAltitude / 100)).padStart(3, '0');
    const climbing = Math.abs(ac.altitude - ac.targetAltitude) > 5;
    const turning = Math.abs(((ac.targetHeading - ac.heading + 540) % 360) - 180) > 1;
    const arrow = ac.targetAltitude > ac.altitude ? '↑' : ac.targetAltitude < ac.altitude ? '↓' : '';
    return `<div class="sim-strip">
      <div class="sim-strip-cs">${ac.callsign}<span class="sim-strip-type">${ac.type}</span></div>
      <div class="sim-strip-grid">
        <span><i>PROA</i><b>${pad3(ac.heading)}${turning ? ' → ' + pad3(ac.targetHeading) : ''}</b></span>
        <span><i>NÍVEL</i><b>${fl}${climbing ? ' ' + arrow + ' ' + tgtFl : ''}</b></span>
        <span><i>GS</i><b>${Math.round(ac.speed)} kt</b></span>
      </div>
    </div>`;
  }).join('');
}

// ============ Comando ============
function onCommand(e) {
  e.preventDefault();
  const input = document.getElementById('sim-cmd-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  atcLog(text);

  const sole = aircraft.length === 1 ? aircraft[0].callsign : null;
  const { callsign, actions, unmatched } = parseCommand(text, sole);

  if (!callsign) { pilotLog('Indicativo não reconhecido — repita a chamada.', '—'); return; }
  const ac = aircraft.find((a) => a.callsign === callsign);
  if (!ac) { pilotLog(`${callsign} não está nesta frequência.`, callsign); return; }
  if (unmatched) { pilotLog('Não entendi a instrução, confirme.', callsign); return; }

  applyActions(ac, actions);
  const readback = buildReadback(callsign, actions, ac);
  pilotLog(readback, callsign);
  renderStrips();
}

// ============ Log ============
function atcLog(text) { pushLog('ATC', text); }
function pilotLog(text, cs) { pushLog('PIL', text, cs); }
function sysLog(text) { pushLog('SYS', text); }
function pushLog(from, text, cs) {
  log.push({ from, text, cs });
  const box = document.getElementById('sim-log');
  if (!box) return;
  box.innerHTML = log.slice(-40).map((l) => {
    const cls = l.from === 'ATC' ? 'atc' : l.from === 'PIL' ? 'pil' : 'sys';
    const tag = l.from === 'ATC' ? '▸ ATC' : l.from === 'PIL' ? '◂ ' + (l.cs || 'PIL') : '·';
    return `<div class="sim-log-line ${cls}"><span class="sim-log-tag">${tag}</span> ${escapeHTML(l.text)}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function pad3(n) { return String(Math.round(n)).padStart(3, '0'); }
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
