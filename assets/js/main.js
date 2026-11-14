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
    const tocLinks = Array.from(document.querySelectorAll('.toc a'));
    if (tocLinks.length && 'IntersectionObserver' in window) {
      const map = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            tocLinks.forEach((a) => a.classList.remove('active'));
            const a = map.get(en.target.id);
            if (a) a.classList.add('active');
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    }
  });
})();
