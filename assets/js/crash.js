// Nexara9 — the "crash", hidden in the big NEXARA9 at the bottom of every page.
// Click or tap it: a red line sweeps down the screen and the site turns into a white error page. A red error
// appears, then real code types itself out line by line: a Haskell program that draws the Nexara9 "9" from the
// logo's own geometry. It "runs", the logo it draws appears, and the site comes back, all in about seven seconds.
// The program is real: /nexara9.hs runs on any computer with GHC (runghc nexara9.hs).
(() => {
  'use strict';
  const trigger = document.querySelector('.ft-egg');
  if (!trigger) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canBuzz = typeof navigator.vibrate === 'function';
  const buzz = (p) => { if (canBuzz) { try { navigator.vibrate(p); } catch (_) { /* not allowed */ } } };
  const T = { sweep: 420, error: 650, type: 3300, run: 300, show: 2000, out: 300 };  // about 7 s in all

  // the program and what it prints, fetched once from this site (the same files anyone can download)
  let files = null;
  const load = () => files || (files = Promise.all([
    fetch('/nexara9.hs', { credentials: 'omit' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
    fetch('/nexara9-logo.txt', { credentials: 'omit' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
  ]).catch((e) => { files = null; throw e; }));
  trigger.addEventListener('pointerenter', () => load().catch(() => {}), { once: true });
  trigger.addEventListener('pointerdown', () => load().catch(() => {}), { once: true });
  trigger.addEventListener('focus', () => load().catch(() => {}), { once: true });

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let running = false, told = false;

  async function start() {
    if (running) return;
    running = true;
    buzz([28, 40, 28]);
    const html = document.documentElement, overflow = html.style.overflow;
    const sx0 = window.scrollX, sy0 = window.scrollY;            // the page underneath must not move
    const holdScroll = () => { if (window.scrollX !== sx0 || window.scrollY !== sy0) window.scrollTo({ left: sx0, top: sy0, behavior: 'instant' }); };
    html.style.overflow = 'hidden';

    const root = el('div', 'crash'); root.setAttribute('aria-hidden', 'true');
    const wipe = el('div', 'crash-wipe');
    const line = el('div', 'crash-line');
    const page = el('div', 'crash-page');
    const err = el('div', 'crash-err');
    err.append(
      el('p', 'crash-err-t', 'Uncaught RenderError: logo.render is not a function'),
      el('p', 'crash-err-s', '    at Nexara9.paint (nexara9.me/assets/js/main.js:9:9)'),
      el('p', 'crash-err-s', '    at Footer.onClick (nexara9.me/index.html:2023:1)'),
      el('p', 'crash-err-s', '    recompiling the logo in Haskell…'),
    );
    const tab = el('p', 'crash-tab', 'nexara9.hs');
    const code = el('div', 'crash-code');
    const run = el('p', 'crash-run');
    const out = el('div', 'crash-out');
    page.append(err, tab, code, run);
    wipe.append(page);
    root.append(wipe, line, out);
    document.body.append(root);

    let src = '', logo = '';
    try { [src, logo] = await Promise.race([load(), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 2500))]); }
    catch (_) { src = '-- the code could not load just now'; logo = 'N E X A R A 9'; }

    const lines = src.replace(/\n+$/, '').split('\n');
    const rows = lines.map((l) => { const r = el('div', `crash-ln${/^\s*--/.test(l) ? ' crash-c' : ''}`); code.append(r); return r; });
    const total = lines.reduce((a, l) => a + l.length + 1, 0);
    out.append(el('pre', 'crash-logo', logo.replace(/\n+$/, '')), el('p', 'crash-cap', 'Haskell · nexara9.me/nexara9.hs'));

    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener('keydown', key);
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 1 : T.out, easing: 'ease-in', fill: 'forwards' });
      fade.onfinish = () => { root.remove(); html.style.overflow = overflow; holdScroll(); requestAnimationFrame(holdScroll); running = false; };
      if (!told) {                                        // for the curious: the whole program, ready to run
        told = true;
        try { console.log('%cNexara9%c  save this as nexara9.hs and run:  runghc nexara9.hs\n\n' + src, 'color:#d9b45a;font-weight:700', 'color:inherit'); } catch (_) { /* no console */ }
      }
    };
    const key = (e) => { if (e.key === 'Escape') end(); };
    window.addEventListener('keydown', key);
    root.addEventListener('click', end);

    if (reduce) {                                         // reduced motion: no sweep or typing, just the result
      wipe.style.clipPath = 'none'; line.remove();
      for (let i = 0; i < lines.length; i++) rows[i].textContent = lines[i] || ' ';
      run.textContent = '$ runghc nexara9.hs';
      root.classList.add('crash-done');
      setTimeout(end, 2600);
      return;
    }

    const t0 = performance.now();
    let typedLine = -1, ranAt = 0;
    function frame(now) {
      if (ended) return;
      const t = now - t0;
      holdScroll();
      // 1. the red line sweeps down; the page behind it turns into the error screen
      const p = Math.min(1, t / T.sweep), eased = 1 - Math.pow(1 - p, 3);
      wipe.style.clipPath = `inset(0 0 ${((1 - eased) * 100).toFixed(2)}% 0)`;
      line.style.transform = `translateY(${(eased * window.innerHeight).toFixed(1)}px)`;
      if (p >= 1 && !root.classList.contains('crash-swept')) { root.classList.add('crash-swept'); line.remove(); }
      // 2. the error, then the program typing itself
      const tt = t - T.sweep - T.error;
      if (tt > 0) {
        let n = Math.min(total, Math.round((tt / T.type) * total));
        for (let i = 0; i < lines.length && n >= 0; i++) {
          const len = lines[i].length + 1;
          if (i > typedLine) {
            rows[i].textContent = lines[i].slice(0, Math.max(0, n)) || ' ';
            rows[i].classList.add('on');
            if (n >= len) typedLine = i; else { rows[i].classList.add('caret'); break; }
          }
          rows[i].classList.remove('caret');
          n -= len;
        }
        code.scrollTop = code.scrollHeight;
        // 3. it "runs" and shows what it draws
        if (tt >= T.type && !ranAt) {
          ranAt = now;
          for (let i = 0; i < lines.length; i++) { rows[i].textContent = lines[i] || ' '; rows[i].classList.remove('caret'); }
          run.textContent = '$ runghc nexara9.hs';
          root.classList.add('crash-done');
          buzz(18);
        }
      }
      if (ranAt && now - ranAt > T.run + T.show) return end();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  trigger.addEventListener('click', start);
})();
