// Text-to-speech do módulo Treinar.
//
// MVP (custo 'static'): usa o speechSynthesis do navegador — grátis, offline,
// sem chave de API. Qualidade varia por dispositivo, mas resolve o "ouça e coteje".
//
// Futuro (custo 'dynamic', tier Pro): trocar a implementação de speak() por
// áudio pré-gerado (OpenAI TTS) servido como arquivo estático e cacheado.
// A interface — speak()/stopSpeak()/ttsAvailable() — fica igual, então nada
// no resto do módulo precisa mudar.

let enVoice = null;
let ptVoice = null;

function refreshVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices() || [];
  enVoice =
    voices.find((v) => /^en[-_]US/i.test(v.lang)) ||
    voices.find((v) => /^en[-_]GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null;
  ptVoice =
    voices.find((v) => /^pt[-_]BR/i.test(v.lang)) ||
    voices.find((v) => /^pt/i.test(v.lang)) ||
    null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

export function ttsAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text, { lang = 'en', rate = 0.95 } = {}) {
  return new Promise((resolve) => {
    if (!ttsAvailable() || !text) return resolve(false);
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
      u.rate = rate;
      u.pitch = 1;
      const v = lang === 'pt' ? ptVoice : enVoice;
      if (v) u.voice = v;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
    } catch (e) {
      resolve(false);
    }
  });
}

export function stopSpeak() {
  if (!ttsAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    /* noop */
  }
}
