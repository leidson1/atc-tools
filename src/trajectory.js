import { calculateRdl, lookupPoint } from './api.js';
import { distanceNm } from './lib/haversine.js';
import { trueBearing, normalizeBearing } from './lib/bearing.js';
import { magneticDeclination } from './lib/magnetic.js';
import { greatCirclePoints, tmaEntriesAlong } from './lib/geo-trajectory.js';
import { firSequenceAlong, getFirForPoint, getFirInfo } from './fir-data.js';
import { showRdlOnMap, clearRdlVisuals, showTrajectory, clearTrajectory } from './map.js';
import { displayResult, showToast } from './results-panel.js';
import { closeDrawerIfMobile } from './drawer.js';
import tmaGeoJSON from './tma-boundaries.json';
import {
  PROFILES, headwindComponent, timeToDistanceMin, parseHHMM, formatHHMM, parseWind,
} from './lib/flight-time.js';

const ORIGIN_NM = 3; // eventos a menos disso são "origem", não ingresso

let lastEvents = [];   // ingressos à frente: [{kind, id, name, distNm, feature?}]
let lastOrigin = null; // { id, name } da FIR de origem
let lastDest = null;   // { distNm, id, name, type }
let lastTrack = 0;
let operationBase = null;
let currentOperationMode = null;

export function setOperationBase(info) {
  const previousBase = operationBase?.icao_code;
  operationBase = info;

  const from = document.getElementById('traj-from');
  if (from) {
    const current = from.value.trim().toUpperCase();
    if (!current || current === previousBase) {
      from.value = info.icao_code;
    }
  }

  updateOperationMode();
}

export function initTrajectory() {
  document.getElementById('btn-trajectory')?.addEventListener('click', runOperation);
  document.getElementById('btn-trajectory-clear')?.addEventListener('click', () => {
    clearOperationResults();
  });
  document.getElementById('btn-origin-base')?.addEventListener('click', () => {
    setOperationToRadialMode();
    document.getElementById('traj-to')?.focus();
  });
  document.getElementById('btn-traj-swap')?.addEventListener('click', () => {
    const a = document.getElementById('traj-from');
    const b = document.getElementById('traj-to');
    [a.value, b.value] = [b.value, a.value];
    updateOperationMode();
  });

  for (const id of ['traj-from', 'traj-to']) {
    const el = document.getElementById(id);
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runOperation(); }
    });
    el?.addEventListener('input', () => {
      el.value = el.value.toUpperCase();
      updateOperationMode();
    });
  }

  // Parâmetros de voo: recalculam a linha do tempo ao vivo (sem re-traçar)
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
  updateOperationMode();
}

export function setOperationToRadialMode() {
  const from = document.getElementById('traj-from');
  if (from && operationBase) from.value = operationBase.icao_code;
  updateOperationMode();
}

export async function runOperation() {
  const fromEl = document.getElementById('traj-from');
  const toEl = document.getElementById('traj-to');
  const fromRaw = fromEl?.value.trim().toUpperCase() || '';
  const toRaw = toEl?.value.trim().toUpperCase() || '';

  if (!fromRaw || !toRaw) {
    showToast('Informe origem e destino', 'warning');
    (fromRaw ? toEl : fromEl)?.focus();
    return;
  }

  const btn = document.getElementById('btn-trajectory');
  const original = btn?.textContent || '';
  const radialMode = isBaseOrigin(fromRaw);
  if (btn) {
    btn.disabled = true;
    btn.textContent = radialMode ? 'Calculando...' : 'Traçando...';
  }

  try {
    if (radialMode) {
      await runRadial(toRaw);
    } else {
      await runRoute(fromRaw, toRaw);
    }
    closeDrawerIfMobile();
  } catch (err) {
    showToast(`Erro: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
    }
    updateOperationMode();
  }
}

async function runRoute(fromRaw, toRaw) {
  const a = await lookupPoint(fromRaw);
  const b = await lookupPoint(toRaw);

  const traj = greatCirclePoints(a.lat, a.lon, b.lat, b.lon, 160);
  const dist = distanceNm(a.lat, a.lon, b.lat, b.lon);
  const tb = trueBearing(a.lat, a.lon, b.lat, b.lon);
  const mb = normalizeBearing(tb - magneticDeclination(a.lat, a.lon));
  lastTrack = tb;

  const firsRaw = firSequenceAlong(traj);
  const tmasRaw = tmaEntriesAlong(traj, tmaGeoJSON);

  const firEvents = firsRaw
    .filter((f) => f.distNm >= ORIGIN_NM)
    .map((f) => ({ kind: 'FIR', id: f.id, name: getFirInfo(f.id).label, distNm: f.distNm }));
  const tmaEvents = tmasRaw
    .filter((t) => t.distNm >= ORIGIN_NM)
    .map((t) => ({ kind: 'TMA', id: t.id, name: t.name, distNm: t.distNm, feature: t.feature }));

  lastEvents = [...firEvents, ...tmaEvents].sort((x, y) => x.distNm - y.distNm);
  const originFir = firsRaw[0]?.id || getFirForPoint(a.lat, a.lon);
  lastOrigin = { id: originFir, name: getFirInfo(originFir).label };
  lastDest = { distNm: dist, id: b.identifier, name: b.name, type: b.point_type };

  clearRdlResult();
  clearRdlVisuals();
  showTrajectory(a, b, traj, tmasRaw, { magBearing: mb, trueBearing: tb, distanceNm: dist });
  renderResult(a, b, dist, mb, tb);
  renderTimeline();

  showToast(
    lastEvents.length ? `Cruza ${lastEvents.length} FIR/TMA até o destino` : 'Sem cruzamentos até o destino',
    'success'
  );
}

async function runRadial(toRaw) {
  if (!operationBase) {
    throw new Error('Aeródromo base não carregado');
  }

  const point = await lookupPoint(toRaw);
  const result = await calculateRdl(operationBase.icao_code, point.lat, point.lon);

  result.target_name = point.name;
  result.target_icao = point.identifier;
  result.target_type = point.point_type;
  result.target_info = point.info;

  const targetFir = getFirForPoint(point.lat, point.lon);
  const firInfo = getFirInfo(targetFir);
  result.target_fir = targetFir;
  result.target_fir_label = firInfo.label;

  clearTrajectoryState();
  displayResult(result);
  showRdlOnMap(result);
  updateRdlTarget(point, targetFir, firInfo);

  if (point.point_type === 'COORD') {
    const note = point.coord.assumed ? ' — assumi S/W, confira!' : '';
    showToast(
      `Coordenada ${point.name}${note} → RDL ${result.formatted} de ${operationBase.icao_code}`,
      point.coord.assumed ? 'warning' : 'success'
    );
  } else {
    showToast(`${toRaw}: RDL ${result.formatted} | FIR ${targetFir}`, 'success');
  }
}

function isBaseOrigin(origin) {
  return !!operationBase && origin.trim().toUpperCase() === operationBase.icao_code;
}

function updateOperationMode() {
  const from = document.getElementById('traj-from')?.value.trim().toUpperCase() || '';
  const radialMode = isBaseOrigin(from);
  const nextMode = radialMode ? 'rdl' : 'route';
  const pill = document.getElementById('operation-mode-pill');
  const text = document.getElementById('operation-mode-text');
  const params = document.getElementById('flight-params-accordion');
  const btn = document.getElementById('btn-trajectory');

  if (currentOperationMode && currentOperationMode !== nextMode) {
    clearOperationResults();
  }
  currentOperationMode = nextMode;

  if (pill) {
    pill.textContent = radialMode ? 'RDL' : 'ROTA';
    pill.classList.toggle('route', !radialMode);
  }
  if (text) {
    text.textContent = radialMode
      ? 'Origem na base: cálculo radial'
      : 'Origem fora da base: rota e cruzamentos';
  }
  params?.classList.toggle('hidden', radialMode);
  if (btn && !btn.disabled) btn.textContent = radialMode ? 'CALCULAR RDL' : 'TRAÇAR ROTA';
}

function updateRdlTarget(point, targetFir, firInfo) {
  const typeLabel = point.point_type === 'AD' ? '' : `[${point.point_type}] `;
  const nameEl = document.getElementById('rdl-target-name');
  if (nameEl) {
    nameEl.textContent =
      `${typeLabel}${point.identifier} - ${point.name} ${point.info ? '(' + point.info + ')' : ''}`;
  }

  const firEl = document.getElementById('rdl-fir');
  if (firEl) {
    firEl.textContent = `${targetFir} (${firInfo.label})`;
    firEl.style.color = firInfo.color;
  }
}

function clearOperationResults() {
  clearTrajectoryState();
  clearRdlResult();
  clearRdlVisuals();
}

function clearTrajectoryState() {
  clearTrajectory();
  lastEvents = [];
  lastDest = null;
  lastOrigin = null;
  document.getElementById('traj-result')?.classList.add('hidden');
}

function clearRdlResult() {
  document.getElementById('rdl-result')?.classList.add('hidden');
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

const pad3 = (v) => String(Math.round(v)).padStart(3, '0');

function fmtDur(min) {
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`;
}

function ptLabel(p) {
  const type = p.point_type === 'COORD' ? 'Coord' : p.point_type;
  const name = p.name && p.name !== p.identifier ? ' · ' + p.name : '';
  return `${p.identifier}${name} <span style="color:var(--text-muted)">[${type}]</span>`;
}

function renderResult(a, b, dist, mb, tb) {
  const el = document.getElementById('traj-result');
  el.innerHTML = `
    <div class="result-card">
      <div class="traj-route-head">
        <div class="traj-route-title">
          <span class="traj-kicker">Destino</span>
          <span class="traj-dest">${ptLabel(b)}</span>
        </div>
        <span class="route-proa-pill">PROA ${pad3(mb)}°</span>
      </div>
      <div class="traj-route-line">
        <span>${a.identifier}</span>
        <i></i>
        <b>${b.identifier}</b>
      </div>
      <div class="instruments">
        <div class="inst"><div class="inst-lbl">Dist</div><div class="inst-val">${dist.toFixed(0)}<span style="font-size:11px"> NM</span></div></div>
        <div class="inst"><div class="inst-lbl">Mag</div><div class="inst-val">${pad3(mb)}°</div></div>
        <div class="inst"><div class="inst-lbl">True</div><div class="inst-val">${pad3(tb)}°</div></div>
      </div>
      <details class="panel-accordion timeline-accordion">
        <summary>
          <span>Linha do tempo</span>
          <small id="traj-timeline-summary">${timelineSummaryText()}</small>
        </summary>
        <div id="traj-timeline"></div>
        <div class="level-hint" id="traj-tl-hint"></div>
      </details>
    </div>`;
  el.classList.remove('hidden');
}

function timelineSummaryText() {
  if (!lastDest) return 'sem rota';
  const crossings = lastEvents.length
    ? `${lastEvents.length} cruzamento${lastEvents.length > 1 ? 's' : ''}`
    : 'sem cruzamentos';
  return `${crossings} · ${lastDest.distNm.toFixed(0)} NM`;
}

function timeCell(distNm, opts, dep) {
  const t = timeToDistanceMin(distNm, opts);
  const eta = dep != null ? `${formatHHMM(dep + t)}Z` : '';
  return `<div class="tl-eta">${eta || '+' + fmtDur(t)}</div>${eta ? `<div class="tl-dur">+${fmtDur(t)}</div>` : ''}`;
}

function renderTimeline() {
  const tl = document.getElementById('traj-timeline');
  if (!tl || !lastDest) return;

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

  // Origem (contexto, sem tempo)
  if (lastOrigin) {
    rows.push(`<div class="tl-item tl-origin">
      <span class="tl-dot" style="background:#0891b2"></span>
      <div class="tl-main"><div class="tl-name">${lastOrigin.id} · ${lastOrigin.name} <span class="tl-kind">FIR</span></div>
      <div class="tl-sub">origem</div></div>
      <div class="tl-time"><div class="tl-eta" style="color:var(--text-muted)">saída</div></div>
    </div>`);
  }

  // Ingressos à frente
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

  // Destino (chegada)
  const destName = lastDest.name && lastDest.name !== lastDest.id ? ` · ${lastDest.name}` : '';
  rows.push(`<div class="tl-item tl-dest">
    <span class="tl-dot" style="background:#16a34a"></span>
    <div class="tl-main"><div class="tl-name">${lastDest.id}${destName} <span class="tl-kind">DESTINO</span></div>
    <div class="tl-sub">@ ${lastDest.distNm.toFixed(0)} NM</div></div>
    <div class="tl-time">${timeCell(lastDest.distNm, opts, dep)}</div>
  </div>`);

  tl.innerHTML = rows.join('');

  const summary = document.getElementById('traj-timeline-summary');
  if (summary) summary.textContent = timelineSummaryText();

  const hint = document.getElementById('traj-tl-hint');
  if (hint) {
    hint.textContent = dep == null
      ? 'Informe a decolagem (HH:MM Z) para ver os horários. Trocar perfil/TAS/nível recalcula na hora.'
      : `${profile.label} · TAS ${tas}kt · FL${fl}${wind ? ` · vento ${wind.from}/${wind.kt}` : ''} · estimativa em rota direta.`;
  }
}
