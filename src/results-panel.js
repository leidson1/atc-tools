const MAX_HISTORY = 50;
let history = [];

export function displayResult(result) {
  const resultSection = document.getElementById('rdl-result');
  resultSection.classList.remove('hidden');

  document.getElementById('rdl-value').textContent = result.formatted;
  document.getElementById('rdl-mag').textContent = `${result.radial_magnetic.toFixed(1)}°`;
  document.getElementById('rdl-true').textContent = `${result.radial_true.toFixed(1)}°`;
  document.getElementById('rdl-dist').textContent = `${result.distance_nm.toFixed(1)} NM`;
  document.getElementById('rdl-decl').textContent = `${result.magnetic_declination.toFixed(1)}°`;

  addToHistory(result);
}

function addToHistory(result) {
  history.unshift(result);
  if (history.length > MAX_HISTORY) {
    history.pop();
  }
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list');

  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty">Nenhum cálculo realizado</div>';
    return;
  }

  container.innerHTML = history
    .map(
      (r, i) =>
        `<div class="history-item" data-index="${i}">
          <span class="history-rdl">${r.aerodrome_icao} ${r.formatted}</span>
          <span class="history-meta">${formatTimestamp(r.timestamp)}</span>
        </div>`
    )
    .join('');

  // Click to re-display
  container.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      const result = history[idx];
      if (result && window.__onHistoryClick) {
        window.__onHistoryClick(result);
      }
    });
  });
}

function formatTimestamp(ts) {
  // Simple timestamp formatting
  const secs = parseInt(ts);
  if (isNaN(secs)) return '--:--';
  const date = new Date(secs * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function clearHistory() {
  history = [];
  renderHistory();
}

export function getHistory() {
  return history;
}

export function initCopyButton() {
  const btn = document.getElementById('btn-copy-rdl');
  btn.addEventListener('click', () => {
    const value = document.getElementById('rdl-value').textContent;
    const icao = history.length > 0 ? history[0].aerodrome_icao : '';
    const text = `${icao} RDL ${value}`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('Copiado: ' + text, 'success');
    }).catch(() => {
      showToast('Erro ao copiar', 'error');
    });
  });
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
