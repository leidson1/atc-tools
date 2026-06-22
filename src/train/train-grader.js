// Correção de fraseologia (custo 'static' — roda 100% local, sem IA).
//
// A fraseologia é quase uma gramática formal, então dá para normalizar e comparar
// com tolerância a maiúsculas, pontuação e variações conhecidas. Respostas
// alternativas legítimas ficam em `accept` na própria lição.

export function normalize(s) {
  let t = (s || '').toLowerCase();
  // equivalências de fraseologia
  t = t.replace(/\bflight level\b/g, 'fl');
  t = t.replace(/\b(decimal|point)\b/g, ' ');
  t = t.replace(/\bdegrees?\b/g, ' ');
  t = t.replace(/\bknots?\b/g, ' ');
  // pontuação e separadores viram espaço (PT-MEG -> pt meg ; 118.35 -> 118 35)
  t = t.replace(/[-/.,;:!?'"()]/g, ' ');
  // "fl 070" -> "fl070"
  t = t.replace(/\bfl\s+(\d)/g, 'fl$1');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function ratio(a, b) {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Avalia texto livre (exercícios 'type' e lacunas 'fill').
// Correto se bater exatamente (normalizado) com a resposta ou com qualquer `accept`,
// ou se ficar a 1–2 caracteres (tolerância a erro de digitação) — nunca solta um
// erro de fraseologia de verdade.
export function gradeText(input, answer, accept = []) {
  const n = normalize(input);
  if (!n) return { correct: false, score: 0 };
  const targets = [answer, ...(accept || [])].map(normalize).filter(Boolean);
  if (targets.includes(n)) return { correct: true, exact: true, score: 1 };
  let best = 0;
  for (const t of targets) best = Math.max(best, ratio(n, t));
  return { correct: best >= 0.95, close: best >= 0.72, score: best };
}

// Igualdade de sequência de tokens (exercício 'build').
export function sameTokens(picked, solution) {
  if (!Array.isArray(picked) || !Array.isArray(solution)) return false;
  if (picked.length !== solution.length) return false;
  return picked.every((tok, i) => normalize(tok) === normalize(solution[i]));
}
