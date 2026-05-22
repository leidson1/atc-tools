import { lookupPoint } from './api.js';
import { distanceNm } from './lib/haversine.js';
import { trueBearing, normalizeBearing } from './lib/bearing.js';
import { magneticDeclination } from './lib/magnetic.js';
import { greatCirclePoints, tmaEntriesAlong } from './lib/geo-trajectory.js';
import { firSequenceAlong, getFirInfo } from './fir-data.js';
import { showTrajectory, clearTrajectory } from './map.js';
import { showToast } from './results-panel.js';
import tmaGeoJSON from './tma-boundaries.json';
import {
  PROFILES, headwindComponent, timeToDistanceMin, parseHHMM, formatHHMM, parseWind,
} from './lib/flight-time.js';

let lastEvents = []; // [{kind:'FIR'|'TMA', id, name, distNm, feature?}]
let lastTrack = 0;

export function initTrajectory() {
  document.getElementById('btn-trajectory')?.addEventListener('click', onTrace);
  document.getElementById('btn-trajectory-clear')?.addEventListener('click', () => {
    clearTrajectory();
    lastEvents = [];
    document.getElementById('traj-result')?.classList.add('hidden');
  });
  document.getElementById('btn-traj-swap')?.addEventListener('click', () => {
    const a = document.getElementById('traj-from');
    const b = document.getElementById('traj-to');
    [a.value, b.value] = [b.value, a.value];
  });

  for (const id of ['traj-from', 'traj-to']) {
    const el = document.getElementById(id);
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onTrace(); }
    });
    el?.addEventListener('input', () => { el.value = el.value.toUpperCase(); });
  }

  // Flight parameter inputs -> recompute timeline live
  const profileSel = document.getElementById('fp-profile');
  profileSel?.addEventListener('change', () => {
    const p = PROFILES[profileSel.value];
    if (p) document.getElementById('fp-tas').value = p.cruiseTAS;
    renderTimeline();
  });
  for (const id of ['fp-tas', 'fp-fl', 'fp-dep', 'fp-wind']) {
    document.getElementById(id)?.addEventListener('input', renderTimeline);
  }
}

async function onTrace() {
  const fromRaw = document.getElementById('traj-from').value.trim();
  const toRaw = document.getElementById('traj-to').value.trim();
  if (!fromRaw || !toRaw) {
    showToast('Informe origem e destino', 'warning');
    return;
  }

  const btn = document.getElementById('btn-trajectory');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Traçando...';

  try {
    const a = await lookupPoint(fromRaw);
    const b = await lookupPoint(toRaw);

    const traj = greatCirclePoints(a.lat, a.lon, b.lat, b.lon, 160);
    const dist = distanceNm(a.lat, a.lon, b.lat, b.lon);
    const tb = trueBearing(a.lat, a.lon, b.lat, b.lon);
    const mb = normalizeBearing(tb - magneticDeclination(a.lat, a.lon));
    lastTrack = tb;

    const firs = firSequenceAlong(traj).map((f, i) => ({
      kind: 'FIR', id: f.id, name: getFirInfo(f.id).label, distNm: f.distNm, origin: i === 0,
    }));
    const tmas = tmaEntriesAlong(traj, tmaGeoJSON).map((t) => ({
      kind: 'TMA', id: t.id, name: t.name, distNm: t.distNm, feature: t.feature,
    }));
    lastEvents = [...firs, ...tmas].sort((x, y) => x.distNm - y.distNm);

    showTrajectory(a, b, traj, tmas);
    renderResult(a, b, dist, mb, tb);
    renderTimeline();

    const nFir = firs.length - 1; // excl. origem
    showToast(
      nFir > 0 ? `Cruza ${nFir} fronteira(s) de FIR + ${tmas.length} TMA(s)` : `${tmas.length} TMA(s) na rota`,
      'success'
    );
  } catch (err) {
    showToast(`Erro: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
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
      <div class="traj-route">
        <span class="traj-arrow">▸</span> ${ptLabel(a)}<br>
        <span class="traj-arrow">▸</span> ${ptLabel(b)}
      </div>
      <div class="instruments">
        <div class="inst"><div class="inst-lbl">Dist</div><div class="inst-val">${dist.toFixed(0)}<span style="font-size:11px"> NM</span></div></div>
        <div class="inst"><div class="inst-lbl">Mag</div><div class="inst-val">${pad3(mb)}°</div></div>
        <div class="inst"><div class="inst-lbl">True</div><div class="inst-val">${pad3(tb)}°</div></div>
      </div>
      <div class="tl-head">Ingresso em FIR / TMA</div>
      <div id="traj-timeline"></div>
      <div class="level-hint" id="traj-tl-hint"></div>
    </div>`;
  el.classList.remove('hidden');
}

function renderTimeline() {
  const tl = document.getElementById('traj-timeline');
  if (!tl || !lastEvents.length) return;

  const profile = PROFILES[document.getElementById('fp-profile')?.value] || PROFILES.jato;
  const tas = parseInt(document.getElementById('fp-tas')?.value, 10) || profile.cruiseTAS;
  const fl = parseInt(document.getElementById('fp-fl')?.value, 10) || 350;
  const dep = parseHHMM(document.getElementById('fp-dep')?.value);
  const wind = parseWind(document.getElementById('fp-wind')?.value);
  const headwind = wind ? headwindComponent(wind.from, wind.kt, lastTrack) : 0;
  const acFt = fl * 100;

  const opts = { fl, tas, climbRate: profile.climbRate, climbGS: profile.climbGS, headwind };

  tl.innerHTML = lastEvents.map((ev) => {
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
    let timeHtml;
    if (ev.origin) {
      timeHtml = `<div class="tl-eta">origem</div>`;
    } else {
      const t = timeToDistanceMin(ev.distNm, opts);
      const eta = dep != null ? `${formatHHMM(dep + t)}Z` : '';
      timeHtml = `<div class="tl-eta">${eta || '+' + fmtDur(t)}</div>${eta ? `<div class="tl-dur">+${fmtDur(t)}</div>` : ''}`;
    }
    return `<div class="tl-item">
      <span class="tl-dot" style="background:${color}"></span>
      <div class="tl-main">
        <div class="tl-name">${ev.id || ev.name} ${isFir ? `· ${ev.name}` : ''} <span class="tl-kind">${ev.kind}</span> ${badge}</div>
        <div class="tl-sub">${sub}</div>
      </div>
      <div class="tl-time">${timeHtml}</div>
    </div>`;
  }).join('');

  const hint = document.getElementById('traj-tl-hint');
  if (hint) {
    hint.textContent = dep == null
      ? 'Informe a decolagem (HH:MM Z) para ver os horários de ingresso.'
      : `Estimativa em rota direta, ${profile.label} TAS ${tas}kt no FL${fl}${wind ? `, vento ${wind.from}/${wind.kt}` : ''}.`;
  }
}
