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

// Home page: a hidden field of tiny code symbols (0 1 # @ { } < / > …) across the screen.
// It stays invisible until the pointer (or a finger) passes; symbols near it light up, drift away
// from it, float for a moment and fade back. The logo, the name, the buttons, the menu and
// "Since …" are kept clear. Draws only while something is lit, so an idle page costs nothing.
(() => {
  'use strict';
  const aura = document.querySelector('.aura');
  if (!aura) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'glyphs';
  canvas.setAttribute('aria-hidden', 'true');
  aura.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const SET = '0101010101101001#@{}<>/;=*+$&%_[]()';
  const KEEP_CLEAR = '.hero-emblem, .hero-word, .hero-cta, .home-foot .since, .site-nav, .menu-btn';
  let W = 0, H = 0, dpr = 1, step = 20, size = 10, radius = 150, cols = 0, rows = 0;
  let cells = [];          // { x, y, ch, phase, e (light 0..1), dx, dy (push) }
  const lit = new Set();
  let px = -9999, py = -9999, raf = 0, last = 0, moving = 0;

  function blocked() {
    const pad = Math.max(10, step * 0.7);
    return Array.from(document.querySelectorAll(KEEP_CLEAR)).map((n) => n.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => ({ l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad }));
  }

  function layout() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.max(1, Math.min(W, H * 1.8) / 1500);         // bigger screens get proportionally bigger symbols
    step = Math.round((W < 520 ? 18 : 22) * scale);
    size = Math.round((W < 520 ? 9 : 10.5) * scale * 10) / 10;
    radius = Math.round((W < 520 ? 110 : 160) * scale);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const keep = blocked();
    cols = Math.ceil(W / step) + 1; rows = Math.ceil(H / step) + 1;
    cells = new Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      // a little jitter so it reads as scattered symbols, not a grid
      const x = i * step + (Math.random() - 0.5) * step * 0.5 + step / 2;
      const y = j * step + (Math.random() - 0.5) * step * 0.5 + step / 2;
      const off = keep.some((k) => x > k.l && x < k.r && y > k.t && y < k.b);
      cells[j * cols + i] = off ? null : { x, y, ch: SET[(Math.random() * SET.length) | 0], phase: Math.random() * 6.283, e: 0, dx: 0, dy: 0 };
    }
    lit.clear();
    ctx.clearRect(0, 0, W, H);
  }

  function excite() {
    const r = radius, r2 = r * r;
    const i0 = Math.max(0, Math.floor((px - r) / step)), i1 = Math.min(cols - 1, Math.ceil((px + r) / step));
    const j0 = Math.max(0, Math.floor((py - r) / step)), j1 = Math.min(rows - 1, Math.ceil((py + r) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = cells[j * cols + i];
      if (!c) continue;
      const ddx = c.x - px, ddy = c.y - py, d2 = ddx * ddx + ddy * ddy;
      if (d2 > r2) continue;
      const k = 1 - Math.sqrt(d2) / r;                 // 1 at the pointer, 0 at the edge
      const want = k * k * (3 - 2 * k);                // smooth fall-off
      if (want > c.e) c.e = c.e + (want - c.e) * 0.5;
      if (!still) {                                    // nudge it away from the pointer
        const d = Math.sqrt(d2) || 1, push = want * step * 0.9;
        c.dx += ((ddx / d) * push - c.dx) * 0.25;
        c.dy += ((ddy / d) * push - c.dy) * 0.25;
      }
      if (Math.random() < 0.02 * want) c.ch = SET[(Math.random() * SET.length) | 0];
      lit.add(c);
    }
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(64, t - (last || t)); last = t;
    if (moving > 0) { excite(); moving -= dt; }
    ctx.clearRect(0, 0, W, H);
    ctx.font = `500 ${size}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fade = Math.pow(0.9985, dt);                 // fades out over about two seconds
    const spring = Math.pow(0.996, dt);
    for (const c of lit) {
      c.e *= fade;
      c.dx *= spring; c.dy *= spring;
      if (c.e < 0.02) { c.e = 0; c.dx = 0; c.dy = 0; lit.delete(c); continue; }
      const fx = still ? 0 : Math.sin(t / 900 + c.phase) * 2.2 * c.e;
      const fy = still ? 0 : Math.cos(t / 1100 + c.phase * 1.3) * 2.6 * c.e - (1 - c.e) * 3;
      ctx.fillStyle = `rgba(232, 200, 120, ${(c.e * 0.85).toFixed(3)})`;
      ctx.fillText(c.ch, c.x + c.dx + fx, c.y + c.dy + fy);
    }
    if (lit.size || moving > 0) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function at(x, y) {
    px = x; py = y; moving = 120;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => at(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => at(e.clientX, e.clientY), { passive: true });
  document.addEventListener('pointerleave', () => { moving = 0; });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 150); }, { passive: true });
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
