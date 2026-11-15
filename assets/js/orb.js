// Nexara9 — the AI Orb, inside the code viewer only.
// Laptop: over the code the cursor becomes a small glowing orb. Click a line (Shift-click or drag for several)
// and the orb offers Explain · Debug · Optimise · Ask. Phone: a floating orb in the corner; tap a line (tap a
// second line for a range), then tap the orb. Answers come from the Nexara9 AI Worker, which reads the same
// file from this website. The orb only answers: it cannot change the website, the code or anything else.
(() => {
  'use strict';
  const AI = document.querySelector('meta[name="n9-ai"]')?.content;
  if (!AI) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cache = new Map();
  const ACTIONS = [
    ['explain', 'Explain', '<path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zM8 17h4"/>'],
    ['debug', 'Debug', '<path d="M7 6.5a3 3 0 0 1 6 0M6 9h8v3a4 4 0 0 1-8 0zM3 10h3M14 10h3M4 15l2-1M16 15l-2-1M10 9v7"/>'],
    ['optimise', 'Optimise', '<path d="M11 2 4 11h5l-1 7 7-9h-5z"/>'],
    ['ask', 'Ask', '<path d="M4 5h12v8H9l-4 3v-3H4z"/>'],
  ];
  const svg = (p) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // A small, safe markdown: paragraphs, "- " lists, "1. " lists, **bold**, `code`, ``` blocks ```.
  function md(text) {
    const out = []; const lines = String(text).replace(/\r/g, '').split('\n');
    let list = null, para = [];
    const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const fence = l.match(/^\s*```(\w+)?\s*$/);
      if (fence) {
        flushPara(); flushList();
        const buf = []; i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const ul = l.match(/^\s*[-*•]\s+(.*)$/), ol = l.match(/^\s*\d+[.)]\s+(.*)$/), h = l.match(/^\s*#{1,4}\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
      } else if (h) { flushPara(); flushList(); out.push(`<p><strong>${inline(h[1])}</strong></p>`); }
      else if (!l.trim()) { flushPara(); flushList(); }
      else { flushList(); para.push(l.trim()); }
    }
    flushPara(); flushList();
    return out.join('');
  }

  let ctx = null;          // { btn, panel, body, code, project }
  let sel = null;          // { from, to } (1-based line numbers)
  let ui = null;
  let pointer = { x: 0, y: 0, tx: 0, ty: 0, on: false, raf: 0 };
  let hoverTimer = 0;

  function build(panel) {
    const orb = document.createElement('div'); orb.className = 'orb-cursor'; orb.setAttribute('aria-hidden', 'true');
    orb.innerHTML = '<span class="orb-ball"></span><span class="orb-tip" hidden></span>';
    const fab = document.createElement('button'); fab.type = 'button'; fab.className = 'orb-fab';
    fab.setAttribute('aria-label', 'Ask the AI Orb about this code'); fab.setAttribute('aria-haspopup', 'menu');
    fab.innerHTML = '<span class="orb-ball"></span><span class="orb-badge" hidden></span>';
    const menu = document.createElement('div'); menu.className = 'orb-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<p class="orb-menu-h"></p><div class="orb-menu-b">${ACTIONS.map(([k, label, p]) => `<button type="button" role="menuitem" data-act="${k}">${svg(p)}<span>${label}</span></button>`).join('')}</div>`;
    const card = document.createElement('section'); card.className = 'orb-card'; card.hidden = true; card.setAttribute('aria-live', 'polite'); card.setAttribute('aria-label', 'AI Orb answer');
    card.innerHTML = `<header class="orb-card-h"><span class="orb-ball sm" aria-hidden="true"></span><div><p class="orb-card-k">AI Orb<span class="ai-beta">Beta</span></p><p class="orb-card-t"></p></div><button type="button" class="orb-x" aria-label="Close the answer">${svg('<path d="M5 5l10 10M15 5L5 15"/>')}</button></header>
      <div class="orb-card-b"></div>
      <form class="orb-ask"><input type="text" maxlength="300" placeholder="Ask about this code…" aria-label="Ask the AI Orb about this code" enterkeyhint="send"><button type="submit" aria-label="Send">${svg('<path d="M4 10h12M11 5l5 5-5 5"/>')}</button></form>
      <p class="orb-card-f"></p>`;
    panel.append(fab, menu, card);
    document.body.append(orb);

    fab.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? openMenu(fab.getBoundingClientRect(), true) : closeMenu(); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      closeMenu();
      if (b.dataset.act === 'ask') { openCard('Ask about ' + rangeLabel()); card.querySelector('.orb-card-b').innerHTML = `<p class="orb-hint">Type your question below. The Orb will answer about ${rangeLabel()}.</p>`; card.querySelector('.orb-ask input').focus(); }
      else run(b.dataset.act);
    });
    const refocus = () => ctx && ctx.panel.focus({ preventScroll: true });   // keep Esc and Tab inside the code window
    card.querySelector('.orb-x').addEventListener('click', () => { card.hidden = true; refocus(); });
    card.querySelector('.orb-ask').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = card.querySelector('.orb-ask input');
      const q = input.value.trim(); if (!q) return;
      input.value = ''; run('ask', q);
    });
    document.addEventListener('orb:escape', () => { if (!menu.hidden) closeMenu(); else card.hidden = true; refocus(); });
    // clicks on the code are handled on pointer-up (they pick lines); any other click closes the menu
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.orb-menu, .orb-fab, .cv-code')) closeMenu(); });
    return { orb, ball: orb.querySelector('.orb-ball'), tip: orb.querySelector('.orb-tip'), fab, badge: fab.querySelector('.orb-badge'), menu, card };
  }

  // ------------------------------------------------------------------ choosing lines
  const lines = () => (ctx ? ctx.code.children : []);
  const lineOf = (el) => { const ln = el && el.closest && el.closest('.ln'); if (!ln || !ctx || !ctx.code.contains(ln)) return 0; return Array.prototype.indexOf.call(ctx.code.children, ln) + 1; };
  function paint() {
    const ls = lines();
    for (let i = 0; i < ls.length; i++) ls[i].classList.toggle('sel', !!sel && i + 1 >= sel.from && i + 1 <= sel.to);
    if (ui) { ui.badge.hidden = !sel; ui.badge.textContent = sel ? (sel.from === sel.to ? `L${sel.from}` : `${sel.from}–${sel.to}`) : ''; }
  }
  const rangeLabel = () => (!sel ? 'this file' : sel.from === sel.to ? `line ${sel.from}` : `lines ${sel.from}–${sel.to}`);
  function setSel(a, b) { if (!a) { sel = null; paint(); return; } sel = { from: Math.min(a, b || a), to: Math.max(a, b || a) }; paint(); }

  function openMenu(rect, fromFab) {
    ui.menu.querySelector('.orb-menu-h').textContent = `Ask the Orb about ${rangeLabel()}`;
    ui.menu.hidden = false;
    const pr = ctx.panel.getBoundingClientRect(), mw = ui.menu.offsetWidth, mh = ui.menu.offsetHeight;
    let left, top;
    if (fromFab) { left = rect.right - pr.left - mw; top = rect.top - pr.top - mh - 10; }
    else { left = rect.x - pr.left + 18; top = rect.y - pr.top + 14; if (top + mh > pr.height - 10) top = rect.y - pr.top - mh - 14; }
    ui.menu.style.left = `${Math.max(8, Math.min(left, pr.width - mw - 8))}px`;
    ui.menu.style.top = `${Math.max(8, Math.min(top, pr.height - mh - 8))}px`;
    if (!reduce) ui.menu.animate([{ opacity: 0, transform: 'translateY(6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    ui.menu.querySelector('button').focus({ preventScroll: true });
  }
  function closeMenu() { if (ui) ui.menu.hidden = true; }

  // ------------------------------------------------------------------ asking
  function openCard(title) {
    ui.card.hidden = false;
    ui.card.querySelector('.orb-card-t').textContent = title;
    if (!reduce) ui.card.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  async function run(action, question = '') {
    const label = { explain: 'Explaining', debug: 'Checking for bugs in', optimise: 'Improving', ask: 'Answering about' }[action];
    openCard(`${label} ${rangeLabel()}`);
    const bodyEl = ui.card.querySelector('.orb-card-b'), foot = ui.card.querySelector('.orb-card-f');
    bodyEl.innerHTML = `${question ? `<p class="orb-q">${esc(question)}</p>` : ''}<div class="orb-thinking"><span></span><span></span><span></span> Thinking…</div>`;
    foot.textContent = '';
    const total = ctx.code.children.length;
    const payload = { file: ctx.btn.dataset.code, from: sel ? sel.from : 1, to: sel ? sel.to : total, action, question, project: ctx.project, path: ctx.btn.dataset.path, lang: ctx.btn.dataset.lang };
    const key = JSON.stringify(payload);
    const forFile = ctx.btn.dataset.code;
    try {
      let data = cache.get(key);
      if (!data) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
        const res = await fetch(`${AI}/v1/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: ctl.signal, credentials: 'omit' });
        clearTimeout(t);
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.answer) throw new Error(data.error || 'The AI could not answer right now.');
        cache.set(key, data);
      }
      if (!ctx || ctx.btn.dataset.code !== forFile) return;
      bodyEl.innerHTML = (question ? `<p class="orb-q">${esc(question)}</p>` : '') + md(data.answer);
      foot.innerHTML = 'Nexara9 AI<span class="ai-beta">Beta</span>';
    } catch (e) {
      if (!ctx || ctx.btn.dataset.code !== forFile) return;
      bodyEl.innerHTML = `<p class="orb-err">${esc(e.name === 'AbortError' ? 'The AI took too long. Please try again.' : (e.message || 'The AI could not answer right now.'))}</p>`;
    }
  }

  // ------------------------------------------------------------------ the cursor orb (laptops)
  function follow() {
    pointer.raf = 0;
    const k = reduce ? 1 : 0.35;
    pointer.x += (pointer.tx - pointer.x) * k; pointer.y += (pointer.ty - pointer.y) * k;
    ui.orb.style.transform = `translate(${pointer.x.toFixed(1)}px, ${pointer.y.toFixed(1)}px)`;
    if (Math.abs(pointer.tx - pointer.x) > 0.3 || Math.abs(pointer.ty - pointer.y) > 0.3) pointer.raf = requestAnimationFrame(follow);
  }
  function onMove(e) {
    if (!fine() || !ui) return;
    pointer.tx = e.clientX; pointer.ty = e.clientY;
    if (!pointer.on) { pointer.on = true; pointer.x = e.clientX; pointer.y = e.clientY; ui.orb.classList.add('on'); }
    if (!pointer.raf) pointer.raf = requestAnimationFrame(follow);
    // after a short pause on a line, the orb suggests what it can do
    clearTimeout(hoverTimer); ui.tip.hidden = true;
    const n = lineOf(e.target);
    if (n && ui.menu.hidden) hoverTimer = setTimeout(() => { ui.tip.textContent = sel ? `Click: ask about ${rangeLabel()}` : `Click to ask about line ${n}`; ui.tip.hidden = false; }, 700);
  }
  function onLeave() { if (!ui) return; pointer.on = false; ui.orb.classList.remove('on'); ui.tip.hidden = true; clearTimeout(hoverTimer); }

  let down = null;
  function onDown(e) { down = { x: e.clientX, y: e.clientY, n: lineOf(e.target) }; }
  function onUp(e) {
    if (!down || !ctx) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    const n = lineOf(e.target);
    const s = window.getSelection && window.getSelection();
    if (moved && s && !s.isCollapsed) {                         // dragged over text: use those lines
      const a = lineOf(s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement));
      const b = lineOf(s.focusNode && (s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement));
      if (a && b) { setSel(a, b); s.removeAllRanges(); if (fine()) openMenu({ x: e.clientX, y: e.clientY }, false); }
    } else if (!moved && !n) {
      closeMenu();
    } else if (!moved && n) {
      if (fine()) {
        if (e.shiftKey && sel) setSel(sel.from === sel.to ? sel.from : (n < sel.from ? sel.to : sel.from), n);
        else setSel(n, n);
        if (s) s.removeAllRanges();                              // Shift-click also selects text: the purple lines are enough
        openMenu({ x: e.clientX, y: e.clientY }, false);
      } else {
        // phones: first tap picks a line, a second tap on another line makes a range, tapping inside clears
        if (!sel) setSel(n, n);
        else if (sel.from === sel.to && n !== sel.from) setSel(sel.from, n);
        else if (n >= sel.from && n <= sel.to) setSel(0);
        else setSel(n, n);
        if (ui && !reduce && sel) ui.fab.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 320 });
      }
    }
    down = null;
  }

  function attach(d) {
    ctx = d;
    if (!ui || !ctx.panel.contains(ui.fab)) ui = build(ctx.panel);
    sel = null; paint(); closeMenu(); ui.card.hidden = true;
    ctx.body.classList.add('orb-on');
    ctx.panel.classList.add('has-orb');
    if (!ctx.body.dataset.orb) {
      ctx.body.dataset.orb = '1';
      ctx.body.addEventListener('pointermove', onMove, { passive: true });
      ctx.body.addEventListener('pointerleave', onLeave, { passive: true });
      ctx.body.addEventListener('pointerdown', onDown, { passive: true });
      ctx.body.addEventListener('pointerup', onUp);
      ctx.body.addEventListener('scroll', () => { if (ui) ui.tip.hidden = true; }, { passive: true });
    }
    if (!reduce) ui.fab.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 360, delay: 200, easing: 'cubic-bezier(.2,.8,.2,1.3)', fill: 'backwards' });
  }
  document.addEventListener('cv:loaded', (e) => attach(e.detail));
  document.addEventListener('cv:closed', () => { onLeave(); if (ui) { closeMenu(); ui.card.hidden = true; } ctx = null; sel = null; });
})();
