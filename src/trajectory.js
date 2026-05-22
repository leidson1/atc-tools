import { distanceNm } from './lib/haversine.js';
import { trueBearing } from './lib/bearing.js';
import { greatCirclePoints, tmaEntriesAlong } from './lib/geo-trajectory.js';
import { firSequenceAlong, getFirInfo } from './fir-data.js';
import { showTrajectory } from './map.js';
import tmaGeoJSON from './tma-boundaries.json';
import {
  PROFILES, headwindComponent, timeToDistanceMin, parseHHMM, formatHHMM, parseWind,
} from './lib/flight-time.js';

const ORIGIN_NM = 3; // eventos a menos disso = origem (contexto), não ingresso

let lastEvents = [];
let lastOrigin = null;
let lastDest = null;
let lastTrack = 0;

// Wira os parâmetros de voo (recalculam a linha do tempo ao vivo) e o
// botão de opções avançadas (recolhível).
export function initFlightParams() {
  const profileSel = document.getElementById('fp-profile');
  profileSel?.addEventListener('change', () => {
    const p = PROFILES[profileSel.value];
    if (p) document.getElementById('fp-tas').value = p.cruiseTAS;
    renderTimeline();
  });
  for (const id of ['fp-tas', 'fp-fl', 'fp-dep', 'fp-wind']) {
    const el = document.getElementById(id);
    el?.addEventListener('input', renderTimeline);
    el?.addEventListener('change', renderTimeline);
  }

  const optsBtn = document.getElementById('btn-opts');
  optsBtn?.addEventListener('click', () => {
    const panel = document.getElementById('opts-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    const isOpen = !panel.classList.contains('hidden');
    optsBtn.classList.toggle('open', isOpen);
    optsBtn.setAttribute('aria-expanded', String(isOpen));
  });
}

// Calcula FIR/TMA ao longo da rota origem->destino, desenha no mapa e
// renderiza a linha do tempo. Os parâmetros de voo só afetam o tempo
// (recalculado por renderTimeline, sem refazer a geometria).
export function computeRoute(origin, dest) {
  const traj = greatCirclePoints(origin.lat, origin.lon, dest.lat, dest.lon, 160);
  lastTrack = trueBearing(origin.lat, origin.lon, dest.lat, dest.lon);
  const dist = distanceNm(origin.lat, origin.lon, dest.lat, dest.lon);

  const firsRaw = firSequenceAlong(traj);
  const tmasRaw = tmaEntriesAlong(traj, tmaGeoJSON);
  const firEvents = firsRaw
    .filter((f) => f.distNm >= ORIGIN_NM)
    .map((f) => ({ kind: 'FIR', id: f.id, name: getFirInfo(f.id).label, distNm: f.distNm }));
  const tmaEvents = tmasRaw
    .filter((t) => t.distNm >= ORIGIN_NM)
    .map((t) => ({ kind: 'TMA', id: t.id, name: t.name, distNm: t.distNm, feature: t.feature }));

  lastEvents = [...firEvents, ...tmaEvents].sort((x, y) => x.distNm - y.distNm);
  lastOrigin = firsRaw.length ? { id: firsRaw[0].id, name: getFirInfo(firsRaw[0].id).label } : null;
  lastDest = { distNm: dist, id: dest.identifier, name: dest.name, type: dest.point_type };

  showTrajectory(origin, dest, traj, tmasRaw);
  renderTimeline();
}

function altToFt(s) {
  if (!s) return null;
  s = String(s).trim().toUpperCase();
  if (s === 'SFC' || s === 'GND') return 0;
  let m = s.match(/^FL\s*(\d+)/);
  if (m) return parseInt(m[1], 10) * 100;
  m = s.match(/(\d+)\s*FT/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/(\d+)\s*M\b/);
  if (m) return Math.round(parseInt(m[1], 10) * 3.281);
  m = s.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function fmtDur(min) {
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`;
}

function timeCell(distNm, opts, dep) {
  const t = timeToDistanceMin(distNm, opts);
  const eta = dep != null ? `${formatHHMM(dep + t)}Z` : '';
  return `<div class="tl-eta">${eta || '+' + fmtDur(t)}</div>${eta ? `<div class="tl-dur">+${fmtDur(t)}</div>` : ''}`;
}

function renderTimeline() {
  const el = document.getElementById('traj-result');
  if (!el) return;
  if (!lastDest) { el.classList.add('hidden'); return; }

  const profile = PROFILES[document.getElementById('fp-profile')?.value] || PROFILES.jato;
  const tas = parseInt(document.getElementById('fp-tas')?.value, 10) || profile.cruiseTAS;
  const fl = parseInt(document.getElementById('fp-fl')?.value, 10) || 350;
  const dep = parseHHMM(document.getElementById('fp-dep')?.value);
  const wind = parseWind(document.getElementById('fp-wind')?.value);
  const headwind = wind ? headwindComponent(wind.from, wind.kt, lastTrack) : 0;
  const acFt = fl * 100;

  const opts = {
    fl, tas, climbRate: profile.climbRate, climbGS: profile.climbGS,
    descentRate: profile.descentRate, descentGS: profile.descentGS,
    headwind, totalDist: lastDest.distNm,
  };

  const rows = [];

  if (lastOrigin) {
    rows.push(`<div class="tl-item tl-origin">
      <span class="tl-dot" style="background:#0891b2"></span>
      <div class="tl-main"><div class="tl-name">${lastOrigin.id} · ${lastOrigin.name} <span class="tl-kind">FIR</span></div>
      <div class="tl-sub">origem</div></div>
      <div class="tl-time"><div class="tl-eta" style="color:var(--text-muted)">saída</div></div>
    </div>`);
  }

  for (const ev of lastEvents) {
    const isFir = ev.kind === 'FIR';
    const color = isFir ? '#0891b2' : '#9b5de5';
    let sub = `@ ${ev.distNm.toFixed(0)} NM`;
    let badge = '';
    if (!isFir) {
      const lo = altToFt(ev.feature?.properties?.lower);
      const hi = altToFt(ev.feature?.properties?.upper);
      const lower = ev.feature?.properties?.lower || '';
      const upper = ev.feature?.properties?.upper || '';
      if (lower || upper) sub += ` · ${lower || '?'}–${upper || '?'}`;
      if (lo != null && hi != null) {
        const inside = acFt >= lo && acFt <= hi;
        badge = `<span class="tl-badge ${inside ? 'in' : 'out'}">${inside ? 'DENTRO' : 'fora'}</span>`;
      }
    }
    rows.push(`<div class="tl-item">
      <span class="tl-dot" style="background:${color}"></span>
      <div class="tl-main">
        <div class="tl-name">${ev.id || ev.name} ${isFir ? `· ${ev.name}` : ''} <span class="tl-kind">${ev.kind}</span> ${badge}</div>
        <div class="tl-sub">${sub}</div>
      </div>
      <div class="tl-time">${timeCell(ev.distNm, opts, dep)}</div>
    </div>`);
  }

  const destName = lastDest.name && lastDest.name !== lastDest.id ? ` · ${lastDest.name}` : '';
  rows.push(`<div class="tl-item tl-dest">
    <span class="tl-dot" style="background:#16a34a"></span>
    <div class="tl-main"><div class="tl-name">${lastDest.id}${destName} <span class="tl-kind">DESTINO</span></div>
    <div class="tl-sub">@ ${lastDest.distNm.toFixed(0)} NM</div></div>
    <div class="tl-time">${timeCell(lastDest.distNm, opts, dep)}</div>
  </div>`);

  const hint = dep == null
    ? 'Informe a decolagem (HH:MM Z) nas opções para ver os horários.'
    : `${profile.label} · TAS ${tas}kt · FL${fl}${wind ? ` · vento ${wind.from}/${wind.kt}` : ''} · rota direta (estimativa).`;

  el.innerHTML = `<div class="result-card">
    <div class="tl-head">Linha do tempo</div>
    ${rows.join('')}
    <div class="level-hint">${hint}</div>
  </div>`;
  el.classList.remove('hidden');
}
