import L from 'leaflet';
import firGeoJSON from './fir-boundaries.json';
import tmaGeoJSON from './tma-boundaries.json';
import ctrGeoJSON from './ctr-boundaries.json';

/**
 * Airspace layer manager.
 * Handles FIR, TMA, and CTR boundaries on the map.
 * Each layer can be toggled independently.
 */

const layers = {
  fir: { data: firGeoJSON, layer: null, labels: [], visible: false },
  tma: { data: tmaGeoJSON, layer: null, labels: [], visible: false },
  ctr: { data: ctrGeoJSON, layer: null, labels: [], visible: false },
};

const STYLES = {
  fir: {
    color: '#0077b6',
    weight: 2.5,
    opacity: 0.7,
    dashArray: '10 5',
    fillOpacity: 0,
    labelColor: '#0077b6',
    labelSize: '12px',
  },
  tma: {
    color: '#9b5de5',
    weight: 1.8,
    opacity: 0.7,
    dashArray: '6 4',
    fillColor: 'rgba(155, 93, 229, 0.06)',
    fillOpacity: 0.06,
    labelColor: '#9b5de5',
    labelSize: '10px',
  },
  ctr: {
    color: '#e63946',
    weight: 1.5,
    opacity: 0.7,
    dashArray: '4 4',
    fillColor: 'rgba(230, 57, 70, 0.06)',
    fillOpacity: 0.06,
    labelColor: '#e63946',
    labelSize: '10px',
  },
};

let mapRef = null;

/**
 * Initialize the airspace layer system.
 */
export function initAirspaceLayers(map) {
  mapRef = map;
}

/**
 * Toggle a specific layer on/off.
 * Returns the new visibility state.
 */
export function toggleLayer(type) {
  const info = layers[type];
  if (!info || !mapRef) return false;

  if (info.visible) {
    // Hide
    if (info.layer) mapRef.removeLayer(info.layer);
    info.labels.forEach(l => mapRef.removeLayer(l));
    info.visible = false;
  } else {
    // Show - create if first time
    if (!info.layer) {
      createLayer(type);
    } else {
      info.layer.addTo(mapRef);
      info.labels.forEach(l => l.addTo(mapRef));
    }
    info.visible = true;
  }

  return info.visible;
}

/**
 * Check if a layer is visible.
 */
export function isLayerVisible(type) {
  return layers[type]?.visible || false;
}

/**
 * Create the GeoJSON layer and labels for a given type.
 */
function createLayer(type) {
  const info = layers[type];
  const style = STYLES[type];

  info.layer = L.geoJSON(info.data, {
    style: () => ({
      color: style.color,
      weight: style.weight,
      opacity: style.opacity,
      dashArray: style.dashArray,
      fillColor: style.fillColor || 'transparent',
      fillOpacity: style.fillOpacity || 0,
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.name || feature.properties.id || '';
      const id = feature.properties.id || '';
      layer.bindTooltip(
        `<strong>${id}</strong>${name ? '<br>' + name : ''}`,
        { sticky: true, className: 'airspace-tooltip', direction: 'center' }
      );
    },
  }).addTo(mapRef);

  // Add labels at polygon centroids (only for FIR - TMAs and CTRs have too many)
  if (type === 'fir') {
    addFirLabels(info, style);
  }
}

function addFirLabels(info, style) {
  const centroids = {
    SBAZ: [-5.0, -62.0],
    SBBS: [-13.0, -49.0],
    SBCW: [-27.0, -52.0],
    SBRE: [-7.0, -38.0],
    SBAO: [-19.0, -41.0],
  };

  // Map FIR colors
  const firColors = {
    SBAZ: '#e63946',
    SBBS: '#0077b6',
    SBCW: '#2a9d8f',
    SBRE: '#e9c46a',
    SBAO: '#9b5de5',
  };

  for (const [fir, [lat, lon]] of Object.entries(centroids)) {
    const color = firColors[fir] || style.labelColor;
    const label = L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'airspace-label',
        html: `<span style="color:${color};font-weight:700;font-size:${style.labelSize};font-family:Consolas,monospace;text-shadow:0 0 4px rgba(255,255,255,0.95),0 0 2px rgba(255,255,255,0.95);">${fir}</span>`,
        iconSize: [50, 20],
        iconAnchor: [25, 10],
      }),
      interactive: false,
    }).addTo(mapRef);
    info.labels.push(label);
  }

  // Override FIR layer style with per-FIR colors
  if (info.layer) {
    info.layer.setStyle((feature) => {
      const firId = feature.properties.id;
      const color = firColors[firId] || style.color;
      return {
        color: color,
        weight: style.weight,
        opacity: style.opacity,
        dashArray: style.dashArray,
        fillOpacity: 0,
      };
    });
  }
}
