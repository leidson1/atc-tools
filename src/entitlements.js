// Portão único de acesso (entitlements).
//
// MVP: TUDO ABERTO. Nada é bloqueado. Mas todo recurso "premium" pergunta aqui
// antes de liberar, de modo que, no futuro, só ESTE arquivo muda para ativar o
// modelo de negócio — o resto do app não sabe que tiers existem.
//
// Plano de tiers (dormindo por enquanto):
//   anon  → MVP atual: tudo aberto, progresso só no localStorage.
//   edu   → professor/estudante, grátis COM cadastro (custeado/patrocinado).
//   pro   → individual pago: recursos de IA (cenário dinâmico, examinador, STT nuvem).
//   org   → órgão por assentos: pro + painel de efetivo + relatórios.
//
// Regra de custo que guia a fronteira free/pago:
//   'static'  → custo marginal ≈ zero (áudio pré-gerado, correção pelo parser) → sempre liberado.
//   'dynamic' → custo real por uso (IA/STT na nuvem) → tier pago no futuro.

export const TIER = Object.freeze({
  ANON: 'anon',
  EDU: 'edu',
  PRO: 'pro',
  ORG: 'org',
});

// No MVP todo mundo é anônimo. Quando houver login, esta função lê a sessão.
export function currentTier() {
  return TIER.ANON;
}

// MVP: libera tudo. Mantém a assinatura final para não precisar refatorar depois.
// item: { tier?: 'free'|'pro', cost?: 'static'|'dynamic' }
export function canAccess(/* item */) {
  // Futuro:
  //   if (item?.tier === 'pro' && currentTier() === TIER.ANON) return false;
  //   if (item?.cost === 'dynamic' && currentTier() === TIER.ANON) return false;
  return true;
}

// Conveniência para a UI sinalizar (sem bloquear) o que será pago.
export function isPremium(item) {
  return item?.tier === 'pro' || item?.cost === 'dynamic';
}

// Sinaliza que estamos na fase aberta — a UI usa para não mostrar cadeados ainda.
export function isOpenMvp() {
  return true;
}
