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
  // Kept clear by their real outline (not a box), so the symbols flow right up to the 9 and around every letter.
  const KEEP_SHAPES = '.hero-cta .btn, .home-foot .since, .site-nav, .menu-btn, .hdr-search';
  let W = 0, H = 0, dpr = 1, step = 20, size = 10, radius = 150, cols = 0, rows = 0;
  let cells = [];          // { x, y, ch, phase, e (light 0..1), dx, dy (push) }
  const lit = new Set();
  let px = -9999, py = -9999, raf = 0, last = 0, moving = 0;
  const MS = 0.5;          // the outline map is drawn at half size: plenty for symbols this small
  let mask = null, mw = 0, mh = 0;

  function drawMask() {
    mw = Math.max(1, Math.ceil(W * MS)); mh = Math.max(1, Math.ceil(H * MS));
    const m = document.createElement('canvas'); m.width = mw; m.height = mh;
    const g = m.getContext('2d', { willReadFrequently: true });
    if (!g) { mask = null; return; }
    g.fillStyle = g.strokeStyle = '#000';
    const pad = Math.max(3, size * 0.45);
    // the 9: its two strokes, traced at every height the gentle float takes it to
    const em = document.querySelector('.hero-emblem'), svg = em && em.querySelector('svg');
    if (em && svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
      const r = em.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = r.width / vb.width;
      const top = r.top + (r.height - vb.height * k) / 2;
      const grp = svg.querySelector('[stroke-width]');
      const sw = parseFloat(grp && grp.getAttribute('stroke-width')) || 8;
      const paths = Array.from(svg.querySelectorAll('path')).map((p) => new Path2D(p.getAttribute('d')));
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = sw + (2 * pad) / k;
      for (let dy = 0; dy >= -8; dy -= 2) {
        g.setTransform(k * MS, 0, 0, k * MS, r.left * MS, (top + dy) * MS);
        paths.forEach((p) => g.stroke(p));
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // NEXARA9: each letter on its own, so the gaps between letters stay open
    const word = document.querySelector('.hero-word');
    if (word) {
      const ls = parseFloat(getComputedStyle(word).letterSpacing) || 0;
      const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (let i = 0; i < n.length; i++) {
          if (!n.data[i].trim()) continue;
          range.setStart(n, i); range.setEnd(n, i + 1);
          for (const r of range.getClientRects()) {
            const w = Math.max(2, r.width - ls), h = r.height;
            g.fillRect((r.left - pad) * MS, (r.top + h * 0.08 - pad) * MS, (w + 2 * pad) * MS, (h * 0.84 + 2 * pad) * MS);
          }
        }
      }
    }
    // buttons, menu and "Since": their own rounded shapes
    for (const el of document.querySelectorAll(KEEP_SHAPES)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const rad = Math.min(r.height / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) + pad;
      g.beginPath();
      if (g.roundRect) g.roundRect((r.left - pad) * MS, (r.top - pad) * MS, (r.width + 2 * pad) * MS, (r.height + 2 * pad) * MS, rad * MS);
      else g.rect((r.left - pad) * MS, (r.top - pad) * MS, (r.width + 2 * pad) * MS, (r.height + 2 * pad) * MS);
      g.fill();
    }
    mask = g.getImageData(0, 0, mw, mh).data;
  }
  // is this point on (or right next to) the 9, a letter, a button…?
  const onShape = (x, y) => {
    if (!mask) return false;
    const i = Math.round(x * MS), j = Math.round(y * MS);
    if (i < 0 || j < 0 || i >= mw || j >= mh) return false;
    return mask[(j * mw + i) * 4 + 3] > 0;
  };
  // a symbol is a small box, so check its middle and its corners
  const covers = (x, y) => {
    const hx = size * 0.32, hy = size * 0.42;
    return onShape(x, y) || onShape(x - hx, y - hy) || onShape(x + hx, y - hy) || onShape(x - hx, y + hy) || onShape(x + hx, y + hy);
  };

  function layout() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.max(1, Math.min(W, H * 1.8) / 1500);         // bigger screens get proportionally bigger symbols
    step = Math.round((W < 520 ? 18 : 22) * scale);
    size = Math.round((W < 520 ? 9 : 10.5) * scale * 10) / 10;
    radius = Math.round((W < 520 ? 110 : 160) * scale);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMask();
    cols = Math.ceil(W / step) + 1; rows = Math.ceil(H / step) + 1;
    cells = new Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      // a little jitter so it reads as scattered symbols, not a grid
      const x = i * step + (Math.random() - 0.5) * step * 0.5 + step / 2;
      const y = j * step + (Math.random() - 0.5) * step * 0.5 + step / 2;
      cells[j * cols + i] = covers(x, y) ? null : { x, y, ch: SET[(Math.random() * SET.length) | 0], phase: Math.random() * 6.283, e: 0, dx: 0, dy: 0 };
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
      const gx = c.x + c.dx + fx, gy = c.y + c.dy + fy;
      if (covers(gx, gy)) continue;                       // pushed onto a letter or the 9: skip this frame
      ctx.fillStyle = `rgba(232, 200, 120, ${(c.e * 0.85).toFixed(3)})`;
      ctx.fillText(c.ch, gx, gy);
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
