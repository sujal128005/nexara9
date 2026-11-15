// Nexara9 — code viewer for project pages.
// Click a file in the repository tree and its code opens in a dialog: a sheet that slides up on phones,
// a centred window on larger screens. The dim spreads out from the point you clicked.
// Files are plain text from this site; colours come from highlight.js (self-hosted, loaded on first use).
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const cache = new Map();
  const LANG_NAME = { typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', xml: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', json: 'JSON', yaml: 'YAML', ini: 'Config', markdown: 'Markdown', cpp: 'C++', c: 'C', bash: 'Shell', dos: 'Batch', powershell: 'PowerShell', nginx: 'Config', dockerfile: 'Dockerfile', makefile: 'Makefile', plaintext: 'Text' };
  let hljsLoad = null;
  const loadHljs = () => hljsLoad || (hljsLoad = new Promise((resolve) => {
    if (window.hljs) return resolve(window.hljs);
    const s = document.createElement('script');
    s.src = '/assets/js/vendor/highlight.min.js';
    s.onload = () => resolve(window.hljs || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }));

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const escapeHTML = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Highlighted HTML can open a <span> on one line and close it lines later. Split it into lines that are each
  // well-formed, so every line can be its own block with a number.
  function splitLines(html) {
    const out = []; const open = [];
    for (const raw of html.split('\n')) {
      let line = open.join('') + raw;
      for (const tag of raw.match(/<\/?span[^>]*>/g) || []) { if (tag[1] === '/') open.pop(); else open.push(tag); }
      line += '</span>'.repeat(open.length);
      out.push(line);
    }
    if (out.length > 1 && out[out.length - 1].replace(/<[^>]+>/g, '') === '') out.pop();
    return out;
  }

  let ui = null;
  function buildUI() {
    const root = el('div', 'cv'); root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'cv-title');
    const back = el('div', 'cv-back');
    const panel = el('div', 'cv-panel'); panel.tabIndex = -1;
    const head = el('header', 'cv-head');
    const titles = el('div', 'cv-titles');
    const kicker = el('p', 'cv-kicker');
    const title = el('h2', 'cv-title'); title.id = 'cv-title';
    const meta = el('p', 'cv-meta');
    titles.append(kicker, title, meta);
    const actions = el('div', 'cv-actions');
    const copy = el('button', 'cv-btn cv-copy'); copy.type = 'button';
    copy.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg><span>Copy</span>';
    const gh = el('a', 'cv-btn cv-gh'); gh.target = '_blank'; gh.rel = 'noopener noreferrer';
    gh.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span>GitHub</span>';
    const close = el('button', 'cv-btn cv-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
    actions.append(copy, gh, close);
    head.append(titles, actions);
    const note = el('p', 'cv-note', 'Secrets and personal details in this file are replaced with placeholders.'); note.hidden = true;
    const body = el('div', 'cv-body');
    const pre = el('pre', 'cv-pre');
    const code = el('code', 'cv-code hljs');
    pre.append(code); body.append(pre);
    const grab = el('span', 'cv-grab'); grab.setAttribute('aria-hidden', 'true');
    panel.append(grab, head, note, body);
    root.append(back, panel);
    document.body.append(root);

    back.addEventListener('click', hide);
    close.addEventListener('click', hide);
    copy.addEventListener('click', async () => {
      const label = copy.querySelector('span');
      try { await navigator.clipboard.writeText(ui.text || ''); label.textContent = 'Copied'; }
      catch (_) { label.textContent = 'Copy failed'; }
      setTimeout(() => { label.textContent = 'Copy'; }, 1600);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (document.querySelector('.orb-card:not([hidden]), .orb-menu:not([hidden])')) { document.dispatchEvent(new CustomEvent('orb:escape')); return; } hide(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((x) => !x.hidden);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return { root, back, panel, kicker, title, meta, note, gh, code, body, text: '', trigger: null, origin: null, overflow: '' };
  }

  const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

  function animateIn() {
    if (reduce) return;
    const { x, y } = ui.origin;
    const reach = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
    ui.back.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${reach}px at ${x}px ${y}px)` }], { duration: 520, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    ui.panel.animate(isPhone()
      ? [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]
      : [{ transform: 'translateY(16px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: isPhone() ? 380 : 300, easing: 'cubic-bezier(.2, .8, .2, 1)', delay: 60, fill: 'backwards' });
  }

  async function show(btn, x, y) {
    if (!ui) ui = buildUI();
    ui.trigger = btn; ui.origin = { x, y };
    const path = btn.dataset.path;
    const project = document.querySelector('.d-title')?.textContent?.trim() || '';
    ui.kicker.textContent = project;
    ui.title.textContent = path;
    const n = Number(btn.dataset.lines);
    ui.meta.textContent = `${/\.svg$/i.test(btn.dataset.path) ? 'SVG' : (LANG_NAME[btn.dataset.lang] || btn.dataset.lang)} · ${n.toLocaleString('en-IN')} ${n === 1 ? 'line' : 'lines'}`;
    ui.gh.href = btn.dataset.gh;
    ui.note.hidden = !btn.hasAttribute('data-masked');
    ui.code.className = 'cv-code hljs';
    ui.code.textContent = 'Loading…';
    ui.root.hidden = false;
    ui.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    animateIn();
    requestAnimationFrame(() => ui.panel.focus());

    try {
      let text = cache.get(btn.dataset.code);
      if (text == null) {
        const res = await fetch(btn.dataset.code, { credentials: 'omit' });
        if (!res.ok) throw new Error(String(res.status));
        text = await res.text();
        cache.set(btn.dataset.code, text);
      }
      if (ui.title.textContent !== path) return;           // another file was opened meanwhile
      ui.text = text;
      let html = escapeHTML(text);
      const lang = btn.dataset.lang;
      if (lang !== 'plaintext' && text.length < 160000) {
        const hljs = await loadHljs();
        if (hljs) {
          try { html = hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(text).value; }
          catch (_) { /* keep plain */ }
        }
      }
      if (ui.title.textContent !== path) return;
      ui.code.innerHTML = splitLines(html).map((l) => `<span class="ln">${l || ' '}</span>`).join('');
      ui.body.scrollTop = 0; ui.body.scrollLeft = 0;
      document.dispatchEvent(new CustomEvent('cv:loaded', { detail: { btn, panel: ui.panel, body: ui.body, code: ui.code, project } }));
    } catch (_) {
      ui.code.textContent = 'This file could not be loaded. Open it on GitHub instead.';
    }
  }

  function hide() {
    if (!ui || ui.root.hidden) return;
    const done = () => {
      ui.root.hidden = true;
      document.documentElement.style.overflow = ui.overflow;
      document.dispatchEvent(new CustomEvent('cv:closed'));
      ui.trigger?.focus?.({ preventScroll: true });
    };
    if (reduce) return done();
    const { x, y } = ui.origin;
    ui.back.animate([{ clipPath: `circle(${Math.hypot(innerWidth, innerHeight)}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }], { duration: 300, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    const a = ui.panel.animate(isPhone()
      ? [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }]
      : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(12px) scale(.98)', opacity: 0 }],
    { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    a.onfinish = () => { ui.panel.getAnimations().forEach((x) => x.cancel()); ui.back.getAnimations().forEach((x) => x.cancel()); done(); };
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.t-file[data-code]');
    if (!btn) return;
    e.preventDefault();
    const r = btn.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    show(btn, x, y);
  });
  // Arriving from search with ?file=path: open that file straight away.
  const want = new URLSearchParams(location.search).get('file');
  if (want) {
    const btn = Array.from(document.querySelectorAll('.t-file[data-code]')).find((b) => b.dataset.path === want);
    history.replaceState(null, '', location.pathname + location.hash);
    if (btn) {
      for (let p = btn.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      show(btn, r.left + 20, r.top + r.height / 2);
    }
  }
  // Warm up the colouring library the first time someone reaches the file tree.
  document.querySelectorAll('.tree-root').forEach((t) => t.addEventListener('pointerenter', loadHljs, { once: true }));
})();
