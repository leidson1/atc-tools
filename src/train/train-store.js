// Progresso do módulo Treinar — localStorage (sem login no MVP).
// XP, ofensiva (streak) e estado por lição. Quando houver conta (tier edu/pro),
// este mesmo formato sincroniza com o backend; a UI não muda.

const KEY = 'atc-train-progress';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

function blank() {
  return { xp: 0, streak: { count: 0, lastDay: null }, lessons: {} };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      return { ...blank(), ...raw, streak: { ...blank().streak, ...(raw.streak || {}) }, lessons: raw.lessons || {} };
    }
  } catch (e) {
    /* ignore */
  }
  return blank();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* quota/disabled — segue só em memória */
  }
}

export function getProgress() {
  return state;
}

export function getXp() {
  return state.xp || 0;
}

export function getStreak() {
  // streak "viva" só conta se a última prática foi hoje ou ontem
  const s = state.streak || { count: 0, lastDay: null };
  if (s.lastDay === todayStr() || s.lastDay === yesterdayStr()) return s.count || 0;
  return 0;
}

export function lessonState(id) {
  return state.lessons[id] || null;
}

function bumpStreak() {
  const s = state.streak || { count: 0, lastDay: null };
  const t = todayStr();
  if (s.lastDay === t) return; // já contou hoje
  s.count = s.lastDay === yesterdayStr() ? (s.count || 0) + 1 : 1;
  s.lastDay = t;
  state.streak = s;
}

// Registra a conclusão de uma lição. accuracy ∈ [0,1].
export function recordLesson(id, { xp = 0, accuracy = 0 } = {}) {
  const prev = state.lessons[id] || { done: false, best: 0, plays: 0 };
  state.lessons[id] = {
    done: true,
    best: Math.max(prev.best || 0, accuracy),
    plays: (prev.plays || 0) + 1,
    completedAt: Date.now(),
  };
  state.xp = (state.xp || 0) + xp;
  bumpStreak();
  save();
  return state;
}

export function resetAll() {
  state = blank();
  save();
  return state;
}
