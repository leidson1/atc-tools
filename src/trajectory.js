import { lookupPoint } from './api.js';
import { distanceNm } from './lib/haversine.js';
import { trueBearing, normalizeBearing } from './lib/bearing.js';
import { magneticDeclination } from './lib/magnetic.js';
import { greatCirclePoints, tmasCrossed } from './lib/geo-trajectory.js';
import { showTrajectory, clearTrajectory } from './map.js';
import { showToast } from './results-panel.js';
import tmaGeoJSON from './tma-boundaries.json';

let lastCrossed = [];

export function initTrajectory() {
  document.getElementById('btn-trajectory')?.addEventListener('click', onTrace);
  document.getElementById('btn-trajectory-clear')?.addEventListener('click', () => {
    clearTrajectory();
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

    const traj = greatCirclePoints(a.lat, a.lon, b.lat, b.lon, 128);
    const dist = distanceNm(a.lat, a.lon, b.lat, b.lon);
    const tb = trueBearing(a.lat, a.lon, b.lat, b.lon);
    const mb = normalizeBearing(tb - magneticDeclination(a.lat, a.lon));
    lastCrossed = tmasCrossed(traj, tmaGeoJSON);

    showTrajectory(a, b, traj, lastCrossed);
    renderResult(a, b, dist, mb, tb);
    showToast(
      lastCrossed.length ? `Trajetória cruza ${lastCrossed.length} TMA(s)` : 'Trajetória não cruza nenhuma TMA',
      lastCrossed.length ? 'warning' : 'success'
    );
  } catch (err) {
    showToast(`Erro: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// "FL145" | "3500 ft" | "SFC" | "1500 m" -> feet
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

function ptLabel(p) {
  const type = p.point_type === 'COORD' ? 'Coord' : p.point_type;
  const name = p.name && p.name !== p.identifier ? ' · ' + p.name : '';
  return `${p.identifier}${name} <span style="color:var(--text-muted)">[${type}]</span>`;
}

function renderTmaList() {
  const list = document.getElementById('traj-tma-list');
  if (!list) return;
  const flEl = document.getElementById('traj-level');
  const fl = flEl && flEl.value !== '' ? parseInt(flEl.value, 10) : null;
  const acFt = Number.isFinite(fl) ? fl * 100 : null;
  let inside = 0;

  list.innerHTML = lastCrossed
    .map((c) => {
      const lower = c.feature?.properties?.lower || '';
      const upper = c.feature?.properties?.upper || '';
      const lo = altToFt(lower);
      const hi = altToFt(upper);
      const known = acFt != null && lo != null && hi != null;
      const isIn = known ? acFt >= lo && acFt <= hi : true;
      if (known && isIn) inside++;
      const altTxt = lower || upper ? `${lower || '?'} – ${upper || '?'}` : 'faixa n/d';
      return `<div class="tma-item ${known && !isIn ? 'out' : ''}">
        <div><div class="nm">${c.name}</div><div class="alt">${altTxt}</div></div>
        ${known ? `<span class="st ${isIn ? 'in' : 'out'}">${isIn ? 'DENTRO' : 'fora'}</span>` : ''}
      </div>`;
    })
    .join('');

  const hint = document.getElementById('traj-level-hint');
  if (hint) {
    if (acFt == null) hint.textContent = 'Informe o nível (FL) para checar contra o teto/piso de cada TMA.';
    else hint.textContent = inside
      ? `No FL${fl}, a aeronave está DENTRO de ${inside} TMA(s).`
      : `No FL${fl}, a aeronave passa fora do teto/piso de todas.`;
  }
}

function renderResult(a, b, dist, mb, tb) {
  const el = document.getElementById('traj-result');
  const n = lastCrossed.length;

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
      <div class="tma-block">
        <div class="tma-head">
          <span>⚠ TMA na rota (${n})</span>
          ${n ? `<div class="level-field"><span>Nível FL</span><input id="traj-level" inputmode="numeric" placeholder="--" /></div>` : ''}
        </div>
        ${n
          ? `<div id="traj-tma-list"></div><div class="level-hint" id="traj-level-hint"></div>`
          : `<div class="tma-none">Não cruza nenhuma TMA</div>`}
      </div>
    </div>`;

  el.classList.remove('hidden');

  if (n) {
    renderTmaList();
    document.getElementById('traj-level')?.addEventListener('input', renderTmaList);
  }
}
