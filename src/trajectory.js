import { lookupPoint } from './api.js';
import { distanceNm } from './lib/haversine.js';
import { trueBearing, normalizeBearing } from './lib/bearing.js';
import { magneticDeclination } from './lib/magnetic.js';
import { greatCirclePoints, tmasCrossed } from './lib/geo-trajectory.js';
import { showTrajectory, clearTrajectory } from './map.js';
import { showToast } from './results-panel.js';
import { closeDrawerIfMobile } from './drawer.js';
import tmaGeoJSON from './tma-boundaries.json';

export function initTrajectory() {
  document.getElementById('btn-trajectory')?.addEventListener('click', onTrace);
  document.getElementById('btn-trajectory-clear')?.addEventListener('click', () => {
    clearTrajectory();
    document.getElementById('traj-result')?.classList.add('hidden');
  });

  for (const id of ['traj-from', 'traj-to']) {
    const el = document.getElementById(id);
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onTrace();
      }
    });
    el?.addEventListener('input', () => {
      el.value = el.value.toUpperCase();
    });
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
    const decl = magneticDeclination(a.lat, a.lon);
    const mb = normalizeBearing(tb - decl);
    const crossed = tmasCrossed(traj, tmaGeoJSON);

    showTrajectory(a, b, traj, crossed);
    renderResult(a, b, dist, mb, tb, crossed);
    showToast(
      crossed.length
        ? `Trajetória cruza ${groupByTma(crossed).length} TMA(s)`
        : 'Trajetória não cruza nenhuma TMA',
      crossed.length ? 'warning' : 'success'
    );
    closeDrawerIfMobile();
  } catch (err) {
    showToast(`Erro: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function groupByTma(crossed) {
  const groups = new Map();
  for (const c of crossed) {
    const m = c.name.split(/\s+SECT\s+/i);
    const base = (m[0] || c.id).trim();
    const sector = m[1] ? m[1].trim() : '';
    if (!groups.has(base)) groups.set(base, []);
    if (sector) groups.get(base).push(sector);
  }
  return Array.from(groups, ([name, sectors]) => ({ name, sectors }));
}

function ptLabel(p) {
  const type = p.point_type === 'COORD' ? 'Coord' : p.point_type;
  const name = p.name && p.name !== p.identifier ? ' · ' + p.name : '';
  return `${p.identifier}${name} [${type}]`;
}

function renderResult(a, b, dist, mb, tb, crossed) {
  const el = document.getElementById('traj-result');
  const groups = groupByTma(crossed);

  const tmaHtml = groups.length
    ? `<div class="traj-tma-list">${groups
        .map(
          (g) =>
            `<div class="traj-tma-item">
              <span class="traj-tma-name">${g.name}</span>
              ${g.sectors.length ? `<span class="traj-tma-sectors">SECT ${g.sectors.join(', ')}</span>` : ''}
            </div>`
        )
        .join('')}</div>`
    : `<div class="traj-tma-none">Não cruza nenhuma TMA</div>`;

  el.innerHTML = `
    <div class="traj-route">
      <span class="traj-from">${ptLabel(a)}</span>
      <span class="traj-arrow">→</span>
      <span class="traj-to">${ptLabel(b)}</span>
    </div>
    <div class="traj-stats">
      <div class="traj-stat"><span>Distância</span><span>${dist.toFixed(1)} NM</span></div>
      <div class="traj-stat"><span>Rumo Mag</span><span>${String(Math.round(mb)).padStart(3, '0')}°</span></div>
      <div class="traj-stat"><span>Rumo True</span><span>${String(Math.round(tb)).padStart(3, '0')}°</span></div>
    </div>
    <div class="traj-tma-header">${groups.length ? `TMA cruzadas (${groups.length})` : 'TMA'}</div>
    ${tmaHtml}
  `;
  el.classList.remove('hidden');
}
