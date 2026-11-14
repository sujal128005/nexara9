// Home page: the centre light of the gold aura leans gently toward the pointer.
(() => {
  'use strict';
  const aura = document.querySelector('.aura-c');
  if (!aura || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = 0, x = 0, y = 0;
  window.addEventListener('pointermove', (e) => {
    x = (e.clientX / window.innerWidth - 0.5) * 18;
    y = (e.clientY / window.innerHeight - 0.5) * 14;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      aura.style.setProperty('--ax', `${x.toFixed(2)}vmax`);
      aura.style.setProperty('--ay', `${y.toFixed(2)}vmax`);
    });
  }, { passive: true });
})();
