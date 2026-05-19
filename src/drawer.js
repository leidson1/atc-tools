const MOBILE_MAX = 768;

function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

function openDrawer() {
  document.getElementById('panel')?.classList.add('open');
  document.getElementById('panel-backdrop')?.classList.add('open');
}

function closeDrawer() {
  document.getElementById('panel')?.classList.remove('open');
  document.getElementById('panel-backdrop')?.classList.remove('open');
}

export function closeDrawerIfMobile() {
  if (isMobile()) closeDrawer();
}

export function initDrawer() {
  const btnOpen = document.getElementById('btn-toggle-panel');
  const btnClose = document.getElementById('btn-close-panel');
  const backdrop = document.getElementById('panel-backdrop');

  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile()) closeDrawer();
  });

  // Close drawer when switching from mobile to desktop
  window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawer();
  });
}
