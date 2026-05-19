const CONFIG_KEY = 'atc_tools_config';

const DEFAULT_CONFIG = {
  default_aerodrome: 'SBPJ',
};

export function getConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(patch) {
  const merged = { ...getConfig(), ...patch };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  return merged;
}
