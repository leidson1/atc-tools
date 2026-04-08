import { invoke } from '@tauri-apps/api/core';

export async function searchAerodrome(query) {
  return invoke('search_aerodrome', { query });
}

export async function getAerodromeInfo(icao) {
  return invoke('get_aerodrome_info', { icao });
}

export async function listCachedAerodromes() {
  return invoke('list_cached_aerodromes');
}

export async function calculateRdl(aerodromeIcao, pointLat, pointLon) {
  return invoke('calculate_rdl', { aerodromeIcao, pointLat, pointLon });
}

export async function calculateRdlBatch(aerodromeIcao, points) {
  return invoke('calculate_rdl_batch', { aerodromeIcao, points });
}

export async function lookupPoint(identifier) {
  return invoke('lookup_point', { identifier });
}

export async function syncRotaer() {
  return invoke('sync_rotaer');
}

export async function getCacheStats() {
  return invoke('get_cache_stats');
}

export async function getApiConfig() {
  return invoke('get_api_config');
}

export async function saveApiConfig(apiKey, apiPass, defaultAerodrome) {
  return invoke('save_api_config', { apiKey, apiPass, defaultAerodrome });
}
