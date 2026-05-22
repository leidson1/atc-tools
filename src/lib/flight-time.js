// Modelo simplificado de tempo de voo para estimar ingresso em FIR/TMA.
// Perfil de 2 fases: subida (do nível do mar até o FL) + cruzeiro.
// Estimativa — não considera performance real da aeronave nem rota com
// procedimentos; assume rota direta. Vento é opcional.

export const PROFILES = {
  jato: { label: 'Jato', cruiseTAS: 460, climbRate: 2200, climbGS: 300, descentRate: 1800, descentGS: 320 },
  turbo: { label: 'Turboélice', cruiseTAS: 290, climbRate: 1500, climbGS: 200, descentRate: 1500, descentGS: 250 },
  leve: { label: 'Leve / Pistão', cruiseTAS: 140, climbRate: 700, climbGS: 100, descentRate: 600, descentGS: 120 },
};

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
