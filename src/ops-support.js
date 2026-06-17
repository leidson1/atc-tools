// Apoio Operacional — checklists interativos baseados nos documentos oficiais
// (CIRCEA 100-56 + MODELO APP PJ 2024/01). Texto fiel; UI guia o passo-a-passo.

import catalog from './data/protocols/catalog.json';
import avsec2 from './data/protocols/avsec-anexo-2.json';
import avsec3 from './data/protocols/avsec-anexo-3.json';
import avsec5 from './data/protocols/avsec-anexo-5.json';
import avsec6 from './data/protocols/avsec-anexo-6.json';
import avsec7 from './data/protocols/avsec-anexo-7.json';
import avsec8 from './data/protocols/avsec-anexo-8.json';
import appEmergAssist from './data/protocols/app-emerg-assistencia.json';
import appEmergMedica from './data/protocols/app-emerg-medica.json';
import appEmergBomba from './data/protocols/app-emerg-bomba.json';
import appEmergDescida from './data/protocols/app-emerg-descida.json';
import appEmergCombust from './data/protocols/app-emerg-combustivel.json';
import appEal from './data/protocols/app-eal.json';
import appAcidente from './data/protocols/app-acidente.json';

const PROTOCOLS = {
  'avsec-anexo-2': avsec2,
  'avsec-anexo-3': avsec3,
  'avsec-anexo-5': avsec5,
  'avsec-anexo-6': avsec6,
  'avsec-anexo-7': avsec7,
  'avsec-anexo-8': avsec8,
  'app-emerg-assistencia': appEmergAssist,
  'app-emerg-medica': appEmergMedica,
  'app-emerg-bomba': appEmergBomba,
  'app-emerg-descida': appEmergDescida,
  'app-emerg-combustivel': appEmergCombust,
  'app-eal': appEal,
  'app-acidente': appAcidente,
};

const STORAGE_KEY = 'atc-ops-session';

let session = null;
let tickTimer = null;

// ============================================================
// Init + render do catálogo (vai na aba "Apoio Operacional")
// ============================================================
export function initOpsSupport() {
  const view = document.getElementById('view-apoio');
  if (!view) return;
  renderCatalog();
  loadFromStorage();
  if (session && !session.finishedAt) {
    renderSessionResumeCard();
  }
}

function getProtocol(id) {
  return PROTOCOLS[id] || null;
}

function countActionable(p) {
  let n = 0;
  const walk = (arr) => {
    for (const s of arr || []) { n++; if (s.children) walk(s.children); }
  };
  walk(p.steps);
  return n;
}

function renderCatalog() {
  const view = document.getElementById('view-apoio');
  view.innerHTML = `
    <div class="ops-catalog">
      <div id="ops-resume-slot"></div>
      <div class="ops-intro">
        <strong>Apoio Operacional</strong> — checklists das fichas oficiais com texto fiel.
        Toque num protocolo pra iniciar; horários são registrados automaticamente.
      </div>
      ${catalog.groups.map(renderGroupCard).join('')}
    </div>
  `;
  view.querySelectorAll('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => startSession(btn.dataset.start));
  });
}

function renderGroupCard(group) {
  const protocols = group.protocols.map(getProtocol).filter(Boolean);
  return `
    <details class="ops-group ops-color-${group.color}" open>
      <summary>
        <span class="ops-group-stripe"></span>
        <div class="ops-group-titles">
          <div class="ops-group-title">${escapeHTML(group.title)}</div>
          <div class="ops-group-sub">${escapeHTML(group.subtitle)}</div>
        </div>
        <small class="ops-group-source">${escapeHTML(group.source)}</small>
      </summary>
      <div class="ops-protocol-list">
        ${protocols.map((p) => `
          <button class="ops-protocol-btn ops-color-${group.color}" data-start="${p.id}" type="button">
            <div class="ops-protocol-head">
              <span class="ops-protocol-title">${escapeHTML(p.title)}</span>
              <span class="ops-protocol-count">${countActionable(p)} passos</span>
            </div>
            ${p.subtitle ? `<div class="ops-protocol-sub">${escapeHTML(p.subtitle)}</div>` : ''}
          </button>
        `).join('')}
      </div>
    </details>
  `;
}

function renderSessionResumeCard() {
  const slot = document.getElementById('ops-resume-slot');
  if (!slot || !session) return;
  const done = session.steps.filter((s) => s.status === 'done' || s.status === 'na').length;
  slot.innerHTML = `
    <div class="ops-resume ops-color-${session.protocol.color}">
      <span class="ops-resume-stripe"></span>
      <div class="ops-resume-body">
        <div class="ops-resume-eyebrow">Sessão em andamento</div>
        <div class="ops-resume-title">${escapeHTML(session.protocol.title)}</div>
        <div class="ops-resume-meta">${done} de ${session.steps.length} ações · iniciado às ${fmtHHMMSS(session.startedAt)}</div>
      </div>
      <button class="ops-resume-btn" type="button" id="ops-resume-open">Retomar</button>
    </div>
  `;
  document.getElementById('ops-resume-open')?.addEventListener('click', () => openSessionScreen());
}

// ============================================================
// Sessão ativa
// ============================================================
function flattenSteps(steps) {
  const out = [];
  const walk = (arr, depth, parent) => {
    for (const s of arr || []) {
      const key = parent ? `${parent}.${s.n}` : String(s.n);
      out.push({
        key,
        n: s.n,
        text: s.text,
        contacts: s.contacts || [],
        depth,
        parent,
        hasChildren: !!s.children,
      });
      if (s.children) walk(s.children, depth + 1, key);
    }
  };
  walk(steps, 0, '');
  return out.map((s) => ({
    ...s,
    status: 'pending',     // pending | done | na
    completedAt: null,
    contactedWith: [],     // [{ tag, who, when }]
    note: '',
    naReason: '',
  }));
}

function startSession(protocolId) {
  const protocol = getProtocol(protocolId);
  if (!protocol) return;
  session = {
    protocol,
    startedAt: Date.now(),
    finishedAt: null,
    steps: flattenSteps(protocol.steps),
  };
  saveToStorage();
  openSessionScreen();
}

function openSessionScreen() {
  if (!session) return;
  let modal = document.getElementById('ops-session-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ops-session-modal';
    modal.className = `ops-session-modal ops-color-${session.protocol.color}`;
    document.body.appendChild(modal);
  } else {
    modal.className = `ops-session-modal ops-color-${session.protocol.color}`;
  }
  renderSessionScreen(modal);
  startTicker();
}

function closeSessionScreen() {
  const modal = document.getElementById('ops-session-modal');
  if (modal) modal.remove();
  stopTicker();
  renderSessionResumeCard();
}

function renderSessionScreen(modal) {
  const p = session.protocol;
  const stepsHTML = session.steps.map(renderStepCard).join('');
  const done = session.steps.filter((s) => s.status === 'done' || s.status === 'na').length;
  const pct = Math.round((done / session.steps.length) * 100);

  modal.innerHTML = `
    <div class="ops-session-header">
      <div class="ops-session-stripe"></div>
      <div class="ops-session-headtext">
        <div class="ops-session-eyebrow">${escapeHTML(p.source)}</div>
        <h2 class="ops-session-title">${escapeHTML(p.title)}</h2>
        ${p.subtitle ? `<div class="ops-session-sub">${escapeHTML(p.subtitle)}</div>` : ''}
      </div>
      <div class="ops-session-headright">
        <div class="ops-session-clock">
          <span class="ops-session-clock-elapsed" id="ops-clock-elapsed">00:00</span>
          <span class="ops-session-clock-started">início ${fmtHHMMSS(session.startedAt)}</span>
        </div>
        <button class="ops-session-close" type="button" id="ops-close-btn" aria-label="Voltar ao catálogo">✕</button>
      </div>
    </div>

    <div class="ops-session-progress">
      <div class="ops-progress-bar" style="width:${pct}%"></div>
      <div class="ops-progress-text">${done} de ${session.steps.length} ações · ${pct}%</div>
    </div>

    ${p.intro ? `<div class="ops-session-intro">${escapeHTML(p.intro)}</div>` : ''}
    ${p.note ? `<div class="ops-session-note"><strong>NOTA:</strong> ${escapeHTML(p.note)}</div>` : ''}

    <div class="ops-session-steps">${stepsHTML}</div>

    <div class="ops-session-footer">
      <button type="button" class="ops-footer-btn ops-footer-export" id="ops-export-btn">Exportar registro</button>
      <button type="button" class="ops-footer-btn ops-footer-finish" id="ops-finish-btn">Finalizar evento</button>
    </div>
  `;

  modal.querySelector('#ops-close-btn').addEventListener('click', closeSessionScreen);
  modal.querySelector('#ops-export-btn').addEventListener('click', exportSession);
  modal.querySelector('#ops-finish-btn').addEventListener('click', finishSession);

  // Wire dos botões de cada step
  modal.querySelectorAll('[data-step-key]').forEach((card) => {
    const key = card.dataset.stepKey;
    card.querySelector('.ops-step-btn-done')?.addEventListener('click', () => toggleStep(key, 'done'));
    card.querySelector('.ops-step-btn-undo')?.addEventListener('click', () => toggleStep(key, 'pending'));
    card.querySelector('.ops-step-btn-na')?.addEventListener('click', () => promptNa(key));
    card.querySelectorAll('.ops-step-contact').forEach((cb) => {
      cb.addEventListener('click', () => recordContact(key, cb.dataset.contact, cb));
    });
  });
}

function renderStepCard(s) {
  const status = s.status;
  const indent = `style="margin-left:${s.depth * 18}px"`;
  const stamp = s.completedAt ? fmtHHMMSS(s.completedAt) : '';
  const contactsRow = (s.contacts && s.contacts.length) ? `
    <div class="ops-step-contacts">
      ${s.contacts.map((c) => `
        <button type="button" class="ops-step-contact ${s.contactedWith.find((x) => x.tag === c) ? 'recorded' : ''}" data-contact="${escapeAttr(c)}">
          📞 ${escapeHTML(c)}
          ${s.contactedWith.find((x) => x.tag === c) ? `<small>${fmtHHMM(s.contactedWith.find((x) => x.tag === c).when)}</small>` : ''}
        </button>
      `).join('')}
    </div>` : '';
  const naLabel = status === 'na' && s.naReason ? `<div class="ops-step-na-reason">N/A: ${escapeHTML(s.naReason)}</div>` : '';
  return `
    <div class="ops-step ops-step-${status}" data-step-key="${escapeAttr(s.key)}" ${indent}>
      <div class="ops-step-num">${escapeHTML(String(s.n))}</div>
      <div class="ops-step-body">
        <div class="ops-step-text">${escapeHTML(s.text)}</div>
        ${contactsRow}
        ${naLabel}
        <div class="ops-step-actions">
          ${status === 'done' ? `
            <span class="ops-step-stamp">✓ ${stamp}</span>
            <button type="button" class="ops-step-btn-undo">Desfazer</button>
          ` : status === 'na' ? `
            <span class="ops-step-stamp">⊘ N/A</span>
            <button type="button" class="ops-step-btn-undo">Desfazer</button>
          ` : `
            <button type="button" class="ops-step-btn-done">Concluir</button>
            <button type="button" class="ops-step-btn-na">N/A</button>
          `}
        </div>
      </div>
    </div>
  `;
}

function toggleStep(key, newStatus) {
  const s = session.steps.find((x) => x.key === key);
  if (!s) return;
  s.status = newStatus;
  s.completedAt = newStatus === 'pending' ? null : Date.now();
  if (newStatus !== 'na') s.naReason = '';
  saveToStorage();
  refreshSessionUI();
}

function promptNa(key) {
  const reason = window.prompt('Motivo para marcar como Não Aplicável (opcional):', '');
  if (reason === null) return; // cancelou
  const s = session.steps.find((x) => x.key === key);
  if (!s) return;
  s.status = 'na';
  s.naReason = reason || '';
  s.completedAt = Date.now();
  saveToStorage();
  refreshSessionUI();
}

function recordContact(stepKey, tag, btn) {
  const s = session.steps.find((x) => x.key === stepKey);
  if (!s) return;
  const existing = s.contactedWith.find((x) => x.tag === tag);
  if (existing) {
    s.contactedWith = s.contactedWith.filter((x) => x.tag !== tag);
  } else {
    s.contactedWith.push({ tag, when: Date.now() });
  }
  saveToStorage();
  refreshSessionUI();
}

function refreshSessionUI() {
  const modal = document.getElementById('ops-session-modal');
  if (modal && session) renderSessionScreen(modal);
}

// ============================================================
// Cronômetro
// ============================================================
function startTicker() {
  stopTicker();
  tickTimer = setInterval(updateClock, 1000);
  updateClock();
}
function stopTicker() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
function updateClock() {
  const el = document.getElementById('ops-clock-elapsed');
  if (!el || !session) return;
  const seconds = Math.floor((Date.now() - session.startedAt) / 1000);
  el.textContent = fmtDuration(seconds);
}

// ============================================================
// Finalizar e exportar
// ============================================================
function finishSession() {
  if (!session) return;
  if (!window.confirm('Finalizar este evento? O resumo ficará disponível para exportação.')) return;
  session.finishedAt = Date.now();
  saveToStorage();
  exportSession();
}

function exportSession() {
  if (!session) return;
  const p = session.protocol;
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`  ATC TOOLS — APOIO OPERACIONAL — REGISTRO DE EVENTO`);
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Protocolo:  ${p.title}`);
  lines.push(`Subtítulo:  ${p.subtitle || ''}`);
  lines.push(`Fonte:      ${p.source}`);
  lines.push(`Versão:     ${p.version || ''}`);
  lines.push('');
  lines.push(`Início:     ${fmtFullDate(session.startedAt)}`);
  if (session.finishedAt) {
    lines.push(`Fim:        ${fmtFullDate(session.finishedAt)}`);
    lines.push(`Duração:    ${fmtDuration(Math.floor((session.finishedAt - session.startedAt) / 1000))}`);
  }
  lines.push('');
  lines.push('─── AÇÕES ──────────────────────────────────────────────────');
  lines.push('');
  for (const s of session.steps) {
    const ind = '  '.repeat(s.depth);
    const mark = s.status === 'done' ? '[✓]' : s.status === 'na' ? '[⊘]' : '[ ]';
    const stamp = s.completedAt ? `  → ${fmtHHMMSS(s.completedAt)}` : '';
    lines.push(`${ind}${mark} ${s.n}. ${s.text}${stamp}`);
    if (s.contactedWith.length) {
      lines.push(`${ind}    Contatos: ${s.contactedWith.map((c) => `${c.tag} (${fmtHHMM(c.when)})`).join(', ')}`);
    }
    if (s.naReason) {
      lines.push(`${ind}    N/A: ${s.naReason}`);
    }
  }
  lines.push('');
  lines.push('─── RESUMO ─────────────────────────────────────────────────');
  const done = session.steps.filter((s) => s.status === 'done').length;
  const na = session.steps.filter((s) => s.status === 'na').length;
  const pending = session.steps.filter((s) => s.status === 'pending').length;
  lines.push(`Concluídas:    ${done}`);
  lines.push(`Não aplicáveis: ${na}`);
  lines.push(`Pendentes:     ${pending}`);
  lines.push('');
  lines.push('Registro gerado pelo ATC Tools.');
  lines.push('═══════════════════════════════════════════════════════════');

  const txt = lines.join('\n');
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fname = `apoio-${p.id}-${fmtFileDate(session.startedAt)}.txt`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// Persistência
// ============================================================
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) { /* localStorage cheio: ignora */ }
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.protocol && parsed.steps) {
      // Reidrata referência ao protocol caso o JSON tenha mudado
      const fresh = getProtocol(parsed.protocol.id);
      if (fresh) parsed.protocol = fresh;
      session = parsed;
    }
  } catch (e) { /* ignora corrupção */ }
}

// ============================================================
// Helpers
// ============================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHHMM(ts) { const d = new Date(ts); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`; }
function fmtHHMMSS(ts) { const d = new Date(ts); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`; }
function fmtFullDate(ts) { const d = new Date(ts); return `${d.getUTCDate()}/${pad2(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${fmtHHMMSS(ts)}`; }
function fmtFileDate(ts) { const d = new Date(ts); return `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`; }
function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
