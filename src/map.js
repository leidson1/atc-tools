import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

let map = null;
let aerodromeMarker = null;
let pointMarker = null;
let radialLine = null;
let distanceCircles = [];
let trajectoryLayers = [];
let compassRoseSvg = null;
let onMapClick = null;

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const LIGHT_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// Custom aerodrome icon
const aerodromeIcon = L.divIcon({
  className: 'aerodrome-marker',
  html: '<div class="aerodrome-marker-icon"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Custom point icon (red)
const pointIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;background:#dc2626;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function initMap(containerId, onClick) {
  onMapClick = onClick;

  map = L.map(containerId, {
    center: [-10.2914, -48.3569], // SBPJ default
    zoom: 8,
    zoomControl: false,
    attributionControl: true,
  });

  // Zoom control on the right so the floating panel (top-left) doesn't cover it
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer(LIGHT_TILES, {
    attribution: LIGHT_ATTR,
    maxZoom: 18,
    subdomains: 'abcd',
  }).addTo(map);

  // Cursor coordinates display
  map.on('mousemove', (e) => {
    const el = document.getElementById('cursor-coords');
    if (el) {
      el.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    }
  });

  // Click to calculate
  map.on('click', (e) => {
    if (onMapClick) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });

  return map;
}

export function setAerodrome(lat, lon, name, icao) {
  if (!map) return;

  // Remove previous marker
  if (aerodromeMarker) {
    map.removeLayer(aerodromeMarker);
  }

  aerodromeMarker = L.marker([lat, lon], { icon: aerodromeIcon })
    .addTo(map)
    .bindTooltip(`${icao} - ${name}`, {
      permanent: false,
      className: 'distance-label',
      direction: 'top',
      offset: [0, -16],
    });

  // Center map on aerodrome
  map.setView([lat, lon], 8);

  // Draw distance circles
  clearDistanceCircles();
  drawDistanceCircles(lat, lon);
}

function drawDistanceCircles(lat, lon) {
  const intervals = [5, 10, 15, 20, 30, 50, 100]; // NM
  const nmToMeters = 1852;

  intervals.forEach((nm) => {
    const circle = L.circle([lat, lon], {
      radius: nm * nmToMeters,
      color: 'rgba(0, 119, 182, 0.3)',
      weight: 1,
      fill: false,
      dashArray: '4 6',
    }).addTo(map);

    // Add distance label
    const labelLat = lat + (nm * nmToMeters) / 111320;
    const label = L.marker([labelLat, lon], {
      icon: L.divIcon({
        className: 'distance-label',
        html: `${nm} NM`,
        iconSize: [40, 14],
        iconAnchor: [20, 7],
      }),
    }).addTo(map);

    distanceCircles.push(circle, label);
  });
}

function clearDistanceCircles() {
  distanceCircles.forEach((layer) => map.removeLayer(layer));
  distanceCircles = [];
}

export function showRdlOnMap(result) {
  if (!map) return;

  clearRdlVisuals();

  const aeroPos = [result.aerodrome_lat, result.aerodrome_lon];
  const pointPos = [result.point_lat, result.point_lon];

  // Draw radial line
  radialLine = L.polyline([aeroPos, pointPos], {
    color: '#dc2626',
    weight: 2,
    opacity: 0.8,
    dashArray: '8 4',
  }).addTo(map);

  // Draw point marker with popup
  pointMarker = L.marker(pointPos, { icon: pointIcon })
    .addTo(map)
    .bindPopup(
      `<div class="popup-rdl">
        ${result.target_name ? `<span class="detail">${result.target_icao || ''} ${result.target_name}</span>` : ''}
        ${result.target_info ? `<span class="loc">${result.target_info}</span>` : ''}
        <span class="rdl">${result.aerodrome_icao} RDL ${result.formatted}</span>
        <span class="detail">Mag: ${result.radial_magnetic.toFixed(1)}° | True: ${result.radial_true.toFixed(1)}°</span>
        <span class="detail">${result.distance_nm.toFixed(1)} NM</span>
      </div>`,
      { className: 'dark-popup' }
    )
    .openPopup();

  // Fit bounds to show both points
  const bounds = L.latLngBounds([aeroPos, pointPos]);
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
}

export function clearRdlVisuals() {
  if (radialLine) {
    map.removeLayer(radialLine);
    radialLine = null;
  }
  if (pointMarker) {
    map.removeLayer(pointMarker);
    pointMarker = null;
  }
}

export function getMap() {
  return map;
}

// Custom trajectory endpoint icon (green)
const trajIcon = L.divIcon({
  className: '',
  html: `<div style="width:13px;height:13px;background:#0a7d2c;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [13, 13],
  iconAnchor: [6.5, 6.5],
});

const pad3 = (v) => String(Math.round(v)).padStart(3, '0');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function routePopupHtml(dest, details) {
  const mag = Number.isFinite(details.magBearing) ? pad3(details.magBearing) : '---';
  const tru = Number.isFinite(details.trueBearing) ? pad3(details.trueBearing) : '---';
  const dist = Number.isFinite(details.distanceNm) ? `${details.distanceNm.toFixed(0)} NM` : '-- NM';
  const destName = dest.name && dest.name !== dest.identifier ? ` ${escapeHtml(dest.name)}` : '';
  const destInfo = dest.info ? `<span class="loc">${escapeHtml(dest.info)}</span>` : '';

  return `<div class="popup-rdl popup-route">
    <span class="detail">${escapeHtml(dest.identifier || '')}${destName}</span>
    ${destInfo}
    <span class="rdl">PROA ${mag}°</span>
    <span class="detail">True: ${tru}° | ${dist}</span>
  </div>`;
}

function routeArrowIcon(details) {
  const mag = Number.isFinite(details.magBearing) ? pad3(details.magBearing) : '---';
  const trueBearing = Number.isFinite(details.trueBearing) ? details.trueBearing : details.magBearing || 90;
  const rotation = trueBearing - 90;

  return L.divIcon({
    className: 'route-arrow-marker',
    html: `<div class="route-arrow-pill">
      <span class="route-arrow-head" style="transform:rotate(${rotation}deg)"></span>
      <b>PROA ${mag}</b>
    </div>`,
    iconSize: [92, 26],
    iconAnchor: [46, 13],
  });
}

export function showTrajectory(a, b, traj, crossed, details = {}) {
  if (!map) return;
  clearTrajectory();

  const latlngs = traj.map((p) => [p.lat, p.lon]);

  // Highlight crossed TMA polygons first (under the line)
  if (crossed.length) {
    const layer = L.geoJSON(
      { type: 'FeatureCollection', features: crossed.map((c) => c.feature) },
      {
        interactive: false,
        style: {
          color: '#9b5de5',
          weight: 2,
          opacity: 0.9,
          fillColor: '#9b5de5',
          fillOpacity: 0.18,
          dashArray: '4 3',
        },
      }
    ).addTo(map);
    trajectoryLayers.push(layer);
  }

  const line = L.polyline(latlngs, {
    color: '#0a7d2c',
    weight: 3,
    opacity: 0.9,
  }).addTo(map);
  trajectoryLayers.push(line);

  const midpoint = latlngs[Math.floor(latlngs.length / 2)];
  if (midpoint) {
    const arrow = L.marker(midpoint, {
      icon: routeArrowIcon(details),
      interactive: false,
      keyboard: false,
    }).addTo(map);
    trajectoryLayers.push(arrow);
  }

  const mk = (pt, label) =>
    L.marker([pt.lat, pt.lon], { icon: trajIcon })
      .addTo(map)
      .bindTooltip(label, { direction: 'top', className: 'distance-label', offset: [0, -10] });

  const originMarker = mk(a, a.identifier || 'A');
  const destMarker = mk(b, b.identifier || 'B')
    .bindPopup(routePopupHtml(b, details), { className: 'dark-popup' })
    .openPopup();
  trajectoryLayers.push(originMarker, destMarker);

  map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 10 });
}

export function clearTrajectory() {
  trajectoryLayers.forEach((l) => map.removeLayer(l));
  trajectoryLayers = [];
}
