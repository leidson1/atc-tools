// Parser de coordenadas geográficas em múltiplos formatos.
//
// Aceita (exemplos = Rio, -22.9068, -43.1729):
//   DD   graus decimais     -22.9068, -43.1729  |  22.9068S 43.1729W
//   DMS  graus min seg      22°54'24"S 043°10'22"W  |  22 54 24 S 043 10 22 W
//   DDM  graus min decimais 22°54.4'S 043°10.4'W  |  2254.4S 04310.4W
//   ICAO compacto (FPL 15)  2254S04310W  |  225424S0431022W  |  22S043W
//
// Quando não há hemisfério nem sinal, assume Sul/Oeste (FIR brasileira) e
// marca `assumed: true` para o app avisar o usuário.

function toDecimalMag(deg, min, sec) {
  return deg + (min || 0) / 60 + (sec || 0) / 3600;
}

function inRange(lat, lon) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function ddmString(value, isLat) {
  const hemi = isLat ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${pad(deg, isLat ? 2 : 3)}°${pad(min.toFixed(1), 4)}'${hemi}`;
}

function packedString(value, isLat) {
  const hemi = isLat ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = Math.round((abs - deg) * 60);
  return `${pad(deg, isLat ? 2 : 3)}${pad(min, 2)}${hemi}`;
}

function build(lat, lon, format, assumed) {
  if (!inRange(lat, lon)) return null;
  return {
    lat,
    lon,
    format,
    assumed: !!assumed,
    prettyDd: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    prettyDdm: `${ddmString(lat, true)} ${ddmString(lon, false)}`,
    packed: `${packedString(lat, true)}${packedString(lon, false)}`,
  };
}

// Resolve o sinal final a partir de hemisfério explícito, sinal numérico, ou
// (em último caso) assume negativo — Sul para latitude, Oeste para longitude.
function resolveSign(magnitude, hemi, hadMinus) {
  if (hemi === 'S' || hemi === 'W') return { value: -magnitude, assumed: false };
  if (hemi === 'N' || hemi === 'E') return { value: magnitude, assumed: false };
  if (hadMinus) return { value: -magnitude, assumed: false };
  return { value: -magnitude, assumed: true };
}

// --- Estratégia 1: componentes explícitos com hemisfério (DMS, DDM, DD c/ letra) ---
function tryComponents(raw) {
  const t = raw
    .replace(/[°º]/g, ' ')
    .replace(/['′]/g, ' ')
    .replace(/["″]/g, ' ')
    .replace(/:/g, ' ');

  const collect = (regex, hemiFirst) => {
    const out = [];
    let m;
    regex.lastIndex = 0;
    while ((m = regex.exec(t)) !== null) {
      if (hemiFirst) {
        out.push({ hemi: m[1], deg: parseFloat(m[2]), min: m[3] ? parseFloat(m[3]) : 0, sec: m[4] ? parseFloat(m[4]) : 0 });
      } else {
        out.push({ deg: parseFloat(m[1]), min: m[2] ? parseFloat(m[2]) : 0, sec: m[3] ? parseFloat(m[3]) : 0, hemi: m[4] });
      }
    }
    return out;
  };

  // hemisfério depois dos números (mais comum)
  let parts = collect(/(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+(?:\.\d+)?))?\s*([NSEW])/g, false);
  // hemisfério antes
  if (parts.length !== 2) {
    parts = collect(/([NSEW])\s*(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+(?:\.\d+)?))?/g, true);
  }
  if (parts.length !== 2) return null;

  let latPart = parts.find((p) => p.hemi === 'N' || p.hemi === 'S');
  let lonPart = parts.find((p) => p.hemi === 'E' || p.hemi === 'W');
  if (!latPart || !lonPart) return null;

  const lat = (latPart.hemi === 'S' ? -1 : 1) * toDecimalMag(latPart.deg, latPart.min, latPart.sec);
  const lon = (lonPart.hemi === 'W' ? -1 : 1) * toDecimalMag(lonPart.deg, lonPart.min, lonPart.sec);
  const hasSec = latPart.sec || lonPart.sec;
  const hasMin = latPart.min || lonPart.min;
  const format = hasSec ? 'DMS' : hasMin ? 'DDM' : 'DD';
  return build(lat, lon, format, false);
}

// --- Estratégia 2: ICAO compacto (sem separadores) ---
function decodePacked(intStr, frac, isLat) {
  const f = frac ? parseFloat(frac) : 0;
  const len = intStr.length;
  if (isLat) {
    if (len === 2) return toDecimalMag(+intStr + f, 0, 0);
    if (len === 4) return toDecimalMag(+intStr.slice(0, 2), +intStr.slice(2, 4) + f, 0);
    if (len === 6) return toDecimalMag(+intStr.slice(0, 2), +intStr.slice(2, 4), +intStr.slice(4, 6) + f);
  } else {
    if (len === 3) return toDecimalMag(+intStr + f, 0, 0);
    if (len === 5) return toDecimalMag(+intStr.slice(0, 3), +intStr.slice(3, 5) + f, 0);
    if (len === 7) return toDecimalMag(+intStr.slice(0, 3), +intStr.slice(3, 5), +intStr.slice(5, 7) + f);
  }
  return null;
}

function tryPacked(raw) {
  const m = raw.match(
    /^([NS])?\s*(\d{2,6})(\.\d+)?\s*([NS])?\s*[,;/]?\s*([EW])?\s*(\d{3,7})(\.\d+)?\s*([EW])?$/
  );
  if (!m) return null;

  const latHemi = m[1] || m[4];
  const lonHemi = m[5] || m[8];
  if ((m[1] && m[4]) || (m[5] && m[8])) return null; // hemisfério duplicado

  const latMag = decodePacked(m[2], m[3], true);
  const lonMag = decodePacked(m[6], m[7], false);
  if (latMag == null || lonMag == null) return null;

  const lat = resolveSign(latMag, latHemi, false);
  const lon = resolveSign(lonMag, lonHemi, false);
  return build(lat.value, lon.value, 'ICAO', lat.assumed || lon.assumed);
}

// --- Estratégia 3: par decimal com sinal (DD), sem letras ---
function tryDecimalPair(raw) {
  if (/[NSEW]/.test(raw)) return null;
  const m = raw.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[,;/ ]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;

  const latRaw = parseFloat(m[1]);
  const lonRaw = parseFloat(m[2]);
  const lat = resolveSign(Math.abs(latRaw), null, /^-/.test(m[1]));
  const lon = resolveSign(Math.abs(lonRaw), null, /^-/.test(m[2]));
  return build(lat.value, lon.value, 'DD', lat.assumed || lon.assumed);
}

/**
 * Tenta interpretar `raw` como coordenada geográfica.
 * @returns {{lat,lon,format,assumed,prettyDd,prettyDdm,packed}|null}
 */
export function parseCoordinate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s.length < 3 || !/\d/.test(s)) return null;

  return tryComponents(s) || tryPacked(s) || tryDecimalPair(s);
}
