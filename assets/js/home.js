// Home page: a slow golden constellation that drifts and leans towards the pointer.
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orbit = document.querySelector('.orbit');

  let w = 0, h = 0, dpr = 1, stars = [], raf = 0;
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  function seed() {
    const area = w * h;
    const n = Math.round(Math.min(150, Math.max(55, area / 13000)));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.25 + Math.random() * 0.95,          // depth: parallax and size
      vx: (Math.random() - 0.5) * 0.06,
      vy: (Math.random() - 0.5) * 0.06,
      tw: Math.random() * Math.PI * 2,         // twinkle phase
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (reduce) draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const px = (pointer.x - 0.5) * 40;
    const py = (pointer.y - 0.5) * 40;
    const link = Math.min(150, Math.max(90, w / 10));
    const pos = stars.map((s) => {
      if (!reduce) {
        s.x += s.vx; s.y += s.vy;
        if (s.x < -20) s.x = w + 20; if (s.x > w + 20) s.x = -20;
        if (s.y < -20) s.y = h + 20; if (s.y > h + 20) s.y = -20;
      }
      return { x: s.x + px * s.z, y: s.y + py * s.z, s };
    });
    // lines
    ctx.lineWidth = 0.6;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const d = Math.hypot(dx, dy);
        if (d < link) {
          ctx.strokeStyle = `rgba(217,180,90,${(1 - d / link) * 0.16})`;
          ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke();
        }
      }
    }
    // stars
    for (const p of pos) {
      const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t / 900 + p.s.tw);
      const r = 0.5 + p.s.z * 1.3;
      ctx.fillStyle = `rgba(244,226,166,${0.25 + 0.55 * tw * p.s.z})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }

  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); if (!reduce) raf = requestAnimationFrame(loop); });
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX / w; pointer.ty = e.clientY / h;
    if (orbit && !reduce) {
      const rx = (pointer.ty - 0.5) * -10, ry = (pointer.tx - 0.5) * 12;
      orbit.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(loop);
  });

  resize();
  if (!reduce) raf = requestAnimationFrame(loop);
})();
