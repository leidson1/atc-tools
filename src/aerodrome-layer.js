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

function buildLayer() {
  const renderer = L.canvas({ padding: 0.5 });
  const group = L.layerGroup();
  for (const a of listAerodromes()) {
    if (a.arp_lat == null || a.arp_lon == null) continue;
    L.circleMarker([a.arp_lat, a.arp_lon], {
      renderer,
      radius: 3.5,
      color: '#15803d',
      weight: 1,
      fillColor: '#22c55e',
      fillOpacity: 0.85,
    })
      .bindTooltip(`${a.icao_code} — ${a.name}`, { direction: 'top', className: 'ad-tooltip' })
      .addTo(group);
  }
  return group;
}
