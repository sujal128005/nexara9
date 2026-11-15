// Nexara9 — the code rain, hidden in the big NEXARA9 at the bottom of every page.
// Click or tap it: blocks of real code words (print, const, SELECT, fn, useState…) pour in from the top and pile
// up until the screen is full, the name flashes, and everything falls away in under a second. Real physics
// (Matter.js, self-hosted, loaded only on first use): longer words are longer, heavier blocks that push light
// ones aside; tilting or turning a phone changes which way is down and the pile slides and tumbles that way.
// Phones vibrate as blocks land, harder for heavy ones.
(() => {
  'use strict';
  const trigger = document.querySelector('.ft-egg');
  if (!trigger) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WORDS = [
    'if', 'fn', 'go', 'js', 'ts', 'py', 'let', 'var', 'def', 'for', 'int', 'new', 'try', 'npm', 'pip', 'git', 'SQL', 'API', 'map', 'nil',
    'else', 'self', 'this', 'void', 'enum', 'true', 'null', 'None', 'echo', 'sudo', 'from', 'JSON', 'HTML', 'Rust', 'func', 'main', 'bool', 'char', 'cout', 'git push',
    'const', 'print', 'while', 'class', 'async', 'await', 'match', 'yield', 'false', 'catch', 'throw', 'fetch', 'SELECT', 'WHERE', 'import', 'return', 'export', 'struct',
    'lambda', 'public', 'static', 'printf', 'filter', 'reduce', 'docker', 'python', 'kubectl', 'default', 'extends', 'package', 'useState', 'function', 'continue',
    'interface', 'useEffect', 'namespace', 'npm install', '#include', 'console.log', 'println!', 'std::vector', 'SELECT * FROM', 'git commit', 'async fn', '=>', '{ }', '</>', '[ ]',
  ];
  const canBuzz = typeof navigator.vibrate === 'function';
  const buzz = (p) => { if (canBuzz) { try { navigator.vibrate(p); } catch (_) { /* not allowed */ } } };
  let running = false;

  // ------------------------------------------------------------------ which way is down
  let gx = 0, gy = 1;                                     // on screen; laptops keep straight down
  let tiltSeen = false;                                   // has this device actually sent any tilt?
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    tiltSeen = true;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    const x = Math.cos(b) * Math.sin(g), y = Math.sin(b);  // gravity on the device's screen plane
    const a = (((screen.orientation && screen.orientation.angle) || window.orientation || 0) * Math.PI) / 180;
    const sx = x * Math.cos(a) + y * Math.sin(a), sy = -x * Math.sin(a) + y * Math.cos(a);
    const len = Math.hypot(sx, sy);
    if (len > 0.2) { gx = sx / len; gy = sy / len; }        // lying flat: keep the last direction
  }
  let tiltOn = false;
  async function listenTilt() {
    if (tiltOn || !('DeviceOrientationEvent' in window)) return;
    window.addEventListener('deviceorientation', onTilt);   // where tilt isn't allowed, no events come: it falls straight down
    tiltOn = true;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();   // iPhone and iPad ask first
    } catch (_) { /* not allowed: straight down */ }
  }

  // ------------------------------------------------------------------ the physics library, on first use
  let matterLoad = null;
  const loadMatter = () => matterLoad || (matterLoad = new Promise((resolve) => {
    if (window.Matter) return resolve(window.Matter);
    const s = document.createElement('script');
    s.src = '/assets/js/vendor/matter.min.js';
    s.onload = () => resolve(window.Matter || null);
    s.onerror = () => { matterLoad = null; resolve(null); };
    document.head.appendChild(s);
  }));
  trigger.addEventListener('pointerenter', () => loadMatter(), { once: true });
  trigger.addEventListener('focus', () => loadMatter(), { once: true });

  async function start() {
    if (running) return;
    running = true;
    if (reduce) return calm();
    listenTilt();                                           // must be asked inside the tap itself
    buzz(8);
    const M = await loadMatter();
    if (!M) return calm();
    run(M);
  }

  // ------------------------------------------------------------------ the show
  function run(M) {
    const { Engine, Bodies, Body, Composite, Events, Query, Sleeping } = M;
    let W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const target = W * H > 2e6 ? 190 : W * H > 6e5 ? 140 : 90;            // about how many blocks fill this screen: chunky blocks stack solidly
    const bh = Math.max(18, Math.min(72, Math.round(Math.sqrt((W * H * 0.9) / target / 4.3))));
    const font = Math.round(bh * 0.56), pad = Math.round(bh * 0.42), rad = Math.round(bh * 0.24);
    const family = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    const canvas = document.createElement('canvas');
    canvas.className = 'rain'; canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const html = document.documentElement, overflow = html.style.overflow;
    const sx0 = window.scrollX, sy0 = window.scrollY;            // the page must not scroll while pieces are loose
    const holdScroll = () => { if (window.scrollX !== sx0 || window.scrollY !== sy0) window.scrollTo({ left: sx0, top: sy0, behavior: 'instant' }); };
    html.style.overflow = 'hidden';

    // one picture per word, drawn once: light words pale, heavy words deep amber with a stronger edge
    const sprites = new Map();
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `600 ${font}px ${family}`;
    function sprite(word) {
      if (sprites.has(word)) return sprites.get(word);
      const w = Math.ceil(measure.measureText(word).width + pad * 2);
      const heavy = Math.min(1, Math.max(0, (word.length - 2) / 9));         // 0 light … 1 heavy
      const make = (flash) => {
        const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(bh * dpr);
        const x = c.getContext('2d'); x.scale(dpr, dpr);
        x.beginPath();
        if (x.roundRect) x.roundRect(0.75, 0.75, w - 1.5, bh - 1.5, rad); else x.rect(0.75, 0.75, w - 1.5, bh - 1.5);
        const lerp = (a, b) => Math.round(a + (b - a) * heavy);
        x.fillStyle = flash ? '#f2d27a' : `rgb(${lerp(22, 38)}, ${lerp(19, 29)}, ${lerp(14, 14)})`;
        x.fill();
        x.lineWidth = 1 + heavy * 1.4;
        x.strokeStyle = flash ? '#fff3c4' : `rgba(${lerp(246, 217)}, ${lerp(231, 160)}, ${lerp(176, 60)}, ${0.35 + heavy * 0.5})`;
        x.stroke();
        x.font = `600 ${font}px ${family}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = flash ? '#1a1408' : `rgb(${lerp(250, 232)}, ${lerp(236, 178)}, ${lerp(190, 70)})`;
        x.fillText(word, w / 2, bh / 2 + 0.5);
        return c;
      };
      const s = { w, img: make(false), flash: make(true), heavy };
      sprites.set(word, s);
      return s;
    }

    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.scale = 0.0034;
    let walls = [];
    function makeWalls() {
      if (walls.length) Composite.remove(engine.world, walls);
      const t = 600;
      walls = [
        Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, { isStatic: true }),
        Bodies.rectangle(W / 2, -t / 2, W + t * 2, t, { isStatic: true }),
        Bodies.rectangle(-t / 2, H / 2, t, H + t * 2, { isStatic: true }),
        Bodies.rectangle(W + t / 2, H / 2, t, H + t * 2, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
    }
    makeWalls();
    const blocks = [];

    // What is on screen becomes part of the scene. On phones it stays put (the words pile up around it) until the
    // phone is tilted, then it all comes loose; laptops (no tilt) let go by themselves just after the rain starts.
    // Afterwards every piece glides back to its place.
    let freeable = true;
    const parts = [], partBodies = [], opened = [];
    let freed = false;
    if (freeable) {
      const SEL = '.site-header .brand, .site-header .hdr-link, .site-header .theme-toggle, .dock-in > *, main h1, main h2, main h3, main p, main a.btn, main .pager-link, main img, main .chip, main .sort, main .t-row, main summary, main .tier, main .st-row, main .qa, main .person, main dl > div, main .live, main .venture, main .jump a, main .fdr-photo, footer .kicker, footer .ft-title, footer .btn, footer .brand, footer .ft-nav a, footer .ft-mark, footer .ft-bottom span';
      const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
      let els = Array.from(document.querySelectorAll(SEL)).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 6 && r.height > 6 && r.bottom > 0 && r.right > 0 && r.top < H && r.left < W && getComputedStyle(el).visibility !== 'hidden';
      });
      els = els.filter((el) => !els.some((o) => o !== el && o.contains(el)));          // whole pieces, not their insides
      els.sort((a, b) => area(b) - area(a));
      for (const el of els.slice(0, 48)) {
        if (getComputedStyle(el).transform !== 'none') continue;
        const r = el.getBoundingClientRect();
        const w = Math.max(6, Math.min(r.width, W - 4) - 2), h = Math.max(6, Math.min(r.height, H * 0.6) - 2);
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const body = Bodies.rectangle(cx, cy, w, h, { density: 0.0011, friction: 0.4, frictionStatic: 0.6, restitution: 0.04, chamfer: { radius: Math.min(10, h / 3) } });
        Body.setStatic(body, true);                          // pinned for now; made as a normal body first so it keeps its real weight when let go
        Composite.add(engine.world, body);
        partBodies.push(body);
        parts.push({ el, body, cx, cy, saved: { transform: el.style.transform, transition: el.style.transition, transformOrigin: el.style.transformOrigin, willChange: el.style.willChange } });
      }
    }
    function freeParts() {
      if (freed || !parts.length) return;
      freed = true;
      for (const p of parts) {
        // let pieces move past the edges of their boxes while they are loose
        for (let a = p.el.parentElement; a && a !== document.body && a !== html; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && !opened.some((o) => o.el === a)) { opened.push({ el: a, overflow: a.style.overflow }); a.style.overflow = 'visible'; }
        }
        p.el.style.transition = 'none'; p.el.style.transformOrigin = '50% 50%'; p.el.style.willChange = 'transform';
        Body.setStatic(p.body, false);
        Sleeping.set(p.body, false);
      }
      buzz([22, 30, 18, 30, 12]);
    }
    function moveParts() {
      if (!freed) return;
      for (const p of parts) if (Number.isFinite(p.body.position.x) && Number.isFinite(p.body.angle)) p.el.style.transform = `translate(${(p.body.position.x - p.cx).toFixed(1)}px, ${(p.body.position.y - p.cy).toFixed(1)}px) rotate(${p.body.angle.toFixed(3)}rad)`;
    }
    function restoreParts() {
      if (!parts.length) return;
      const list = parts.splice(0);
      if (freed) {
        for (const p of list) p.el.style.transition = 'transform .8s cubic-bezier(.2, .8, .2, 1)';
        requestAnimationFrame(() => { for (const p of list) p.el.style.transform = p.saved.transform; });
      }
      const keep = setInterval(holdScroll, 16);
      setTimeout(() => {
        for (const p of list) Object.assign(p.el.style, p.saved);
        for (const o of opened.splice(0)) o.el.style.overflow = o.overflow;
        holdScroll(); clearInterval(keep);
      }, freed ? 850 : 0);
    }

    // new blocks appear along the "upper" edge (opposite to gravity), wherever there is room
    function spawn() {
      const word = WORDS[(Math.random() * WORDS.length) | 0];
      const s = sprite(word);
      const px = -gy, py = gx;
      const L = Math.abs(W * px) + Math.abs(H * py), R = (Math.abs(W * gx) + Math.abs(H * gy)) / 2;
      const u = (Math.random() - 0.5) * L, depth = Math.random() * bh * 3;
      const half = Math.max(s.w, bh) / 2 + 2;
      const x = Math.min(W - half, Math.max(half, W / 2 - gx * (R - half - depth) + px * u));
      const y = Math.min(H - half, Math.max(half, H / 2 - gy * (R - half - depth) + py * u));
      const box = { min: { x: x - s.w / 2 - 2, y: y - bh / 2 - 2 }, max: { x: x + s.w / 2 + 2, y: y + bh / 2 + 2 } };
      if (Query.region(blocks, box).length || (partBodies.length && Query.region(partBodies, box).length)) return false;
      const b = Bodies.rectangle(x, y, s.w, bh, {
        chamfer: { radius: rad }, density: 0.0009 * (0.55 + s.heavy * 1.6),
        friction: 0.3, frictionStatic: 0.55, frictionAir: 0.004, restitution: 0.06, angle: Math.atan2(gy, gx) - Math.PI / 2 + (Math.random() - 0.5) * 0.35,
      });
      b.n9 = s;
      Body.setVelocity(b, { x: gx * 13, y: gy * 13 });
      Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.06);
      Composite.add(engine.world, b); blocks.push(b);
      return true;
    }

    // phones: a small tap for each landing, stronger for heavier blocks
    let lastBuzz = 0;
    Events.on(engine, 'collisionStart', (ev) => {
      if (!canBuzz || phase !== 'fill') return;
      const now = performance.now();
      if (now - lastBuzz < 45) return;
      let best = 0;
      for (const p of ev.pairs) {
        const a = p.bodyA, c = p.bodyB;
        const rel = Math.hypot(a.velocity.x - c.velocity.x, a.velocity.y - c.velocity.y);
        const m = Math.min(a.isStatic ? Infinity : a.mass, c.isStatic ? Infinity : c.mass);
        best = Math.max(best, rel * (Number.isFinite(m) ? m : 1));
      }
      if (best > 3) { buzz(Math.round(Math.min(28, 4 + best * 0.7))); lastBuzz = now; }
    });

    let phase = 'fill', fullAt = 0, holdAt = 0, drainAt = 0, blockedFrames = 0, last = performance.now(), raf = 0, ga = Math.atan2(gy, gx);
    const ga0 = ga;                                           // the starting "down", to notice a real tilt
    const began = last;
    const per = Math.max(8, Math.round(target / 11));        // spawn tries per frame: full in about two seconds

    // how high the resting pile reaches, measured toward the "upper" edge (0 = bottom … 1 = top)
    function pileLevel() {
      const R = (Math.abs(W * gx) + Math.abs(H * gy)) / 2;
      let top = -Infinity;
      for (const b of blocks) {
        if (Math.hypot(b.velocity.x, b.velocity.y) > 2.2) continue;            // still falling
        top = Math.max(top, -((b.position.x - W / 2) * gx + (b.position.y - H / 2) * gy));
      }
      return top === -Infinity ? 0 : (top + R) / (2 * R);
    }
    function coverage() {
      let a = 0;
      for (const b of blocks) a += b.n9.w * bh;
      return a / (W * H);
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(50, now - last); last = now;
      // follow the tilt; wake the pile up when "down" changes
      engine.gravity.x = gx; engine.gravity.y = gy;
      const na = Math.atan2(gy, gx);
      if (Math.abs(Math.atan2(Math.sin(na - ga), Math.cos(na - ga))) > 0.12) { ga = na; for (const b of blocks) Sleeping.set(b, false); for (const b of partBodies) if (!b.isStatic) Sleeping.set(b, false); }
      if (freeable && !freed && phase !== 'drain' && Math.abs(Math.atan2(Math.sin(na - ga0), Math.cos(na - ga0))) > 0.3) freeParts();   // tilted: the page comes loose
      if (freeable && !freed && !tiltSeen && now - began > 700) freeParts();                                                           // no tilt here: it collapses by itself

      if (phase === 'fill') {
        let made = 0;
        for (let i = 0; i < per; i++) if (spawn()) made++;
        blockedFrames = made ? 0 : blockedFrames + 1;
        const R2 = (Math.abs(W * gx) + Math.abs(H * gy));
        if (pileLevel() > 1 - (2.4 * bh) / R2 || (blockedFrames > 10 && coverage() > 0.4) || now - began > 5000) {   // the pile reaches the top
          phase = 'full'; fullAt = now;
          buzz([45, 30, 25]);
        }
      } else if (phase === 'full' && now - fullAt > 420) {
        phase = 'hold'; holdAt = now;                        // stays full for a while; tilting still moves it
      } else if (phase === 'hold' && now - holdAt > 2500) {
        drain(now);
      }
      const steps = Math.min(4, Math.max(2, Math.ceil(dt / 12)));   // small steps keep tall piles from sinking; slow screens catch up
      for (let s = 0; s < steps; s++) Engine.update(engine, Math.min(dt / steps, 12));

      if (phase === 'drain') {
        for (let i = blocks.length - 1; i >= 0; i--) {
          const bb = blocks[i].bounds;
          if (bb.min.x > W || bb.max.x < 0 || bb.min.y > H || bb.max.y < 0) { Composite.remove(engine.world, blocks[i]); blocks.splice(i, 1); }
        }
        if (!blocks.length || now - drainAt > 950) return finish();
      }
      moveParts();
      holdScroll();
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    function drain(now) {
      if (phase === 'drain') return;
      phase = 'drain'; drainAt = now;
      Composite.remove(engine.world, walls); walls = [];
      engine.gravity.scale = 0.008;
      for (const b of blocks) { Sleeping.set(b, false); Body.setVelocity(b, { x: b.velocity.x + gx * 10, y: b.velocity.y + gy * 10 }); }
      for (const b of partBodies) if (!b.isStatic) { Sleeping.set(b, false); Body.setVelocity(b, { x: b.velocity.x + gx * 6, y: b.velocity.y + gy * 6 }); }
      buzz([14, 22, 12, 22, 10, 22, 8]);
    }

    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fill = phase === 'fill' ? Math.min(1, pileLevel() * 1.1) : 1;
      ctx.fillStyle = `rgba(10, 9, 7, ${(parts.length ? 0.12 + fill * 0.22 : 0.42 + fill * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const flashing = phase === 'full';
      for (const b of blocks) {
        const s = b.n9, c = Math.cos(b.angle) * dpr, sn = Math.sin(b.angle) * dpr;
        ctx.setTransform(c, sn, -sn, c, b.position.x * dpr, b.position.y * dpr);
        ctx.drawImage(flashing ? s.flash : s.img, -s.w / 2, -bh / 2, s.w, bh);
      }
      if (flashing) {                                       // the name, for a moment, over the full screen
        const p = Math.min(1, (now - fullAt) / 380);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const size = Math.min(W * 0.17, H * 0.22);
        ctx.font = `900 ${size}px ${getComputedStyle(trigger).fontFamily || 'system-ui, sans-serif'}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.sin(p * Math.PI);
        ctx.fillStyle = 'rgba(10, 9, 7, 0.82)';
        const tw = ctx.measureText('NEXARA9').width;
        ctx.fillRect(W / 2 - tw / 2 - size * 0.25, H / 2 - size * 0.62, tw + size * 0.5, size * 1.24);
        ctx.fillStyle = '#f2d27a';
        ctx.fillText('NEXARA9', W / 2, H / 2 + size * 0.04);
        ctx.globalAlpha = 1;
      }
    }

    // a tap or Esc while it runs skips straight to the end
    const skip = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; if (phase === 'fill') { phase = 'full'; fullAt = performance.now() - 300; } else if (phase === 'hold' || phase === 'full') drain(performance.now()); };
    canvas.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    // turning the screen: new walls in the new shape; blocks left outside fall away
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (phase !== 'drain') makeWalls();
      if (parts.length) { restoreParts(); for (const b of partBodies.splice(0)) Composite.remove(engine.world, b); freeable = false; }
      for (let i = blocks.length - 1; i >= 0; i--) { const p = blocks[i].position; if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) { Composite.remove(engine.world, blocks[i]); blocks.splice(i, 1); } else Sleeping.set(blocks[i], false); }
    };
    window.addEventListener('resize', resize);

    function finish() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('resize', resize);
      restoreParts();
      Engine.clear(engine);
      const a = canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
      a.onfinish = () => { canvas.remove(); html.style.overflow = overflow; holdScroll(); running = false; };
    }
    raf = requestAnimationFrame(frame);
  }

  // Reduced motion: a quiet gold glow of the name instead of the rain
  function calm() {
    const d = document.createElement('div'); d.className = 'rain-calm'; d.setAttribute('aria-hidden', 'true'); d.textContent = 'NEXARA9';
    document.body.appendChild(d);
    setTimeout(() => { d.remove(); running = false; }, 1400);
  }

  trigger.addEventListener('click', start);
})();
