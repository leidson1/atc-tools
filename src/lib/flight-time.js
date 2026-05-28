// Modelo simplificado de tempo de voo para estimar ingresso em FIR/TMA.
// Perfil de 2 fases: subida (do nível do mar até o FL) + cruzeiro.
// Estimativa — não considera performance real da aeronave nem rota com
// procedimentos; assume rota direta. Vento é opcional.

export const PROFILES = {
  jato: { label: 'Jato', category: 'Jato', cruiseTAS: 460, defaultFL: 350, climbRate: 2200, climbGS: 300, descentRate: 1800, descentGS: 320 },
  turbo: { label: 'Turboelice', category: 'Turboelice', cruiseTAS: 290, defaultFL: 250, climbRate: 1500, climbGS: 200, descentRate: 1500, descentGS: 250 },
  leve: { label: 'Leve / Pistao', category: 'Leve', cruiseTAS: 140, defaultFL: 90, climbRate: 700, climbGS: 100, descentRate: 600, descentGS: 120 },
};

const profile = (id, data) => ({
  id,
  source: 'Estimado operacional',
  aliases: [],
  ...data,
});

export const AIRCRAFT_PROFILES = [
  profile('jato', { ...PROFILES.jato, icao: '', aliases: ['JET', 'JATO GENERICO'] }),
  profile('turbo', { ...PROFILES.turbo, icao: '', aliases: ['TURBOHELICE', 'TURBO HELICE', 'TURBOPROP'] }),
  profile('leve', { ...PROFILES.leve, icao: '', aliases: ['PISTAO', 'PISTON', 'LEVE PISTAO'] }),

  profile('PA34', {
    icao: 'PA34',
    label: 'Piper PA-34 Seneca',
    category: 'Pistao bimotor',
    aliases: ['PA-34', 'SENECA', 'PAPA ALPHA 34', 'PIPER SENECA'],
    cruiseTAS: 160,
    defaultFL: 110,
    climbRate: 850,
    climbGS: 105,
    descentRate: 700,
    descentGS: 135,
  }),
  profile('C182', {
    icao: 'C182',
    label: 'Cessna 182 Skylane',
    category: 'Pistao monomotor',
    aliases: ['CESSNA 182', 'SKYLANE', 'CHARLIE 182', 'CHARLIE 1182', 'C1182'],
    cruiseTAS: 140,
    defaultFL: 90,
    climbRate: 700,
    climbGS: 90,
    descentRate: 600,
    descentGS: 125,
  }),
  profile('BE55', {
    icao: 'BE55',
    label: 'Beech Baron 55 / E55',
    category: 'Pistao bimotor',
    aliases: ['BARON', 'BARON 55', 'E55', 'ECO 55', 'BEECH 55'],
    cruiseTAS: 190,
    defaultFL: 120,
    climbRate: 1100,
    climbGS: 125,
    descentRate: 800,
    descentGS: 170,
  }),
  profile('BE58', {
    icao: 'BE58',
    label: 'Beech Baron 58',
    category: 'Pistao bimotor',
    aliases: ['BARON 58', 'BEECH 58'],
    cruiseTAS: 195,
    defaultFL: 120,
    climbRate: 1200,
    climbGS: 130,
    descentRate: 800,
    descentGS: 175,
  }),
  profile('C172', {
    icao: 'C172',
    label: 'Cessna 172 Skyhawk',
    category: 'Pistao monomotor',
    aliases: ['CESSNA 172', 'SKYHAWK'],
    cruiseTAS: 115,
    defaultFL: 70,
    climbRate: 600,
    climbGS: 75,
    descentRate: 500,
    descentGS: 105,
  }),
  profile('P28A', {
    icao: 'P28A',
    label: 'Piper PA-28 Cherokee/Archer',
    category: 'Pistao monomotor',
    aliases: ['PA28', 'PA-28', 'CHEROKEE', 'ARCHER'],
    cruiseTAS: 115,
    defaultFL: 70,
    climbRate: 600,
    climbGS: 75,
    descentRate: 500,
    descentGS: 105,
  }),
  profile('PA31', {
    icao: 'PA31',
    label: 'Piper PA-31 Navajo',
    category: 'Pistao bimotor',
    aliases: ['NAVAJO', 'PA-31'],
    cruiseTAS: 180,
    defaultFL: 120,
    climbRate: 1000,
    climbGS: 120,
    descentRate: 800,
    descentGS: 160,
  }),
  profile('C208', {
    icao: 'C208',
    label: 'Cessna 208 Caravan',
    category: 'Turboelice leve',
    aliases: ['CARAVAN', 'CESSNA 208', 'C208B'],
    cruiseTAS: 175,
    defaultFL: 100,
    climbRate: 900,
    climbGS: 115,
    descentRate: 800,
    descentGS: 155,
  }),
  profile('BE20', {
    icao: 'BE20',
    label: 'Beech King Air 200',
    category: 'Turboelice',
    aliases: ['KING AIR', 'KING AIR 200', 'B200', 'SUPER KING AIR'],
    cruiseTAS: 285,
    defaultFL: 250,
    climbRate: 1600,
    climbGS: 170,
    descentRate: 1500,
    descentGS: 240,
  }),
  profile('PC12', {
    icao: 'PC12',
    label: 'Pilatus PC-12',
    category: 'Turboelice',
    aliases: ['PILATUS', 'PC-12'],
    cruiseTAS: 270,
    defaultFL: 250,
    climbRate: 1500,
    climbGS: 165,
    descentRate: 1300,
    descentGS: 230,
  }),
  profile('E110', {
    icao: 'E110',
    label: 'Embraer EMB-110 Bandeirante',
    category: 'Turboelice',
    aliases: ['BANDEIRANTE', 'EMB110', 'EMB-110'],
    cruiseTAS: 180,
    defaultFL: 120,
    climbRate: 900,
    climbGS: 125,
    descentRate: 800,
    descentGS: 165,
  }),
  profile('E120', {
    icao: 'E120',
    label: 'Embraer EMB-120 Brasilia',
    category: 'Turboelice',
    aliases: ['BRASILIA', 'EMB120', 'EMB-120'],
    cruiseTAS: 260,
    defaultFL: 220,
    climbRate: 1500,
    climbGS: 175,
    descentRate: 1300,
    descentGS: 225,
  }),
  profile('AT45', {
    icao: 'AT45',
    label: 'ATR 42',
    category: 'Turboelice regional',
    aliases: ['ATR42', 'ATR 42'],
    cruiseTAS: 250,
    defaultFL: 170,
    climbRate: 1300,
    climbGS: 165,
    descentRate: 1200,
    descentGS: 215,
  }),
  profile('AT72', {
    icao: 'AT72',
    label: 'ATR 72',
    category: 'Turboelice regional',
    aliases: ['ATR72', 'ATR 72'],
    cruiseTAS: 275,
    defaultFL: 210,
    climbRate: 1400,
    climbGS: 175,
    descentRate: 1300,
    descentGS: 230,
  }),
  profile('C25A', {
    icao: 'C25A',
    label: 'Citation CJ2',
    category: 'Jato executivo',
    aliases: ['CJ2', 'CITATION CJ2', 'C525A'],
    cruiseTAS: 390,
    defaultFL: 350,
    climbRate: 2500,
    climbGS: 245,
    descentRate: 1800,
    descentGS: 300,
  }),
  profile('C560', {
    icao: 'C560',
    label: 'Citation V/Ultra/Encore',
    category: 'Jato executivo',
    aliases: ['CITATION 560', 'CITATION V', 'ULTRA', 'ENCORE'],
    cruiseTAS: 410,
    defaultFL: 370,
    climbRate: 2600,
    climbGS: 255,
    descentRate: 1900,
    descentGS: 310,
  }),
];

export function aircraftDisplayLabel(p) {
  return p.icao ? `${p.icao} - ${p.label}` : p.label;
}

export function aircraftHint(p) {
  const source = p.source ? `fonte: ${p.source}` : 'estimado';
  return `${p.category || 'Perfil'} · TAS ${p.cruiseTAS}kt · FL${p.defaultFL || '--'} · ${source}`;
}

function normalizeAircraftQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

export function findAircraftProfile(value) {
  const q = normalizeAircraftQuery(value);
  if (!q) return null;

  const exact = AIRCRAFT_PROFILES.find((p) => {
    const terms = [
      p.id,
      p.icao,
      p.label,
      aircraftDisplayLabel(p),
      ...(p.aliases || []),
    ].map(normalizeAircraftQuery);
    return terms.includes(q);
  });
  if (exact) return exact;

  return AIRCRAFT_PROFILES.find((p) => {
    const terms = [
      p.id,
      p.icao,
      p.label,
      aircraftDisplayLabel(p),
      ...(p.aliases || []),
    ].map(normalizeAircraftQuery);
    return terms.some((term) => term.startsWith(q) || term.includes(` ${q}`));
  }) || null;
}

// Componente de vento de proa (kt). Positivo = proa (reduz GS); negativo = cauda.
// windFrom: direção DE onde o vento sopra (graus); track: rumo verdadeiro da rota.
export function headwindComponent(windFrom, windKt, track) {
  return windKt * Math.cos(((windFrom - track) * Math.PI) / 180);
}

// Tempo (minutos) para percorrer `distNm` desde a decolagem.
// Perfil de 3 fases: subida (0->FL), cruzeiro, descida (TOD->destino).
// `totalDist` habilita a fase de descida; sem ele, considera só subida+cruzeiro.
export function timeToDistanceMin(distNm, {
  fl, tas, climbRate, climbGS, descentRate, descentGS, headwind = 0, totalDist = null,
}) {
  const cruiseGS = Math.max(60, tas - headwind);
  const climbGSeff = Math.max(40, climbGS - headwind);
  const descentGSeff = Math.max(40, (descentGS || climbGS) - headwind);
  const climbAltFt = fl * 100;

  const climbTimeMin = climbAltFt / climbRate;
  const climbDistNm = climbGSeff * (climbTimeMin / 60);

  let todDist = Infinity;
  let descentDistNm = 0;
  if (totalDist != null && descentRate) {
    const descentTimeMin = climbAltFt / descentRate;
    descentDistNm = descentGSeff * (descentTimeMin / 60);
    todDist = totalDist - descentDistNm;
  }
  // Rota curta: subida e descida se sobrepõem -> ignora a descida.
  if (todDist <= climbDistNm) todDist = Infinity;

  if (distNm <= climbDistNm) {
    return (distNm / climbGSeff) * 60;
  }
  if (distNm >= todDist) {
    const timeToTod = climbTimeMin + ((todDist - climbDistNm) / cruiseGS) * 60;
    return timeToTod + ((distNm - todDist) / descentGSeff) * 60;
  }
  return climbTimeMin + ((distNm - climbDistNm) / cruiseGS) * 60;
}

// "1230" | "12:30" -> minutos desde 00:00; null se inválido
export function parseHHMM(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// minutos desde 00:00 -> "HH:MM" (com wrap em 24h)
export function formatHHMM(totalMin) {
  const t = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "270/40" -> { from: 270, kt: 40 }; null se inválido/vazio
export function parseWind(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,3})\s*[\/x@]\s*(\d{1,3})$/);
  if (!m) return null;
  return { from: +m[1] % 360, kt: +m[2] };
}
