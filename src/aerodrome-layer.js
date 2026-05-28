import L from 'leaflet';
import { listAerodromes } from './lib/data-loader.js';

// Camada de aeródromos renderizada em canvas (leve mesmo com milhares de
// pontos — não usa marcadores DOM). Criada sob demanda na 1ª ativação.

let mapRef = null;
let layer = null;
let visible = false;

export function initAerodromeLayer(map) {
  mapRef = map;
}

export function aerodromeCount() {
  return listAerodromes().length;
}

export function toggleAerodromeLayer() {
  if (!mapRef) return false;
  if (visible) {
    if (layer) mapRef.removeLayer(layer);
    visible = false;
  } else {
    if (!layer) layer = buildLayer();
    layer.addTo(mapRef);
    visible = true;
  }
  return visible;
}

const AD_STYLE = {
  radius: 3.4,
  color: '#0369a1',
  weight: 1,
  fillColor: '#38bdf8',
  fillOpacity: 0.82,
};

const HP_STYLE = {
  radius: 4.3,
  color: '#b45309',
  weight: 1.5,
  fillColor: '#f59e0b',
  fillOpacity: 0.92,
};

function buildLayer() {
  const renderer = L.canvas({ padding: 0.5 });
  const group = L.layerGroup();
  for (const a of listAerodromes()) {
    if (a.arp_lat == null || a.arp_lon == null) continue;
    const isHelipoint = a.type === 'HP';
    const label = isHelipoint ? 'HP' : 'AD';
    L.circleMarker([a.arp_lat, a.arp_lon], {
      renderer,
      ...(isHelipoint ? HP_STYLE : AD_STYLE),
    })
      .bindTooltip(`[${label}] ${a.icao_code} — ${a.name}`, { direction: 'top', className: 'ad-tooltip' })
      .addTo(group);
  }
  return group;
}
