// Motor de simulação — cinemática de aeronaves.
// Sem dependências externas; estado puro + função de tick.

const NM_PER_DEG_LAT = 60; // 1 grau de latitude ≈ 60 NM
const TURN_RATE = 3;       // graus/segundo (curva padrão ATC, "rate one")
const CLIMB_FPM = 1800;    // pés/min de subida
const DESCENT_FPM = 2000;  // pés/min de descida
const ACCEL_KT_S = 4;      // nós por segundo (aceleração/desaceleração)

// Normaliza ângulo para [0, 360)
function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

// Diferença assinada mais curta entre dois rumos (-180..180)
function headingDiff(from, to) {
  let d = norm360(to) - norm360(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function createAircraft(spec) {
  return {
    callsign: spec.callsign,
    type: spec.type || 'B738',
    lat: spec.lat,
    lon: spec.lon,
    heading: norm360(spec.heading ?? 0),
    altitude: spec.altitude ?? 6000,     // pés
    speed: spec.speed ?? 250,            // nós (ground speed)
    // Alvos (autopilot)
    targetHeading: norm360(spec.heading ?? 0),
    targetAltitude: spec.altitude ?? 6000,
    targetSpeed: spec.speed ?? 250,
    turnDir: null,        // 'L' | 'R' | null (null = caminho mais curto)
    // Histórico de trilha (últimas posições) pra desenhar rastro
    trail: [],
  };
}

// Avança o estado da aeronave por dt segundos.
export function updateAircraft(ac, dt) {
  // --- Proa ---
  if (Math.abs(headingDiff(ac.heading, ac.targetHeading)) > 0.1) {
    const maxStep = TURN_RATE * dt;
    let diff = headingDiff(ac.heading, ac.targetHeading);
    // Se foi instruída direção específica, respeita mesmo que seja o caminho longo
    if (ac.turnDir === 'L' && diff > 0) diff -= 360;
    if (ac.turnDir === 'R' && diff < 0) diff += 360;
    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    ac.heading = norm360(ac.heading + step);
    // Ao chegar no alvo, zera a direção forçada
    if (Math.abs(headingDiff(ac.heading, ac.targetHeading)) <= 0.1) {
      ac.heading = ac.targetHeading;
      ac.turnDir = null;
    }
  }

  // --- Altitude ---
  if (Math.abs(ac.altitude - ac.targetAltitude) > 1) {
    const climbing = ac.targetAltitude > ac.altitude;
    const rateFps = (climbing ? CLIMB_FPM : DESCENT_FPM) / 60; // pés/segundo
    const step = rateFps * dt;
    if (climbing) ac.altitude = Math.min(ac.targetAltitude, ac.altitude + step);
    else ac.altitude = Math.max(ac.targetAltitude, ac.altitude - step);
  }

  // --- Velocidade ---
  if (Math.abs(ac.speed - ac.targetSpeed) > 0.1) {
    const accel = ACCEL_KT_S * dt;
    if (ac.targetSpeed > ac.speed) ac.speed = Math.min(ac.targetSpeed, ac.speed + accel);
    else ac.speed = Math.max(ac.targetSpeed, ac.speed - accel);
  }

  // --- Posição (avança ao longo da proa pela ground speed) ---
  const distNm = (ac.speed * dt) / 3600; // NM percorridos em dt
  const hdgRad = (ac.heading * Math.PI) / 180;
  const dLat = (distNm * Math.cos(hdgRad)) / NM_PER_DEG_LAT;
  const latRad = (ac.lat * Math.PI) / 180;
  const dLon = (distNm * Math.sin(hdgRad)) / (NM_PER_DEG_LAT * Math.cos(latRad));
  ac.lat += dLat;
  ac.lon += dLon;

  // Trilha (guarda ponto a cada chamada; o caller limita o tamanho)
  ac.trail.push([ac.lat, ac.lon]);
  if (ac.trail.length > 60) ac.trail.shift();

  return ac;
}

// Aplica uma lista de ações (do parser) à aeronave.
export function applyActions(ac, actions) {
  for (const a of actions) {
    switch (a.type) {
      case 'heading':
        ac.targetHeading = norm360(a.value);
        ac.turnDir = a.dir || null; // 'L' | 'R' | null
        break;
      case 'turn':
        // Curva sem proa específica: gira 90° pro lado indicado a partir do alvo atual
        ac.turnDir = a.dir;
        ac.targetHeading = norm360(ac.targetHeading + (a.dir === 'L' ? -90 : 90));
        break;
      case 'altitude':
        ac.targetAltitude = a.value;
        break;
      case 'speed':
        ac.targetSpeed = a.value;
        break;
      default:
        break;
    }
  }
  return ac;
}

// Distância em NM entre aeronave e um ponto (haversine simplificado p/ curtas distâncias)
export function distanceNm(ac, lat, lon) {
  const dLat = (lat - ac.lat) * NM_PER_DEG_LAT;
  const dLon = (lon - ac.lon) * NM_PER_DEG_LAT * Math.cos((ac.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Rumo da aeronave até um ponto (graus)
export function bearingTo(ac, lat, lon) {
  const dLat = (lat - ac.lat) * NM_PER_DEG_LAT;
  const dLon = (lon - ac.lon) * NM_PER_DEG_LAT * Math.cos((ac.lat * Math.PI) / 180);
  return norm360((Math.atan2(dLon, dLat) * 180) / Math.PI);
}

export { norm360, headingDiff };
