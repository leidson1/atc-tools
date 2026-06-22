// Registro de conteúdo do módulo Treinar.
// Conteúdo é DADO (JSON versionado), igual aos protocolos do Apoio: o motor é
// genérico e gera/corrige a partir daqui. Para adicionar lição: importe o JSON
// e registre em LESSONS.

import catalog from './catalog.json';
import atcEnInitialContact from './atc-en-initial-contact.json';

const LESSONS = {
  'atc-en-initial-contact': atcEnInitialContact,
};

export function getCatalog() {
  return catalog;
}

export function getTrack(id) {
  return catalog.tracks.find((t) => t.id === id) || null;
}

export function getLesson(id) {
  return LESSONS[id] || null;
}

export function getTrackLessons(trackId) {
  const tr = getTrack(trackId);
  if (!tr) return [];
  return (tr.lessons || []).map(getLesson).filter(Boolean);
}
