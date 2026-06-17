import L from 'leaflet';

// Camada opcional de tráfego ao vivo usando o feed publico da OpenSky Network.
// Fonte ADS-B comunitaria: nao-operacional, latencia ~10s, buracos no interior.

const ENDPOINT = 'https://opensky-network.org/api/states/all';
const REFRESH_MS = 10000;            // OpenSky free: ~10s entre chamadas anonimas
const MOVE_DEBOUNCE_MS = 500;
const STALE_MS = 60000;              // posicoes com >60s viram cinza/transparente

let mapRef = null;
let layerGroup = null;
let markers = new Map();             // icao24 -> L.marker
let visible = false;
let refreshTimer = null;
let moveDebounce = null;
let inFlight = false;

export function initLiveTraffic(map) {
  mapRef = map;
  map.on('moveend', () => {
    if (!visible) return;
    if (moveDebounce) clearTimeout(moveDebounce);
    moveDebounce = setTimeout(refreshNow, MOVE_DEBOUNCE_MS);
  });
}

export function toggleLiveTraffic() {
  if (!mapRef) return false;
  if (visible) stop(); else start();
  return visible;
}

function start() {
  if (!layerGroup) layerGroup = L.layerGroup();
  layerGroup.addTo(mapRef);
  visible = true;
  refreshNow();
  refreshTimer = setInterval(refreshNow, REFRESH_MS);
}

function stop() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (moveDebounce) { clearTimeout(moveDebounce); moveDebounce = null; }
  if (layerGroup && mapRef) mapRef.removeLayer(layerGroup);
  markers.forEach((m) => m.remove());
  markers.clear();
  visible = false;
}

async function refreshNow() {
  if (!visible || !mapRef || inFlight) return;
  const b = mapRef.getBounds();
  const params = new URLSearchParams({
    lamin: b.getSouth().toFixed(3),
    lomin: b.getWest().toFixed(3),
    lamax: b.getNorth().toFixed(3),
    lomax: b.getEast().toFixed(3),
  });
  inFlight = true;
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (res.status === 429) {
      console.warn('[traffic] OpenSky rate-limited (429); proxima tentativa em 30s');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (visible) render(data);
  } catch (err) {
    console.warn('[traffic]', err.message || err);
  } finally {
    inFlight = false;
  }
}

function render(data) {
  if (!visible || !layerGroup) return;
  const nowMs = (data.time || Math.floor(Date.now() / 1000)) * 1000;
  const seen = new Set();

  for (const s of data.states || []) {
    // OpenSky state vector indices:
    // 0 icao24, 1 callsign, 2 origin_country, 3 time_position, 4 last_contact,
    // 5 longitude, 6 latitude, 7 baro_altitude(m), 8 on_ground, 9 velocity(m/s),
    // 10 true_track(deg), 11 vertical_rate(m/s), 13 geo_altitude(m)
    const icao24 = s[0];
    const callsignRaw = s[1];
    const country = s[2];
    const timePos = s[3];
    const lon = s[5];
    const lat = s[6];
    const baroAltM = s[7];
    const onGround = s[8];
    const velMs = s[9];
    const trackDeg = s[10];
    const geoAltM = s[13];
    if (lat == null || lon == null || !icao24) continue;

    seen.add(icao24);
    const callsign = (callsignRaw && callsignRaw.trim()) || icao24;
    const altM = baroAltM != null ? baroAltM : geoAltM;
    const altFt = altM != null ? Math.round(altM * 3.281) : null;
    const spdKt = velMs != null ? Math.round(velMs * 1.94384) : null;
    const heading = trackDeg != null ? trackDeg : 0;
    const ageSec = timePos ? Math.max(0, Math.round((nowMs - timePos * 1000) / 1000)) : null;
    const isStale = ageSec != null && ageSec * 1000 > STALE_MS;
    const icon = buildPlaneIcon(heading, altFt, onGround, isStale);

    let m = markers.get(icao24);
    if (m) {
      m.setLatLng([lat, lon]);
      m.setIcon(icon);
    } else {
      m = L.marker([lat, lon], { icon, riseOnHover: true, keyboard: false });
      m.addTo(layerGroup);
      markers.set(icao24, m);
    }
    m.unbindPopup();
    m.bindPopup(buildPopup({ callsign, country, altFt, spdKt, heading, ageSec, lat, lon }), {
      className: 'traffic-popup',
      autoPan: false,
    });
  }

  for (const [icao24, m] of markers) {
    if (!seen.has(icao24)) {
      m.remove();
      markers.delete(icao24);
    }
  }
}

function altColor(altFt, onGround) {
  if (onGround) return '#94a3b8';
  if (altFt == null) return '#0077b6';
  if (altFt < 10000) return '#16a34a';   // baixo
  if (altFt < 24000) return '#0891b2';   // medio
  if (altFt < 36000) return '#0077b6';   // alto
  return '#9b5de5';                       // muito alto
}

function buildPlaneIcon(heading, altFt, onGround, isStale) {
  const color = altColor(altFt, onGround);
  const opacity = isStale ? 0.45 : 1;
  return L.divIcon({
    className: 'traffic-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="traffic-marker" style="transform:rotate(${heading.toFixed(0)}deg);opacity:${opacity}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="0.6">
        <path d="M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>`,
  });
}

function buildPopup({ callsign, country, altFt, spdKt, heading, ageSec, lat, lon }) {
  const fl = altFt == null
    ? '—'
    : altFt >= 6000
      ? `FL${String(Math.round(altFt / 100)).padStart(3, '0')}`
      : `${altFt} ft`;
  const spd = spdKt != null ? `${spdKt} kt` : '—';
  const trk = `${String(Math.round(heading)).padStart(3, '0')}°`;
  const age = ageSec != null ? `há ${ageSec}s` : '—';
  return `<div class="popup-traffic">
    <span class="callsign">${esc(callsign)}</span>
    <span class="country">${esc(country || '—')}</span>
    <div class="traffic-grid">
      <div><i>Nível</i><b>${fl}</b></div>
      <div><i>Vel</i><b>${spd}</b></div>
      <div><i>Proa</i><b>${trk}</b></div>
    </div>
    <div class="traffic-foot">
      <span class="age">atualizado ${age}</span>
      <button type="button" class="traffic-target-btn"
        onclick="window.__onTargetClick && window.__onTargetClick(${lat}, ${lon})">Usar como alvo</button>
    </div>
  </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
