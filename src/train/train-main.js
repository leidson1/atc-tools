// Treinar — módulo de treinamento de fraseologia ATC (Duolingo-like).
// Motor genérico de exercícios alimentado por conteúdo em JSON. No MVP tudo é
// aberto; o portão de acesso (entitlements) já está no caminho para o futuro
// modelo de negócio, mas hoje libera tudo.

import { getCatalog, getTrack, getLesson, getTrackLessons } from '../data/lessons/index.js';
import { speak, stopSpeak, ttsAvailable } from './train-tts.js';
import { gradeText, sameTokens } from './train-grader.js';
import { getXp, getStreak, lessonState, recordLesson } from './train-store.js';
import { canAccess } from '../entitlements.js';

const FS_ID = 'train-fullscreen';

// Estado do "player" (uma lição em andamento). Tudo flui por aqui: cada
// interação muta `run` e chama renderPlayer() — render previsível, sem estado solto.
let run = null;

// ============================================================
// Ícones
// ============================================================
const I = (inner, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const ICONS = {
  close: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  back: I('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),
  cap: I('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>'),
  star: I('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  flame: I('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  check: I('<polyline points="20 6 9 17 4 12"/>'),
  x: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  play: I('<polygon points="6 4 20 12 6 20 6 4"/>', 18),
  lock: I('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 18),
  radio: I('<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48m-8.48 0a6 6 0 0 1 0-8.48m11.31-2.83a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>'),
  tower: I('<path d="M12 2v6"/><path d="M9 8h6l2 12H7z"/><path d="M5 22h14"/><path d="M12 8v14"/>'),
  plane: I('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  rocket: I('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'),
};

const TRACK_ICON = {
  tower: ICONS.tower,
  plane: ICONS.plane,
  rocket: ICONS.rocket,
};

// ============================================================
// Util
// ============================================================
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
// **negrito** → <strong>
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Init + fullscreen
// ============================================================
export function initTrain() {
  const btn = document.getElementById('btn-open-train');
  btn?.addEventListener('click', openHome);
}

function ensureFS() {
  let el = document.getElementById(FS_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = FS_ID;
    el.className = 'train-fs';
    document.body.appendChild(el);
  }
  return el;
}

function closeFS() {
  stopSpeak();
  const el = document.getElementById(FS_ID);
  if (el) el.remove();
  run = null;
}

function statsBar() {
  return `
    <div class="train-stats" aria-label="Seu progresso">
      <span class="train-stat" title="Pontos de experiência">${ICONS.star}<b>${getXp()}</b><i>XP</i></span>
      <span class="train-stat" title="Ofensiva — dias seguidos">${ICONS.flame}<b>${getStreak()}</b><i>dias</i></span>
    </div>`;
}

function fsHeader(title, eyebrow, onBack) {
  const el = ensureFS();
  // o back/close é wired pelo chamador via id
  return `
    <header class="train-hd">
      <button class="train-hd-btn" type="button" id="train-back" aria-label="Voltar">
        ${onBack ? ICONS.back : ICONS.close}<span>${onBack ? 'Voltar' : 'Fechar'}</span>
      </button>
      <div class="train-hd-title">
        <span class="train-hd-eyebrow">${esc(eyebrow)}</span>
        <h1>${esc(title)}</h1>
      </div>
      ${statsBar()}
    </header>`;
}

// ============================================================
// Tela 1 — Home (escolha de trilha)
// ============================================================
function openHome() {
  const el = ensureFS();
  el.className = 'train-fs';
  const catalog = getCatalog();
  el.innerHTML = `
    ${fsHeader('Treinar fraseologia', 'ACADEMIA ATC', false)}
    <div class="train-body">
      <p class="train-lead">Pratique fraseologia em sessões curtas, no estilo lição. Você ouve, monta o cotejo e treina o <strong>hearback</strong>. Escolha sua trilha.</p>
      <div class="train-tracks">
        ${catalog.tracks.map(renderTrackCard).join('')}
      </div>
      <p class="train-foot-note">Progresso salvo só neste aparelho. Sem cadastro, sem custo.</p>
    </div>`;

  el.querySelector('#train-back')?.addEventListener('click', closeFS);
  el.querySelectorAll('[data-track]').forEach((c) => {
    c.addEventListener('click', () => {
      const tr = getTrack(c.dataset.track);
      if (tr && tr.available) openTrack(tr.id);
    });
  });
}

function renderTrackCard(tr) {
  const lessons = (tr.lessons || []).map(getLesson).filter(Boolean);
  const done = lessons.filter((l) => lessonState(l.id)?.done).length;
  const locked = !tr.available;
  return `
    <button type="button" class="train-track train-accent-${esc(tr.accent)}${locked ? ' is-soon' : ''}" data-track="${esc(tr.id)}" ${locked ? 'aria-disabled="true"' : ''}>
      <span class="train-track-icon">${TRACK_ICON[tr.icon] || ICONS.cap}</span>
      <span class="train-track-main">
        <span class="train-track-top">
          <span class="train-track-title">${esc(tr.title)}</span>
          ${locked ? '<span class="train-badge">Em breve</span>' : (lessons.length ? `<span class="train-badge ok">${done}/${lessons.length}</span>` : '')}
        </span>
        <span class="train-track-tag">${esc(tr.tagline)}</span>
        <span class="train-track-aud">${esc(tr.audience)}</span>
      </span>
    </button>`;
}

// ============================================================
// Tela 2 — Trilha (lista de lições / trilha de habilidades)
// ============================================================
function openTrack(trackId) {
  const el = ensureFS();
  const tr = getTrack(trackId);
  if (!tr) return openHome();
  el.className = `train-fs train-accent-${tr.accent}`;
  const lessons = getTrackLessons(trackId);

  el.innerHTML = `
    ${fsHeader(tr.title, 'TRILHA', true)}
    <div class="train-body">
      <p class="train-lead">${esc(tr.tagline)}</p>
      <div class="train-path">
        ${lessons.map((l, i) => renderLessonRow(l, i)).join('')}
      </div>
    </div>`;

  el.querySelector('#train-back')?.addEventListener('click', openHome);
  el.querySelectorAll('[data-lesson]').forEach((row) => {
    row.addEventListener('click', () => {
      const l = getLesson(row.dataset.lesson);
      if (l && canAccess(l)) startLesson(l.id);
    });
  });
}

function renderLessonRow(l, i) {
  const st = lessonState(l.id);
  const done = !!st?.done;
  const pct = st ? Math.round((st.best || 0) * 100) : 0;
  return `
    <button type="button" class="train-lesson${done ? ' is-done' : ''}" data-lesson="${esc(l.id)}">
      <span class="train-lesson-node">${done ? ICONS.check : (i + 1)}</span>
      <span class="train-lesson-info">
        <span class="train-lesson-title">${esc(l.title)}</span>
        <span class="train-lesson-sub">${esc(l.subtitle || '')}</span>
        ${done ? `<span class="train-lesson-best">Melhor: ${pct}% &middot; ${st.plays}×</span>` : `<span class="train-lesson-best muted">${l.exercises.length} exercícios</span>`}
      </span>
      <span class="train-lesson-go">${ICONS.play}</span>
    </button>`;
}

// ============================================================
// Tela 3 — Player (motor de exercícios)
// ============================================================
function startLesson(id) {
  const lesson = getLesson(id);
  if (!lesson) return;
  run = {
    lesson,
    idx: -1,
    results: new Array(lesson.exercises.length).fill(null),
    phase: 'intro',
  };
  renderIntro();
}

function renderIntro() {
  const el = ensureFS();
  const { lesson } = run;
  el.className = `train-fs train-accent-${getTrack(lesson.track)?.accent || 'blue'}`;
  el.innerHTML = `
    ${fsHeader(lesson.title, 'LIÇÃO', true)}
    <div class="train-body train-intro">
      <div class="train-intro-card">
        ${lesson.scenario ? `<div class="train-scenario"><span>CENÁRIO</span>${fmt(lesson.scenario)}</div>` : ''}
        <ul class="train-intro-list">
          ${(lesson.intro || []).map((p) => `<li>${fmt(p)}</li>`).join('')}
        </ul>
        <button type="button" class="train-btn-primary" id="train-start">Começar &middot; ${lesson.exercises.length} exercícios</button>
      </div>
    </div>`;
  el.querySelector('#train-back')?.addEventListener('click', () => openTrack(lesson.track));
  el.querySelector('#train-start')?.addEventListener('click', () => enterExercise(0));
}

function enterExercise(i) {
  run.idx = i;
  run.tries = 0;
  run.phase = 'answering';
  run.feedback = null;
  run.choice = null;
  const ex = run.lesson.exercises[i];
  if (ex.type === 'build') {
    run.bank = shuffle([...(ex.solution || []), ...(ex.distractors || [])]);
    run.pick = [];
  }
  renderPlayer();
  // auto-toca o áudio ao entrar (replayável pelo botão)
  if (ex.audioText) setTimeout(() => speak(ex.audioText, { lang: ex.lang || run.lesson.lang || 'en' }), 220);
}

function renderPlayer() {
  const el = ensureFS();
  const { lesson, idx } = run;
  const ex = lesson.exercises[idx];
  const pct = Math.round((idx / lesson.exercises.length) * 100);

  el.innerHTML = `
    <header class="train-hd train-hd-slim">
      <button class="train-hd-btn" type="button" id="train-quit" aria-label="Sair da lição">${ICONS.close}</button>
      <div class="train-prog"><div class="train-prog-bar" style="width:${pct}%"></div></div>
      <span class="train-prog-count">${idx + 1}/${lesson.exercises.length}</span>
    </header>
    <div class="train-body train-play">
      <div class="train-ex">
        ${ex.kind ? `<span class="train-ex-kind">${esc(ex.kind)}</span>` : ''}
        <p class="train-prompt">${fmt(ex.prompt)}</p>
        ${ex.context ? `<p class="train-context">${fmt(ex.context)}</p>` : ''}
        ${ex.audioText ? `<button type="button" class="train-audio" id="train-audio">${ICONS.play}<span>Ouvir</span></button>` : ''}
        <div class="train-ex-body">${renderExerciseBody(ex)}</div>
      </div>
      ${renderFeedback(ex)}
    </div>
    <footer class="train-foot">${renderFooterBtn(ex)}</footer>`;

  wirePlayer(ex);
}

function renderExerciseBody(ex) {
  if (ex.type === 'build') return renderBuild(ex);
  if (ex.type === 'choose') return renderChoose(ex);
  if (ex.type === 'fill') return renderFill(ex);
  if (ex.type === 'type') return renderType(ex);
  return `<p class="train-context">Tipo de exercício não suportado: ${esc(ex.type)}</p>`;
}

// --- build (montar a frase) ---
function renderBuild(ex) {
  const locked = run.phase === 'feedback';
  const answer = run.pick.length
    ? run.pick.map((t, i) => `<button type="button" class="train-chip picked" data-pick="${i}" ${locked ? 'disabled' : ''}>${esc(t)}</button>`).join('')
    : `<span class="train-answer-ph">toque nos blocos para montar…</span>`;
  const usedCount = {};
  run.pick.forEach((t) => { usedCount[t] = (usedCount[t] || 0) + 1; });
  const seen = {};
  const bank = run.bank.map((t, i) => {
    seen[t] = (seen[t] || 0) + 1;
    const used = seen[t] <= (usedCount[t] || 0);
    return `<button type="button" class="train-chip${used ? ' is-used' : ''}" data-bank="${i}" ${used || locked ? 'disabled' : ''}>${esc(t)}</button>`;
  }).join('');
  return `
    <div class="train-answerline">${answer}</div>
    <div class="train-bank">${bank}</div>`;
}

// --- choose (múltipla escolha / hearback) ---
function renderChoose(ex) {
  const locked = run.phase === 'feedback';
  return `<div class="train-options">${ex.options.map((opt, i) => {
    let cls = 'train-option';
    if (run.choice === i) cls += ' sel';
    if (locked) {
      if (i === ex.correct) cls += ' correct';
      else if (run.choice === i) cls += ' wrong';
    }
    return `<button type="button" class="${cls}" data-opt="${i}" ${locked ? 'disabled' : ''}>
      <span class="train-option-mark"></span><span>${fmt(opt)}</span></button>`;
  }).join('')}</div>`;
}

// --- fill (completar lacuna) ---
function renderFill(ex) {
  const locked = run.phase === 'feedback';
  const parts = ex.template.split('____');
  let html = '<div class="train-fill">';
  parts.forEach((p, i) => {
    if (p) html += `<span class="train-fill-txt">${fmt(p)}</span>`;
    if (i < parts.length - 1) {
      html += `<input class="train-blank" id="train-blank-${i}" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" ${locked ? 'disabled' : ''} />`;
    }
  });
  html += '</div>';
  return html;
}

// --- type (digitar livre) ---
function renderType(ex) {
  const locked = run.phase === 'feedback';
  return `<input class="train-input" id="train-input" type="text" placeholder="Digite o cotejo…" autocomplete="off" autocapitalize="characters" spellcheck="false" ${locked ? 'disabled' : ''} />`;
}

function renderFeedback(ex) {
  if (run.phase !== 'feedback' && !(run.feedback && run.feedback.retry)) return '';
  const fb = run.feedback || {};
  if (fb.retry) {
    return `<div class="train-fb retry">${ICONS.x}<div><b>Quase!</b> Revise e tente de novo.</div></div>`;
  }
  const ok = fb.correct;
  const answerLine = !ok && ex.answer ? `<div class="train-fb-answer">Resposta: <b>${esc(ex.answer)}</b></div>` : '';
  return `
    <div class="train-fb ${ok ? 'ok' : 'no'}">
      <span class="train-fb-ic">${ok ? ICONS.check : ICONS.x}</span>
      <div class="train-fb-text">
        <b>${ok ? 'Correto!' : 'Não foi dessa vez.'}</b>
        ${answerLine}
        ${ex.explain ? `<div class="train-explain">${fmt(ex.explain)}</div>` : ''}
      </div>
    </div>`;
}

function renderFooterBtn(ex) {
  if (run.phase === 'feedback') {
    const last = run.idx >= run.lesson.exercises.length - 1;
    return `<button type="button" class="train-btn-primary" id="train-continue">${last ? 'Finalizar' : 'Continuar'}</button>`;
  }
  return `<button type="button" class="train-btn-primary" id="train-check">Verificar</button>`;
}

function wirePlayer(ex) {
  const el = ensureFS();
  el.querySelector('#train-quit')?.addEventListener('click', () => {
    stopSpeak();
    openTrack(run.lesson.track);
  });
  el.querySelector('#train-audio')?.addEventListener('click', () =>
    speak(ex.audioText, { lang: ex.lang || run.lesson.lang || 'en' })
  );
  el.querySelector('#train-check')?.addEventListener('click', checkAnswer);
  el.querySelector('#train-continue')?.addEventListener('click', continueNext);

  if (ex.type === 'build') {
    el.querySelectorAll('[data-bank]').forEach((b) =>
      b.addEventListener('click', () => {
        run.pick.push(run.bank[+b.dataset.bank]);
        renderPlayer();
      })
    );
    el.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        run.pick.splice(+b.dataset.pick, 1);
        renderPlayer();
      })
    );
  }
  if (ex.type === 'choose') {
    el.querySelectorAll('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => {
        run.choice = +b.dataset.opt;
        renderPlayer();
      })
    );
  }
  // foco no primeiro campo de texto
  const firstField = el.querySelector('.train-input, .train-blank');
  if (firstField && run.phase === 'answering') {
    firstField.focus();
    firstField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }
    });
  }
}

function evaluate(ex) {
  if (ex.type === 'build') return sameTokens(run.pick, ex.solution);
  if (ex.type === 'choose') return run.choice === ex.correct;
  if (ex.type === 'type') {
    const v = document.getElementById('train-input')?.value || '';
    return gradeText(v, ex.answer, ex.accept).correct;
  }
  if (ex.type === 'fill') {
    return (ex.blanks || []).every((b, i) => {
      const v = document.getElementById('train-blank-' + i)?.value || '';
      return gradeText(v, b.answer, b.accept).correct;
    });
  }
  return false;
}

function checkAnswer() {
  const ex = run.lesson.exercises[run.idx];
  // exige uma resposta mínima
  if (ex.type === 'build' && !run.pick.length) return;
  if (ex.type === 'choose' && run.choice == null) return;

  run.tries = (run.tries || 0) + 1;
  const correct = evaluate(ex);
  const allowRetry = ex.type !== 'choose'; // múltipla escolha revela na hora

  if (correct) {
    run.results[run.idx] = { correct: true, firstTry: run.tries === 1, xp: run.tries === 1 ? 10 : 5 };
    run.phase = 'feedback';
    run.feedback = { correct: true };
  } else if (allowRetry && run.tries < 2) {
    run.feedback = { correct: false, retry: true };
  } else {
    run.results[run.idx] = { correct: false, firstTry: false, xp: 0 };
    run.phase = 'feedback';
    run.feedback = { correct: false };
  }
  renderPlayer();
}

function continueNext() {
  stopSpeak();
  if (run.idx + 1 < run.lesson.exercises.length) {
    enterExercise(run.idx + 1);
  } else {
    finishLesson();
  }
}

// ============================================================
// Tela 4 — Resumo
// ============================================================
function finishLesson() {
  const total = run.lesson.exercises.length;
  const xp = run.results.reduce((a, r) => a + (r?.xp || 0), 0);
  const firsts = run.results.filter((r) => r?.firstTry).length;
  const accuracy = total ? firsts / total : 0;
  recordLesson(run.lesson.id, { xp, accuracy });
  renderSummary({ xp, accuracy, firsts, total });
}

function renderSummary({ xp, accuracy, firsts, total }) {
  const el = ensureFS();
  const { lesson } = run;
  const pct = Math.round(accuracy * 100);
  const great = pct >= 80;
  el.className = `train-fs train-accent-${getTrack(lesson.track)?.accent || 'blue'}`;
  el.innerHTML = `
    <div class="train-body train-summary">
      <div class="train-summary-card">
        <div class="train-summary-ring${great ? ' great' : ''}">${great ? ICONS.star : ICONS.check}</div>
        <h2>${great ? 'Excelente!' : 'Lição concluída'}</h2>
        <p class="train-summary-sub">${esc(lesson.title)}</p>
        <div class="train-summary-grid">
          <div><b>+${xp}</b><i>XP</i></div>
          <div><b>${pct}%</b><i>acerto de 1ª</i></div>
          <div><b>${firsts}/${total}</b><i>de primeira</i></div>
        </div>
        <div class="train-summary-actions">
          <button type="button" class="train-btn-primary" id="train-sum-back">Voltar à trilha</button>
          <button type="button" class="train-btn-ghost" id="train-sum-again">Refazer</button>
        </div>
      </div>
    </div>`;
  el.querySelector('#train-sum-back')?.addEventListener('click', () => openTrack(lesson.track));
  el.querySelector('#train-sum-again')?.addEventListener('click', () => startLesson(lesson.id));
}
