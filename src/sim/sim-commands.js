// Parser de comandos ATC em português (determinístico, sem LLM).
// Converte texto livre em ações estruturadas + gera o cotejo (readback).
// Esta é a peça que, no futuro, pode ser trocada por um LLM sem mexer no motor.

import { norm360 } from './sim-engine.js';

// Mapa de números por extenso → dígito (pra aceitar "proa dois sete zero")
const WORD_DIGIT = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', 'três': '3',
  quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8', nove: '9',
};

// Converte sequência de palavras-número em string de dígitos.
// "dois sete zero" -> "270"
function wordsToDigits(text) {
  const out = [];
  for (const w of text.toLowerCase().split(/[\s-]+/)) {
    if (WORD_DIGIT[w] != null) out.push(WORD_DIGIT[w]);
  }
  return out.join('');
}

// Extrai um número de um trecho: aceita dígitos diretos OU por extenso.
function extractNumber(segment) {
  const direct = segment.match(/(\d{2,4})/);
  if (direct) return parseInt(direct[1], 10);
  const fromWords = wordsToDigits(segment);
  if (fromWords.length >= 2) return parseInt(fromWords, 10);
  return null;
}

// Interpreta nível: "060"/"60" -> 6000 ft (FL060); "120" -> 12000; aceita "FL", "nível", "pés".
function parseLevel(raw) {
  if (raw == null) return null;
  // Se já vier em milhares de pés explícitos (ex.: "6000 pés")
  if (raw >= 1000) return raw;
  // Caso contrário trata como FL (nível de voo) → ×100
  return raw * 100;
}

// Indicativo: 2-3 letras + dígitos (TAM345, AZU4090) ou matrícula PR-ABC etc.
// Lookahead negativo exclui "FL120" (nível de voo), que não é indicativo.
const ACFT_RE = /\b(?!FL\d)([A-Z]{2,3}\d{1,4}|PR[A-Z]{3}|PP[A-Z]{3}|PT[A-Z]{3}|PS[A-Z]{3})\b/i;

// Retorna { callsign, actions: [...], unmatched: bool }
export function parseCommand(text, soleCallsign) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const actions = [];

  // 1) Indicativo: tenta achar; se não houver e só existe 1 aeronave, assume ela.
  let callsign = null;
  const m = raw.match(ACFT_RE);
  if (m) callsign = m[1].toUpperCase();
  else if (soleCallsign) callsign = soleCallsign;

  // 2) Proa específica: "proa 270" / "proa dois sete zero"
  const proaMatch = lower.match(/proa\s+([\d\s]+|(?:zero|um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|\s)+)/i);
  if (proaMatch) {
    const val = extractNumber(proaMatch[1]);
    if (val != null && val <= 360) {
      // Direção, se mencionada antes da proa
      let dir = null;
      if (/\b(esquerda|esq)\b/.test(lower)) dir = 'L';
      else if (/\b(direita|dir)\b/.test(lower)) dir = 'R';
      actions.push({ type: 'heading', value: norm360(val), dir });
    }
  } else {
    // 3) Curva sem proa: "curva à direita" / "curve à esquerda"
    if (/\bcurv[ae]r?\b/.test(lower) || /\bvire\b/.test(lower)) {
      if (/\b(esquerda|esq)\b/.test(lower)) actions.push({ type: 'turn', dir: 'L' });
      else if (/\b(direita|dir)\b/.test(lower)) actions.push({ type: 'turn', dir: 'R' });
    }
  }

  // 4) Subir / descer nível: "desça nível 060" / "suba FL120" / "desça 4000 pés"
  const climbMatch = lower.match(/(sub[ai]r?|su[bç]a|descer|des[çc]a)\s+(?:para\s+)?(?:n[íi]vel\s+|fl\s*)?([\d\s]+|(?:zero|um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|\s)+)(?:\s*p[ée]s)?/i);
  if (climbMatch) {
    const num = extractNumber(climbMatch[2]);
    const ft = parseLevel(num);
    if (ft != null) actions.push({ type: 'altitude', value: ft });
  }

  // 5) Velocidade: "reduza 220" / "acelere 280" / "mantenha 250 nós"
  const spdMatch = lower.match(/(reduz[ai]r?|reduza|aceler[ae]r?|aument[ae]r?|mantenha|mant[ée]m)\s+(?:velocidade\s+)?([\d\s]+|(?:zero|um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|\s)+)(?:\s*(?:n[óo]s|kt|kts))?/i);
  if (spdMatch) {
    const val = extractNumber(spdMatch[2]);
    // Velocidades plausíveis 100..400 kt (evita confundir com nível)
    if (val != null && val >= 100 && val <= 400) {
      actions.push({ type: 'speed', value: val });
    }
  }

  return { callsign, actions, unmatched: actions.length === 0 };
}

// Gera o cotejo (readback) que o piloto-IA "fala" de volta, em fraseologia PT.
export function buildReadback(callsign, actions, ac) {
  const parts = [];
  for (const a of actions) {
    if (a.type === 'heading') {
      const dir = a.dir === 'L' ? 'à esquerda ' : a.dir === 'R' ? 'à direita ' : '';
      parts.push(`curva ${dir}proa ${pad3(a.value)}`);
    } else if (a.type === 'turn') {
      parts.push(`curva à ${a.dir === 'L' ? 'esquerda' : 'direita'}`);
    } else if (a.type === 'altitude') {
      const climbing = ac.altitude < a.value;
      parts.push(`${climbing ? 'subindo' : 'descendo'} ${fmtLevel(a.value)}`);
    } else if (a.type === 'speed') {
      parts.push(`velocidade ${a.value} nós`);
    }
  }
  if (!parts.length) return null;
  // Fraseologia: ação(ões) + indicativo no fim (padrão brasileiro de cotejo)
  return `${capitalize(parts.join(', '))}, ${callsign}.`;
}

function pad3(n) { return String(Math.round(n)).padStart(3, '0'); }
function fmtLevel(ft) {
  // No MVP, sempre em nível de voo (FL) — fraseologia mais comum em TMA/rota.
  return `nível ${pad3(Math.round(ft / 100))}`;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
