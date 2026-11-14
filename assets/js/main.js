// Nexara9 — shared behaviour. No third-party code, no network requests.
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  // Refuse to be framed by other sites (clickjacking protection for static hosting).
  try {
    if (window.top !== window.self) window.top.location.replace(window.self.location.href);
  } catch (_) {
    document.addEventListener('DOMContentLoaded', () => { document.body.textContent = ''; });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', () => {
    // Header border on scroll
    const header = document.querySelector('.site-header');
    const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Theme switch (inside pages)
    const tt = document.querySelector('.theme-toggle');
    if (tt) {
      const sync = () => tt.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'dark'));
      sync();
      tt.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('n9-theme', next); } catch (_) { /* storage blocked */ }
        sync();
      });
    }

    // Mobile menu
    const btn = document.querySelector('.menu-btn');
    const nav = document.getElementById('site-nav');
    if (btn && nav) {
      const set = (open) => { btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); };
      btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.site-header')) set(false); });
    }

    // Email links are assembled here so the address is not sitting in the HTML for scrapers.
    document.querySelectorAll('[data-mail-u]').forEach((a) => {
      const addr = `${a.dataset.mailU}@${a.dataset.mailD}`;
      const subject = a.dataset.mailS ? `?subject=${encodeURIComponent(a.dataset.mailS)}` : '';
      a.setAttribute('href', `mailto:${addr}${subject}`);
    });

    // Reveal on scroll
    const items = Array.from(document.querySelectorAll('.reveal'));
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        let n = 0;
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.style.setProperty('--d', `${Math.min(n++ * 0.07, 0.42)}s`);
          en.target.classList.add('in');
          io.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      items.forEach((el) => io.observe(el));
    }

    // Card spotlight
    document.querySelectorAll('a.card-body').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    // Project filters
    const chips = Array.from(document.querySelectorAll('.chip[data-filter]'));
    const cards = Array.from(document.querySelectorAll('.card-grid .card, .index .row'));
    const count = document.querySelector('.filter-count');
    const apply = (id) => {
      let shown = 0;
      cards.forEach((c) => {
        const ok = id === 'all' || (c.dataset.cats || '').split(' ').includes(id);
        c.hidden = !ok;
        if (ok) { shown++; c.classList.add('in'); }
      });
      chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.filter === id)));
      if (count) count.textContent = `${shown} project${shown === 1 ? '' : 's'}`;
    };
    if (chips.length) {
      chips.forEach((ch) => ch.addEventListener('click', () => apply(ch.dataset.filter)));
      apply('all');
    }

    // Project index: a preview that follows the cursor
    const index = document.querySelector('.index');
    if (index && window.matchMedia('(hover: hover)').matches) {
      // Preview pictures load only when a row is first hovered, so the page itself stays light.
      index.querySelectorAll('.row-main').forEach((row) => row.addEventListener('pointerenter', () => {
        const img = row.querySelector('.peek img[data-src]');
        if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
      }, { once: true }));
      let raf = 0, x = 0, y = 0;
      index.addEventListener('pointermove', (e) => {
        x = e.clientX + 28; y = e.clientY - 110;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const maxX = window.innerWidth - 320;
          index.style.setProperty('--px', `${Math.min(x, maxX)}px`);
          index.style.setProperty('--py', `${Math.max(12, y)}px`);
        });
      }, { passive: true });
    }

    // Liquid Projects | Ventures switch. Works both ways, navigates early so the page opens fast,
    // plays a short landing settle on the new page, and resets itself after the browser's Back button.
    document.querySelectorAll('.sw').forEach((sw) => {
      const thumb = sw.querySelector('.sw-thumb');
      const segs = Array.from(sw.querySelectorAll('.sw-seg'));
      if (!thumb || segs.length !== 2) return;
      const side = () => (sw.classList.contains('sw-l') ? 0 : sw.classList.contains('sw-r') ? 1 : -1);
      const geom = () => { const box = sw.getBoundingClientRect(); const pad = 3; const w = (box.width - pad * 2) / 2; return { w, x: (i) => pad + i * w }; };
      let anim = null;
      const reset = () => {
        if (anim) { anim.cancel(); anim = null; }
        sw.classList.remove('is-moving');
        const cur = side();
        segs.forEach((sg, k) => { if (k === cur) sg.setAttribute('aria-current', 'page'); else sg.removeAttribute('aria-current'); });
      };
      // Back/forward cache restores the page as it was left: put the switch back where it belongs.
      window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); });

      // Landing: if we just switched here, settle in like a drop arriving from the other side.
      try {
        const raw = sessionStorage.getItem('n9-sw');
        sessionStorage.removeItem('n9-sw');
        const info = raw && JSON.parse(raw);
        const cur = side();
        if (info && cur >= 0 && info.to === cur && Date.now() - info.t < 4000 && !reduce && thumb.animate) {
          const { w, x } = geom();
          const fromRight = info.from > cur;
          thumb.animate([
            { left: `${x(cur) + (fromRight ? 10 : -10)}px`, width: `${w - 10}px`, transform: 'scaleY(1.1)' },
            { left: `${x(cur) + (fromRight ? -3 : 3)}px`, width: `${w + 3}px`, transform: 'scaleY(.96)', offset: .6 },
            { left: `${x(cur)}px`, width: `${w}px`, transform: 'scaleY(1)' },
          ], { duration: 260, easing: 'cubic-bezier(.3, .7, .2, 1)' });
        }
      } catch (_) { /* storage blocked: no landing effect */ }

      segs.forEach((seg, to) => seg.addEventListener('click', (e) => {
        const from = side();
        if (to === from || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
        try { sessionStorage.setItem('n9-sw', JSON.stringify({ from, to, t: Date.now() })); } catch (_) { /* ignore */ }
        if (reduce || !thumb.animate) return;            // plain, instant navigation
        e.preventDefault();
        const { w, x } = geom();
        const frames = from === -1
          ? [
              { left: `${x(to) + w / 2 - 8}px`, width: '16px', transform: 'scaleY(.4)', opacity: 0 },
              { left: `${x(to)}px`, width: `${w}px`, transform: 'scaleY(1)', opacity: 1 },
            ]
          : [
              { left: `${x(from)}px`, width: `${w}px`, transform: 'scaleY(1)', opacity: 1 },
              { left: `${x(Math.min(from, to))}px`, width: `${w * 2}px`, transform: 'scaleY(.84)', opacity: 1, offset: .45 },
              { left: `${x(to) + (to > from ? 5 : -5)}px`, width: `${w - 5}px`, transform: 'scaleY(1.06)', opacity: 1, offset: .78 },
              { left: `${x(to)}px`, width: `${w}px`, transform: 'scaleY(1)', opacity: 1 },
            ];
        sw.classList.add('is-moving');
        segs.forEach((sg, k) => { if (k === to) sg.setAttribute('aria-current', 'page'); else sg.removeAttribute('aria-current'); });
        if (anim) anim.cancel();
        anim = thumb.animate(frames, { duration: 340, easing: 'cubic-bezier(.45, .05, .2, 1)', fill: 'forwards' });
        // Start loading the next page while the drop is still moving: no waiting on the animation.
        setTimeout(() => { window.location.href = seg.href; }, 150);
      }));
    });

    // Sort the project list by build order or complexity
    const sortBtns = Array.from(document.querySelectorAll('.sort-b'));
    const list = document.querySelector('.index');
    if (sortBtns.length && list) {
      sortBtns.forEach((btn) => btn.addEventListener('click', () => {
        const byCx = btn.dataset.sort === 'cx';
        const rows = Array.from(list.querySelectorAll(':scope > .row'));
        rows.sort((a, b) => byCx ? (b.dataset.cx - a.dataset.cx) || (a.dataset.order - b.dataset.order) : a.dataset.order - b.dataset.order);
        rows.forEach((r) => list.appendChild(r));
        sortBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
      }));
    }

    // Section toggles on the project list
    document.querySelectorAll('.r-toggle').forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
      });
    });

    // Dropdowns in the project bar
    const dds = Array.from(document.querySelectorAll('.dd-btn'));
    const closeAll = (except) => dds.forEach((b) => {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      const p = document.getElementById(b.getAttribute('aria-controls'));
      if (p) p.hidden = true;
    });
    dds.forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        closeAll(btn);
        btn.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
        if (open) { const cur = panel.querySelector('.active, [aria-current="page"]'); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
      });
      panel.addEventListener('click', (e) => { if (e.target.closest('a')) closeAll(); });
    });
    if (dds.length) {
      document.addEventListener('click', (e) => { if (!e.target.closest('.dd')) closeAll(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    }

    // Jumping to a folder in the repository walkthrough opens it
    const openRepo = (hash) => {
      if (!hash || !hash.startsWith('#repo-')) return;
      const li = document.getElementById(hash.slice(1));
      const det = li && li.querySelector(':scope > details');
      if (det) det.open = true;
      if (li) li.classList.add('flash');
      setTimeout(() => li && li.classList.remove('flash'), 1600);
    };
    document.querySelectorAll('a[data-repo]').forEach((a) => a.addEventListener('click', () => openRepo(a.getAttribute('href'))));
    openRepo(location.hash);

    // Steppers (accessible tabs)
    document.querySelectorAll('[data-stepper]').forEach((st) => {
      const tabs = Array.from(st.querySelectorAll('[role="tab"]'));
      const panels = Array.from(st.querySelectorAll('[role="tabpanel"]'));
      let cur = 0;
      const go = (i, focus) => {
        cur = (i + tabs.length) % tabs.length;
        tabs.forEach((t, k) => {
          const on = k === cur;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          t.classList.toggle('done', k < cur);
        });
        panels.forEach((p, k) => { if (k === cur) p.removeAttribute('data-inactive'); else p.setAttribute('data-inactive', ''); });
        const bar = st.querySelector('.step-progress span');
        if (bar) bar.style.width = `${((cur + 1) / tabs.length) * 100}%`;
        if (focus) tabs[cur].focus();
        tabs[cur].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      };
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => go(i));
        t.addEventListener('keydown', (e) => {
          const k = e.key;
          if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); go(cur + 1, true); }
          if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); go(cur - 1, true); }
          if (k === 'Home') { e.preventDefault(); go(0, true); }
          if (k === 'End') { e.preventDefault(); go(tabs.length - 1, true); }
        });
      });
      const bar0 = st.querySelector('.step-progress span');
      if (bar0) bar0.style.width = `${100 / tabs.length}%`;
      st.querySelectorAll('[data-step]').forEach((b) =>
        b.addEventListener('click', () => go(cur + Number(b.dataset.step))),
      );
    });

    // Table of contents: highlight the section in view
    const tocLinks = Array.from(document.querySelectorAll('.toc a, #dd-sec a[data-sec]'));
    if (tocLinks.length && 'IntersectionObserver' in window) {
      const map = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            tocLinks.forEach((a) => a.classList.remove('active'));
            const a = map.get(en.target.id);
            if (a) a.classList.add('active');
            const cur = document.querySelector('.pbar-cur');
            const dl = document.querySelector(`#dd-sec a[data-sec="${en.target.id}"]`);
            if (cur && dl) {
              document.querySelectorAll('#dd-sec a[data-sec]').forEach((x) => x.classList.remove('active'));
              dl.classList.add('active');
              cur.textContent = dl.dataset.short || dl.lastChild.textContent;
            }
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    }
  });
})();
