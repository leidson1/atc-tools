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
const FS_ID = 'ops-fullscreen';

let session = null;
let tickTimer = null;

// ============================================================
// Ícones SVG (Lucide-like)
// ============================================================
const I = (inner, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const ICONS = {
  back:        I('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),
  close:       I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  pdf:         I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>'),
  plus:        I('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  pin:         I('<path d="M12 22s-7-5.5-7-12a7 7 0 0 1 14 0c0 6.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  rotateCcw:   I('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
  trash:       I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  user:        I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  clipboard:   I('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>'),
  download:    I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  // grupos do catálogo
  shieldAlert: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  alertTri:    I('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  alertOct:    I('<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  siren:       I('<path d="M7 12a5 5 0 0 1 10 0v6H7v-6Z"/><path d="M3 18h18"/><path d="M9 6V3"/><path d="M15 6V3"/><path d="M12 6V3"/>'),
  alertCircle: I('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  // ações em passos
  phone:       I('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/>'),
  bell:        I('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  eye:         I('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  pencil:      I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  move:        I('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
  radio:       I('<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48m-8.48 0a6 6 0 0 1 0-8.48m11.31-2.83a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>'),
  refresh:     I('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
  headphones:  I('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>'),
  users:       I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  shield:      I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  maximize:    I('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  check:       I('<polyline points="20 6 9 17 4 12"/>'),
  lifebuoy:    I('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="14.83" y1="9.17" x2="18.36" y2="5.64"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>'),
  send:        I('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
  flag:        I('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
  dot:         I('<circle cx="12" cy="12" r="3.5"/>', 20),
};

const GROUP_ICON = {
  'shield-alert':   ICONS.shieldAlert,
  'alert-triangle': ICONS.alertTri,
  'alert-octagon':  ICONS.alertOct,
  'siren':          ICONS.siren,
  'alert-circle':   ICONS.alertCircle,
};

function iconForStep(text) {
  const t = (text || '').toLowerCase();
  if (/comunicar|informar|notificar|transmitir|repassar/.test(t)) return ICONS.phone;
  if (/acionar|sirene|alarme|toque|hot[\s-]?line/.test(t)) return ICONS.bell;
  if (/identificar|avisar|verificar|estar atento|confirmar|certificar/.test(t)) return ICONS.eye;
  if (/registrar|preencher|lro|fnco|preservar/.test(t)) return ICONS.pencil;
  if (/orientar|deslocar|trajetória|posição|área|taxiar|estacionamento/.test(t)) return ICONS.move;
  if (/restringir|alocar.{0,15}frequência|frequência exclusiva/.test(t)) return ICONS.radio;
  if (/retransmitir/.test(t)) return ICONS.refresh;
  if (/atender|chamada/.test(t)) return ICONS.headphones;
  if (/manter informado/.test(t)) return ICONS.shield;
  if (/aumentar|separação|mínim/.test(t)) return ICONS.maximize;
  if (/autorizar|aprovar/.test(t)) return ICONS.check;
  if (/prestar|assistência|salvaguardar/.test(t)) return ICONS.lifebuoy;
  if (/fornecer/.test(t)) return ICONS.send;
  if (/solicitar|obter|coletar/.test(t)) return ICONS.users;
  if (/tomar.{0,15}medida|adotar|providenciar|emitir|reserva de pista|avaliar/.test(t)) return ICONS.flag;
  return ICONS.dot;
}

// ============================================================
// Init + wire do botão do header
// ============================================================
export function initOpsSupport() {
  loadFromStorage();
  const btn = document.getElementById('btn-open-apoio');
  btn?.addEventListener('click', openApoio);

  // Se houve sessão em andamento, deixa um indicador discreto no botão
  if (session && !session.finishedAt) {
    btn?.classList.add('btn-apoio-active');
  }
}

function openApoio() {
  // Sempre vai pro catálogo. Se houver sessão em andamento, ela aparece
  // como banner no topo — assim quem entra vê todas as opções e decide.
  openCatalogScreen();
}

function getProtocol(id) { return PROTOCOLS[id] || null; }

function countActionable(p) {
  let n = 0;
  const w = (a) => { for (const s of a || []) { n++; if (s.children) w(s.children); } };
  w(p.steps);
  return n;
}

// ============================================================
// Tela cheia (fullscreen) — catálogo
// ============================================================
function ensureFullscreen() {
  let el = document.getElementById(FS_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = FS_ID;
    el.className = 'ops-fullscreen';
    document.body.appendChild(el);
  }
  return el;
}

function closeFullscreen() {
  const el = document.getElementById(FS_ID);
  if (el) el.remove();
  stopTicker();
  const btn = document.getElementById('btn-open-apoio');
  if (btn) btn.classList.toggle('btn-apoio-active', !!(session && !session.finishedAt));
}

function openCatalogScreen() {
  const el = ensureFullscreen();
  el.className = 'ops-fullscreen';
  el.innerHTML = `
    <header class="ops-fs-header">
      <button class="ops-fs-back" type="button" id="ops-fs-close" aria-label="Fechar">
        ${ICONS.close}<span>Fechar</span>
      </button>
      <div class="ops-fs-title">
        <span class="ops-fs-eyebrow">APOIO OPERACIONAL</span>
        <h1>Procedimentos &amp; checklists</h1>
      </div>
      <div class="ops-fs-spacer"></div>
    </header>
    <div class="ops-fs-body">
      ${renderActiveSessionBanner()}
      <p class="ops-fs-lead">Escolha o procedimento que se aplica. Ações marcadas <strong>carimbam horário</strong> automaticamente. Você também pode <strong>registrar acontecimentos</strong> livres na linha do tempo e abrir o <strong>PDF original</strong> a qualquer momento.</p>
      ${catalog.groups.map(renderGroupCard).join('')}
    </div>`;

  el.querySelector('#ops-fs-close')?.addEventListener('click', closeFullscreen);
  el.querySelector('#ops-banner-resume')?.addEventListener('click', () => openSessionScreen());
  el.querySelector('#ops-banner-discard')?.addEventListener('click', () => {
    if (!window.confirm('Descartar este procedimento em andamento? Tudo que foi marcado será perdido.')) return;
    session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    const btn = document.getElementById('btn-open-apoio');
    if (btn) btn.classList.remove('btn-apoio-active');
    openCatalogScreen();
  });
  el.querySelectorAll('[data-start]').forEach((b) => {
    b.addEventListener('click', () => startSession(b.dataset.start));
  });
  el.querySelectorAll('[data-pdf]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openPdfRef(a.dataset.pdf, parseInt(a.dataset.page || '1', 10));
    });
  });
}

function renderActiveSessionBanner() {
  if (!session || session.finishedAt) return '';
  const p = session.protocol;
  const done = session.steps.filter((s) => s.status !== 'pending').length;
  const total = session.steps.length;
  return `
    <div class="ops-active-banner ops-color-${p.color}">
      <div class="ops-active-banner-stripe"></div>
      <div class="ops-active-banner-body">
        <div class="ops-active-banner-eyebrow">⚠ Procedimento em andamento</div>
        <div class="ops-active-banner-title">${escapeHTML(p.title)}</div>
        <div class="ops-active-banner-meta">${done} de ${total} ações · iniciado às ${fmtHHMMSS(session.startedAt)}${session.operator ? ' · ' + escapeHTML(session.operator) : ''}${session.position ? ' (' + escapeHTML(session.position) + ')' : ''}</div>
      </div>
      <div class="ops-active-banner-actions">
        <button type="button" id="ops-banner-resume" class="ops-active-banner-resume">Retomar</button>
        <button type="button" id="ops-banner-discard" class="ops-active-banner-discard">Descartar</button>
      </div>
    </div>`;
}

function renderGroupCard(group) {
  const protocols = group.protocols.map(getProtocol).filter(Boolean);
  const icon = GROUP_ICON[group.icon] || ICONS.clipboard;
  const pdf = protocols[0]?.pdf;
  const pdfBtn = pdf ? `<a class="ops-pdf-link" href="#" data-pdf="${escapeAttr(pdf.file)}" data-page="${pdf.page}" title="Abrir documento oficial">${ICONS.pdf}<span>PDF</span></a>` : '';
  return `
    <section class="ops-group-card ops-color-${group.color}">
      <div class="ops-group-card-head">
        <div class="ops-group-icon">${icon}</div>
        <div class="ops-group-card-titles">
          <div class="ops-group-card-title">${escapeHTML(group.title)}</div>
          <div class="ops-group-card-sub">${escapeHTML(group.subtitle)}</div>
          <div class="ops-group-card-source">${escapeHTML(group.source)}</div>
        </div>
        ${pdfBtn}
      </div>
      <div class="ops-protocol-grid">
        ${protocols.map((p) => `
          <button type="button" class="ops-protocol-card ops-color-${group.color}" data-start="${escapeAttr(p.id)}">
            <div class="ops-protocol-card-num">${countActionable(p)}</div>
            <div class="ops-protocol-card-body">
              <div class="ops-protocol-card-title">${escapeHTML(p.title)}</div>
              ${p.subtitle ? `<div class="ops-protocol-card-sub">${escapeHTML(p.subtitle)}</div>` : ''}
            </div>
            <div class="ops-protocol-card-go">▸</div>
          </button>
        `).join('')}
      </div>
    </section>`;
}

// ============================================================
// PDF
// ============================================================
function openPdfRef(file, page) {
  // Em produção, /pdfs/<arquivo>#page=N abre na página específica nos navegadores que suportam.
  // No build offline (single-file), o asset não está incluído — abre uma mensagem amigável.
  const url = `pdfs/${file}#page=${page || 1}`;
  const win = window.open(url, '_blank');
  if (!win) {
    alert('Permita pop-ups para abrir o PDF original.');
  }
}

// ============================================================
// Sessão ativa
// ============================================================
function flattenSteps(steps) {
  const out = [];
  const walk = (arr, depth, parent) => {
    for (const s of arr || []) {
      const key = parent ? `${parent}.${s.n}` : String(s.n);
      out.push({ key, n: s.n, text: s.text, contacts: s.contacts || [], depth });
      if (s.children) walk(s.children, depth + 1, key);
    }
  };
  walk(steps, 0, '');
  return out.map((s) => ({
    ...s,
    status: 'pending',
    completedAt: null,
    contactedWith: [],
    note: '',
    naReason: '',
  }));
}

function startSession(protocolId) {
  const protocol = getProtocol(protocolId);
  if (!protocol) return;
  if (session && !session.finishedAt) {
    if (session.protocol.id === protocolId) {
      // Clicou no mesmo que já está em andamento — retoma
      openSessionScreen();
      return;
    }
    const cur = session.protocol.title;
    if (!window.confirm(`Já existe um procedimento em andamento:\n\n  ${cur}\n\nDescartar esse procedimento e iniciar "${protocol.title}"?`)) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
  session = {
    protocol,
    startedAt: Date.now(),
    finishedAt: null,
    operator: '',
    position: '',
    identified: false,
    steps: flattenSteps(protocol.steps),
    events: [],
  };
  saveToStorage();
  openSessionScreen();
}

function openSessionScreen() {
  if (!session) return;
  const el = ensureFullscreen();
  el.className = `ops-fullscreen ops-color-${session.protocol.color}`;
  renderSessionScreen(el);
  startTicker();
  if (!session.identified) showIdentifyModal();
}

const POSITIONS = ['TWR', 'AFIS', 'APP', 'ACC', 'Chefe do Órgão', 'Outro'];

function showIdentifyModal() {
  if (!session) return;
  const old = document.getElementById('ops-identify-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'ops-identify-modal';
  modal.className = 'ops-identify-modal';
  modal.innerHTML = `
    <div class="ops-identify-card ops-color-${session.protocol.color}">
      <div class="ops-identify-header">
        <div class="ops-identify-icon">${ICONS.user}</div>
        <div>
          <h3>Quem está conduzindo este procedimento?</h3>
          <p>Tudo opcional — entra no registro exportado quando você finalizar. Pode <strong>Pular</strong> e preencher depois.</p>
        </div>
      </div>
      <label class="ops-identify-field">
        <span>Nome ou iniciais</span>
        <input type="text" id="ops-id-name" value="${escapeAttr(session.operator || '')}" placeholder="Ex.: J. Silva" maxlength="60" autocomplete="off" />
      </label>
      <label class="ops-identify-field">
        <span>Posição operacional</span>
        <select id="ops-id-pos">
          <option value="">— selecione —</option>
          ${POSITIONS.map((p) => `<option value="${escapeAttr(p)}"${p === session.position ? ' selected' : ''}>${escapeHTML(p)}</option>`).join('')}
        </select>
      </label>
      <div class="ops-identify-actions">
        <button type="button" class="ops-identify-skip" id="ops-id-skip">Pular</button>
        <button type="button" class="ops-identify-confirm" id="ops-id-confirm">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const finish = (save) => {
    if (save) {
      session.operator = modal.querySelector('#ops-id-name').value.trim();
      session.position = modal.querySelector('#ops-id-pos').value;
    }
    session.identified = true;
    saveToStorage();
    modal.remove();
    refreshUI();
  };
  modal.querySelector('#ops-id-confirm').addEventListener('click', () => finish(true));
  modal.querySelector('#ops-id-skip').addEventListener('click', () => finish(false));
  modal.addEventListener('click', (e) => { if (e.target === modal) finish(false); });
  setTimeout(() => modal.querySelector('#ops-id-name')?.focus(), 50);
}

function renderSessionScreen(el) {
  const p = session.protocol;
  const done = session.steps.filter((s) => s.status === 'done' || s.status === 'na').length;
  const pct = Math.round((done / session.steps.length) * 100);
  const pdf = p.pdf;
  const pdfBtn = pdf ? `<button type="button" class="ops-fs-pdf" data-pdf="${escapeAttr(pdf.file)}" data-page="${pdf.page}">${ICONS.pdf}<span>Ver PDF original</span></button>` : '';

  el.innerHTML = `
    <header class="ops-fs-header ops-session-fs-header">
      <button class="ops-fs-back" type="button" id="ops-fs-back" aria-label="Voltar ao catálogo (mantém sessão)">
        ${ICONS.back}<span>Catálogo</span>
      </button>
      <button class="ops-session-cancel" type="button" id="ops-cancel-btn" title="Cancelar este procedimento (descarta tudo)" aria-label="Cancelar procedimento">
        ${ICONS.trash}<span>Cancelar</span>
      </button>
      <div class="ops-fs-title">
        <span class="ops-fs-eyebrow">${escapeHTML(p.source)}</span>
        <h1>${escapeHTML(p.title)}</h1>
        ${p.subtitle ? `<div class="ops-fs-sub">${escapeHTML(p.subtitle)}</div>` : ''}
      </div>
      <div class="ops-session-headside">
        <button type="button" class="ops-operator-chip ${(session.operator || session.position) ? 'filled' : ''}" id="ops-operator-chip" title="Identificação do operador (clique para editar)">
          ${ICONS.user}
          <span>${(session.operator || session.position)
            ? `${escapeHTML(session.operator || '—')}${session.position ? ' &nbsp;·&nbsp; <strong>' + escapeHTML(session.position) + '</strong>' : ''}`
            : 'Identificar'}</span>
        </button>
        <button type="button" class="ops-clock-reset" id="ops-clock-reset" title="Reiniciar cronômetro" aria-label="Reiniciar cronômetro">
          ${ICONS.rotateCcw}
        </button>
        <div class="ops-session-clock">
          <span class="ops-session-clock-elapsed" id="ops-clock-elapsed">00:00</span>
          <span class="ops-session-clock-start">início ${fmtHHMMSS(session.startedAt)}</span>
        </div>
        ${pdfBtn}
      </div>
    </header>

    <div class="ops-fs-progress">
      <div class="ops-fs-progress-bar" style="width:${pct}%"></div>
      <div class="ops-fs-progress-text">${done} de ${session.steps.length} ações &nbsp;·&nbsp; ${pct}%</div>
    </div>

    <div class="ops-fs-body">
      ${p.intro ? `<div class="ops-fs-intro">${fmtText(p.intro)}</div>` : ''}
      ${p.note ? `<div class="ops-fs-note"><strong>NOTA:</strong> ${fmtText(p.note)}</div>` : ''}

      <div class="ops-steps">
        ${session.steps.map(renderStepCard).join('')}
      </div>

      <div class="ops-events">
        <div class="ops-events-head">
          <div class="ops-events-title">${ICONS.pin}<span>Acontecimentos do evento</span></div>
          <small>cada anotação grava o horário automaticamente</small>
        </div>
        <div class="ops-events-list">
          ${session.events.length ? session.events.map(renderEventRow).join('') : '<div class="ops-events-empty">Nenhum acontecimento registrado ainda.</div>'}
        </div>
        <form class="ops-events-form" id="ops-event-form">
          <input type="text" id="ops-event-input" placeholder="Anotar um acontecimento (ex.: 'reserva de pista coordenada com TWR')" maxlength="240" autocomplete="off" />
          <button type="submit" class="ops-events-add">${ICONS.plus}<span>Registrar</span></button>
        </form>
      </div>
    </div>

    <footer class="ops-fs-footer">
      <button type="button" class="ops-footer-btn ops-footer-export" id="ops-export-btn">${ICONS.download}<span>Exportar registro</span></button>
      <button type="button" class="ops-footer-btn ops-footer-finish" id="ops-finish-btn">${ICONS.check}<span>Finalizar evento</span></button>
    </footer>`;

  el.querySelector('#ops-fs-back')?.addEventListener('click', () => openCatalogScreen());
  el.querySelector('#ops-cancel-btn')?.addEventListener('click', cancelSession);
  el.querySelector('#ops-clock-reset')?.addEventListener('click', resetClock);
  el.querySelector('#ops-operator-chip')?.addEventListener('click', showIdentifyModal);
  el.querySelector('.ops-fs-pdf')?.addEventListener('click', () => openPdfRef(pdf.file, pdf.page));
  el.querySelector('#ops-export-btn')?.addEventListener('click', exportSession);
  el.querySelector('#ops-finish-btn')?.addEventListener('click', finishSession);
  el.querySelector('#ops-event-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('ops-event-input');
    const txt = input?.value.trim();
    if (txt) { addEvent(txt); input.value = ''; }
  });
  el.querySelectorAll('[data-step-key]').forEach((card) => {
    const key = card.dataset.stepKey;
    card.querySelector('.ops-step-btn-done')?.addEventListener('click', () => toggleStep(key, 'done'));
    card.querySelector('.ops-step-btn-undo')?.addEventListener('click', () => toggleStep(key, 'pending'));
    card.querySelector('.ops-step-btn-na')?.addEventListener('click', () => promptNa(key));
    card.querySelectorAll('.ops-step-contact').forEach((cb) => {
      cb.addEventListener('click', () => recordContact(key, cb.dataset.contact));
    });
  });
  el.querySelectorAll('.ops-event-del').forEach((b) => {
    b.addEventListener('click', () => removeEvent(parseInt(b.dataset.idx, 10)));
  });
}

function renderStepCard(s) {
  const indent = s.depth * 22;
  const icon = iconForStep(s.text);
  const stamp = s.completedAt ? fmtHHMMSS(s.completedAt) : '';
  const isParent = s.hasChildren;
  const withContacts = hasContacts(s);

  const contactsRow = withContacts ? `
    <div class="ops-step-contacts">
      ${s.contacts.map((c) => {
        const rec = s.contactedWith.find((x) => x.tag === c);
        return `<button type="button" class="ops-step-contact ${rec ? 'recorded' : ''}" data-contact="${escapeAttr(c)}">
          ${ICONS.phone}<span>${escapeHTML(c)}</span>${rec ? `<small>${fmtHHMM(rec.when)}</small>` : ''}
        </button>`;
      }).join('')}
    </div>` : '';
  const naLine = s.status === 'na' && s.naReason ? `<div class="ops-step-na-reason">N/A: ${escapeHTML(s.naReason)}</div>` : '';

  let actions;
  if (isParent) {
    // Item pai: nunca tem botão Concluir manual; auto-conclui via filhos.
    const children = getChildren(s.key);
    const doneN = children.filter((c) => c.status !== 'pending').length;
    if (s.status === 'done') {
      actions = `<span class="ops-step-stamp ops-step-stamp-done">${ICONS.check}<span>${stamp}</span></span>
                 <small class="ops-step-progress">${doneN}/${children.length} subitens concluídos</small>`;
    } else {
      actions = `<small class="ops-step-progress">▾ ${doneN} de ${children.length} subitens · conclui-se automaticamente</small>`;
    }
  } else if (withContacts) {
    // Tem contatos: clicar nos chips já conclui — sem botão manual.
    if (s.status === 'done') {
      actions = `<span class="ops-step-stamp ops-step-stamp-done">${ICONS.check}<span>${stamp}</span></span>
                 <button type="button" class="ops-step-btn-undo">Desfazer</button>`;
    } else if (s.status === 'na') {
      actions = `<span class="ops-step-stamp ops-step-stamp-na">⊘ N/A</span>
                 <button type="button" class="ops-step-btn-undo">Desfazer</button>`;
    } else {
      const remaining = s.contacts.length - s.contactedWith.length;
      const msg = remaining === s.contacts.length
        ? `Clique nos contatos acima conforme acioná-los — conclui automaticamente`
        : `Faltam ${remaining} de ${s.contacts.length} contatos`;
      actions = `<small class="ops-step-progress">${msg}</small>
                 <button type="button" class="ops-step-btn-na">N/A</button>`;
    }
  } else {
    // Comum (sem filhos, sem contatos): botão Concluir manual
    if (s.status === 'done') {
      actions = `<span class="ops-step-stamp ops-step-stamp-done">${ICONS.check}<span>${stamp}</span></span>
                 <button type="button" class="ops-step-btn-undo">Desfazer</button>`;
    } else if (s.status === 'na') {
      actions = `<span class="ops-step-stamp ops-step-stamp-na">⊘ N/A</span>
                 <button type="button" class="ops-step-btn-undo">Desfazer</button>`;
    } else {
      actions = `<button type="button" class="ops-step-btn-done">${ICONS.check}<span>Concluir</span></button>
                 <button type="button" class="ops-step-btn-na">N/A</button>`;
    }
  }

  const klass = `ops-step ops-step-${s.status}${isParent ? ' ops-step-parent' : ''}${s.depth > 0 ? ' ops-step-child' : ''}`;
  return `
    <article class="${klass}" data-step-key="${escapeAttr(s.key)}" style="margin-left:${indent}px">
      <div class="ops-step-icon">${icon}</div>
      <div class="ops-step-body">
        <div class="ops-step-head">
          <span class="ops-step-num">${escapeHTML(String(s.n))}</span>
          <span class="ops-step-text">${fmtText(s.text)}</span>
        </div>
        ${contactsRow}
        ${naLine}
        <div class="ops-step-actions">${actions}</div>
      </div>
    </article>`;
}

function renderEventRow(ev, idx) {
  return `<div class="ops-event-row">
    <span class="ops-event-time">${fmtHHMMSS(ev.ts)}</span>
    <span class="ops-event-text">${escapeHTML(ev.text)}</span>
    <button type="button" class="ops-event-del" data-idx="${idx}" title="Remover">×</button>
  </div>`;
}

function toggleStep(key, newStatus) {
  const s = session.steps.find((x) => x.key === key);
  if (!s) return;
  s.status = newStatus;
  s.completedAt = newStatus === 'pending' ? null : Date.now();
  if (newStatus !== 'na') s.naReason = '';
  // Desfazer (pending) em passo com contatos: também limpa os chips,
  // pra evitar "todos chips clicados + status pendente" (estado inconsistente
  // que reapareceria como done na próxima auto-conclusão).
  if (newStatus === 'pending' && hasContacts(s)) {
    s.contactedWith = [];
  }
  updateParentStatus(s.parent);
  saveToStorage();
  refreshUI();
}

function promptNa(key) {
  const reason = window.prompt('Motivo para marcar como Não Aplicável (opcional):', '');
  if (reason === null) return;
  const s = session.steps.find((x) => x.key === key);
  if (!s) return;
  s.status = 'na';
  s.naReason = reason || '';
  s.completedAt = Date.now();
  updateParentStatus(s.parent);
  saveToStorage();
  refreshUI();
}

function recordContact(stepKey, tag) {
  const s = session.steps.find((x) => x.key === stepKey);
  if (!s) return;
  const existing = s.contactedWith.find((x) => x.tag === tag);
  if (existing) {
    s.contactedWith = s.contactedWith.filter((x) => x.tag !== tag);
  } else {
    s.contactedWith.push({ tag, when: Date.now() });
  }
  // Se todos os contatos foram clicados, auto-conclui
  if (s.status === 'pending' && allContactsDone(s)) {
    s.status = 'done';
    s.completedAt = Date.now();
  } else if (s.status === 'done' && hasContacts(s) && !allContactsDone(s)) {
    s.status = 'pending';
    s.completedAt = null;
  }
  updateParentStatus(s.parent);
  saveToStorage();
  refreshUI();
}

function hasContacts(s) { return s.contacts && s.contacts.length > 0; }
function allContactsDone(s) {
  if (!hasContacts(s)) return false;
  return s.contacts.every((c) => s.contactedWith.find((x) => x.tag === c));
}

function getChildren(parentKey) {
  return session.steps.filter((x) => x.parent === parentKey);
}

function updateParentStatus(parentKey) {
  if (!parentKey) return;
  const parent = session.steps.find((s) => s.key === parentKey);
  if (!parent || !parent.hasChildren) return;
  const children = getChildren(parentKey);
  if (children.length === 0) return;
  const allDone = children.every((c) => c.status !== 'pending');
  if (allDone && parent.status === 'pending') {
    parent.status = 'done';
    parent.completedAt = Date.now();
  } else if (!allDone && parent.status === 'done') {
    parent.status = 'pending';
    parent.completedAt = null;
  }
  updateParentStatus(parent.parent);
}

function addEvent(text) {
  session.events.push({ ts: Date.now(), text });
  saveToStorage();
  refreshUI();
}

function removeEvent(idx) {
  if (!session.events[idx]) return;
  if (!confirm('Remover este acontecimento?')) return;
  session.events.splice(idx, 1);
  saveToStorage();
  refreshUI();
}

function refreshUI() {
  const el = document.getElementById(FS_ID);
  if (el && session) renderSessionScreen(el);
}

// ============================================================
// Cronômetro
// ============================================================
function startTicker() {
  stopTicker();
  tickTimer = setInterval(updateClock, 1000);
  updateClock();
}
function stopTicker() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
function updateClock() {
  const el = document.getElementById('ops-clock-elapsed');
  if (!el || !session) return;
  const sec = Math.floor((Date.now() - session.startedAt) / 1000);
  el.textContent = fmtDuration(sec);
}

// ============================================================
// Finalizar e exportar
// ============================================================
function finishSession() {
  if (!session) return;
  const pending = session.steps.filter((s) => s.status === 'pending');
  showFinishModal(pending);
}

function showFinishModal(pending) {
  const old = document.getElementById('ops-finish-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'ops-finish-modal';
  modal.className = 'ops-identify-modal';
  const list = pending.length === 0
    ? '<p class="ops-finish-allgood">✓ Todas as ações foram concluídas ou marcadas como Não Aplicáveis.</p>'
    : `<div class="ops-finish-pending">
         <div class="ops-finish-warn">⚠ Ainda há <strong>${pending.length}</strong> ação${pending.length === 1 ? '' : 'ões'} pendente${pending.length === 1 ? '' : 's'}:</div>
         <ul class="ops-finish-pending-list">
           ${pending.slice(0, 8).map((s) => `<li><span class="ops-finish-num">${escapeHTML(String(s.n))}</span> ${escapeHTML(s.text.length > 110 ? s.text.slice(0, 107) + '…' : s.text)}</li>`).join('')}
           ${pending.length > 8 ? `<li class="ops-finish-more">… e mais ${pending.length - 8}</li>` : ''}
         </ul>
       </div>`;
  modal.innerHTML = `
    <div class="ops-identify-card ops-color-${session.protocol.color}">
      <div class="ops-identify-header">
        <div class="ops-identify-icon">${ICONS.check}</div>
        <div>
          <h3>Finalizar evento</h3>
          <p>O registro vai ser exportado em <strong>.txt</strong> e a sessão será encerrada para começar uma nova.</p>
        </div>
      </div>
      ${list}
      <div class="ops-identify-actions">
        <button type="button" class="ops-identify-skip" id="ops-finish-cancel">Voltar</button>
        <button type="button" class="ops-finish-export-now" id="ops-finish-export">Exportar sem finalizar</button>
        <button type="button" class="ops-identify-confirm" id="ops-finish-confirm">${pending.length ? 'Finalizar mesmo assim' : 'Finalizar e exportar'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#ops-finish-cancel').addEventListener('click', close);
  modal.querySelector('#ops-finish-export').addEventListener('click', () => {
    exportSession();
    close();
  });
  modal.querySelector('#ops-finish-confirm').addEventListener('click', () => {
    session.finishedAt = Date.now();
    saveToStorage();
    exportSession();
    session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    stopTicker();
    const btn = document.getElementById('btn-open-apoio');
    if (btn) btn.classList.remove('btn-apoio-active');
    close();
    openCatalogScreen();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

function cancelSession() {
  if (!session) return;
  if (!window.confirm('Cancelar este procedimento? Tudo que foi marcado será descartado e não dá pra desfazer.')) return;
  session = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  stopTicker();
  const btn = document.getElementById('btn-open-apoio');
  if (btn) btn.classList.remove('btn-apoio-active');
  openCatalogScreen();
}

function resetClock() {
  if (!session) return;
  if (!window.confirm('Reiniciar o cronômetro a partir de agora?\n\nOs horários já carimbados nas ações e nos acontecimentos serão mantidos (são horários reais UTC). Só o tempo "decorrido" zera.')) return;
  session.startedAt = Date.now();
  saveToStorage();
  updateClock();
  refreshUI();
}

function exportSession() {
  if (!session) return;
  const p = session.protocol;
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  ATC TOOLS — APOIO OPERACIONAL — REGISTRO DE EVENTO');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Protocolo:  ${p.title}`);
  if (p.subtitle) lines.push(`Subtítulo:  ${p.subtitle}`);
  lines.push(`Fonte:      ${p.source}`);
  if (p.version) lines.push(`Versão:     ${p.version}`);
  lines.push('');
  if (session.operator) lines.push(`Operador:   ${session.operator}`);
  if (session.position) lines.push(`Posição:    ${session.position}`);
  if (session.operator || session.position) lines.push('');
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
    if (s.naReason) lines.push(`${ind}    N/A: ${s.naReason}`);
  }
  lines.push('');
  if (session.events.length) {
    lines.push('─── ACONTECIMENTOS REGISTRADOS ─────────────────────────────');
    lines.push('');
    for (const ev of session.events) {
      lines.push(`  ${fmtHHMMSS(ev.ts)}  ${ev.text}`);
    }
    lines.push('');
  }
  const done = session.steps.filter((s) => s.status === 'done').length;
  const na = session.steps.filter((s) => s.status === 'na').length;
  const pending = session.steps.filter((s) => s.status === 'pending').length;
  lines.push('─── RESUMO ─────────────────────────────────────────────────');
  lines.push(`Concluídas:    ${done}`);
  lines.push(`Não aplicáveis: ${na}`);
  lines.push(`Pendentes:     ${pending}`);
  lines.push(`Anotações:     ${session.events.length}`);
  lines.push('');
  lines.push('Registro gerado pelo ATC Tools.');
  lines.push('═══════════════════════════════════════════════════════════');

  const txt = lines.join('\n');
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apoio-${p.id}-${fmtFileDate(session.startedAt)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// Persistência
// ============================================================
function saveToStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) {}
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.protocol && parsed.steps) {
      const fresh = getProtocol(parsed.protocol.id);
      if (fresh) {
        parsed.protocol = fresh;
        // Re-hidrata a estrutura dos passos com base no protocolo atual
        // (preserva status / horários / contatos por chave). Garante que
        // hasChildren e demais flags estruturais venham sempre da fonte.
        const stateByKey = {};
        for (const s of parsed.steps) stateByKey[s.key] = s;
        const freshSteps = flattenSteps(fresh.steps);
        for (const s of freshSteps) {
          const old = stateByKey[s.key];
          if (old) {
            s.status = old.status || 'pending';
            s.completedAt = old.completedAt || null;
            s.contactedWith = Array.isArray(old.contactedWith) ? old.contactedWith : [];
            s.naReason = old.naReason || '';
          }
        }
        parsed.steps = freshSteps;
      }
      if (!parsed.events) parsed.events = [];
      session = parsed;
    }
  } catch (e) {}
}

// ============================================================
// Helpers
// ============================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHHMM(ts) { const d = new Date(ts); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`; }
function fmtHHMMSS(ts) { const d = new Date(ts); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`; }
function fmtFullDate(ts) { const d = new Date(ts); return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${fmtHHMMSS(ts)}`; }
function fmtFileDate(ts) { const d = new Date(ts); return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`; }
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
// Formata texto do passo: escapa HTML e aplica **negrito** estilo Markdown.
// Mantém o texto integral do documento — só destaca visualmente.
function fmtText(s) {
  return escapeHTML(s).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
}
