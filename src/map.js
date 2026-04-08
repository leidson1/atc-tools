import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

let map = null;
let aerodromeMarker = null;
let pointMarker = null;
let radialLine = null;
let distanceCircles = [];
let compassRoseSvg = null;
let onMapClick = null;

// Fix Leaflet default icon path issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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
    zoomControl: true,
    attributionControl: true,
  });

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
