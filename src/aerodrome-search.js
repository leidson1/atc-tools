import { searchAerodrome, getAerodromeInfo } from './api.js';

let debounceTimer = null;
let onSelectCallback = null;

export function initAerodromeSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const resultsContainer = document.getElementById(resultsId);
  onSelectCallback = onSelect;

  input.addEventListener('input', () => {
    const query = input.value.trim().toUpperCase();
    input.value = query;

    clearTimeout(debounceTimer);

    if (query.length < 2) {
      resultsContainer.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchAerodrome(query);
        showResults(resultsContainer, results, input);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const icao = input.value.trim().toUpperCase();
      if (icao.length === 4) {
        resultsContainer.classList.add('hidden');
        loadAerodrome(icao);
      }
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${resultsId}`)) {
      resultsContainer.classList.add('hidden');
    }
  });
}

function showResults(container, results, input) {
  if (results.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = results
    .map(
      (r) =>
        `<div class="search-result-item" data-icao="${r.icao_code}">
          <span class="icao">${r.icao_code}</span>
          <span class="name">${r.name} - ${r.city}/${r.state}</span>
        </div>`
    )
    .join('');

  container.classList.remove('hidden');

  // Click handlers
  container.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      const icao = item.dataset.icao;
      input.value = icao;
      container.classList.add('hidden');
      loadAerodrome(icao);
    });
  });
}

async function loadAerodrome(icao) {
  try {
    const info = await getAerodromeInfo(icao);
    if (onSelectCallback) {
      onSelectCallback(info);
    }
  } catch (err) {
    console.error('Failed to load aerodrome:', err);
    if (onSelectCallback) {
      onSelectCallback(null, err);
    }
  }
}

export { loadAerodrome };
