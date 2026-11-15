// Nexara9 — site search.
// The search icon sits in the bottom bar (on the home page: in the top bar). Tapping it hides Projects and
// Ventures and turns the bar into a search box; closing it brings them back. Results come from
// /search-index.json, a small file built from the pages' own text, and are searched right here in the
// browser: nothing typed ever leaves the visitor's device. No AI: word links (payment → Khata, PayPal…),
// prefixes and small spelling mistakes are handled by plain rules below.
(() => {
  'use strict';
  const indexUrl = document.querySelector('meta[name="n9-search"]')?.content;
  const opener = document.querySelector('.dock-search, .hdr-search');
  if (!indexUrl || !opener) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON = opener.innerHTML;
  const X = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
  const GO = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>';

  // ------------------------------------------------------------------ words that mean the same here
  const LINKS = [
    ['payment', 'payments', 'pay', 'upi', 'checkout', 'razorpay', 'paypal', 'emi', 'loan', 'credit', 'khata', 'transaction'],
    ['money', 'finance', 'fintech', 'expense', 'expenses', 'budget', 'income', 'ledger', 'accounting', 'bank', 'banking'],
    ['trading', 'trade', 'crypto', 'bitcoin', 'btc', 'futures', 'binance', 'stock', 'stocks', 'market', 'orders'],
    ['drone', 'drones', 'uav', 'quadcopter', 'aerial', 'navyam'],
    ['car', 'cars', 'vehicle', 'self-driving', 'selfdriving', 'autonomous', 'navya'],
    ['plane', 'aeroplane', 'airplane', 'aircraft', 'flight', 'fly', 'flying', 'rc', 'udaan'],
    ['food', 'meal', 'meals', 'canteen', 'mess', 'hungry', 'eat', 'lunch', 'dinner', 'breakfast', 'moodie'],
    ['study', 'student', 'students', 'college', 'school', 'exam', 'exams', 'syllabus', 'notes', 'education', 'nexgen'],
    ['ai', 'ml', 'llm', 'gpt', 'claude', 'model', 'models', 'agent', 'agents', 'machine learning', 'artificial intelligence', 'neural'],
    ['delivery', 'deliveries', 'logistics', 'dispatch', 'courier', 'parcel', 'flexdrop'],
    ['image', 'images', 'photo', 'photos', 'picture', 'forgery', 'fake', 'deepfake', 'tamper', 'tampered', 'pixelproof'],
    ['home', 'house', 'plumber', 'plumbing', 'electrician', 'electrical', 'repair', 'technician', 'technicians', 'cleaning', 'housefi'],
    ['security', 'secure', 'fraud', 'bot', 'bots', 'verification', 'verify', 'identity', 'stealth'],
    ['shopping', 'shop', 'ecommerce', 'e-commerce', 'store', 'purchase', 'purchasing', 'buy', 'limen'],
    ['news', 'economy', 'economic', 'policy', 'arthanetra'],
    ['founder', 'founders', 'team', 'ceo', 'owner', 'who'],
    ['contact', 'email', 'mail', 'hire', 'reach', 'message'],
    ['fund', 'funding', 'invest', 'investor', 'investors', 'investment', 'pre-seed', 'seed', 'raise', 'raising'],
    ['award', 'awards', 'winner', 'won', 'win', 'hackathon', 'finalist', 'prize'],
    ['code', 'source', 'repo', 'repository', 'github', 'file', 'files'],
    ['demo', 'live', 'try', 'website', 'deployed'],
    ['python', 'py'], ['javascript', 'js', 'node'], ['typescript', 'ts'], ['html', 'web', 'website'],
  ];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');
  const words = (s) => norm(s).split(/[^a-z0-9+#]+/).filter(Boolean);
  const linked = new Map();
  for (const group of LINKS) for (const w of group) for (const x of words(w)) {
    if (!linked.has(x)) linked.set(x, new Set());
    group.forEach((g) => words(g).forEach((y) => y !== x && linked.get(x).add(y)));
  }
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it', 'with', 'by', 'at', 'what', 'how', 'show', 'me', 'find', 'about', 'your', 'you', 'i', 'my', 'do', 'does', 'any', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'did', 'are', 'was', 'were', 'there', 'can', 'could', 'should', 'would', 'tell', 'explain', 'list', 'give', 'have', 'has', 'had', 'use', 'uses', 'used', 'using', 'handle', 'handles', 'deal', 'deals', 'work', 'works', 'project', 'projects', 'nexara9', 'that', 'this', 'these', 'those', 'be', 'all', 'some', 'most', 'please']);

  function lev(a, b, max) {                     // edit distance, stops early past `max`
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // ------------------------------------------------------------------ the index
  let data = null, vocab = null, loading = null;
  const load = () => loading || (loading = fetch(indexUrl, { credentials: 'omit' })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((rows) => {
      vocab = new Set();
      data = rows.map(([g, t, sub, u, x, k], id) => {
        const tw = words(t), sw = words(`${sub} ${k}`), xw = words(x);
        [...tw, ...sw, ...xw].forEach((w) => w.length > 2 && vocab.add(w));
        return { id, g, t, sub, u, x, tw, sw, xw: new Set(xw), xa: xw, tn: norm(t) };
      });
      return data;
    })
    .catch((e) => { loading = null; throw e; }));

  // Every typed word becomes a few variants: itself, words that mean the same here, and close spellings.
  function variants(q) {
    const out = new Map([[q, 1]]);
    for (const y of linked.get(q) || []) out.set(y, Math.max(out.get(y) || 0, 0.75));
    if (q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      for (const w of vocab) if (!out.has(w) && w[0] === q[0] && lev(q, w, max) <= max) out.set(w, 0.6);
      if (q.endsWith('s') && q.length > 4) out.set(q.slice(0, -1), 0.9);
    }
    return out;
  }
  function scoreTerm(e, vs) {
    let best = 0;
    for (const [v, w] of vs) {
      let s = 0;
      if (e.tw.includes(v)) s = 10; else if (e.tw.some((x) => x.startsWith(v)) && v.length >= 2) s = 7; else if (v.length >= 3 && e.tn.includes(v)) s = 5;
      if (s < 6) { if (e.sw.includes(v)) s = Math.max(s, 6); else if (v.length >= 3 && e.sw.some((x) => x.startsWith(v))) s = Math.max(s, 4); }
      if (s < 3) { if (e.xw.has(v)) s = 3; else if (v.length >= 3 && e.xa.some((x) => x.startsWith(v))) s = 2; }
      best = Math.max(best, s * w);
    }
    return best;
  }
  function search(query) {
    let qs = words(query).filter((w) => !STOP.has(w));
    if (!qs.length) qs = words(query);
    if (!qs.length) return { list: [], marks: [] };
    const vsets = qs.map(variants);
    const scored = [];
    for (const e of data) {
      const parts = vsets.map((vs) => scoreTerm(e, vs));
      const hit = parts.filter((p) => p > 0).length;
      if (!hit) continue;
      let s = parts.reduce((a, b) => a + b, 0);
      if (hit === qs.length) s += 20;                          // every word found
      if (e.g === 'Pages' && parts.every((p) => p >= 10)) s += 8;
      if (e.g === 'Code') s *= 0.8;
      scored.push({ e, s, all: hit === qs.length });
    }
    const anyAll = scored.some((r) => r.all);
    const list = scored.filter((r) => !anyAll || r.all).sort((a, b) => b.s - a.s);
    // keep it readable: at most two entries per project, a few per group
    const per = new Map(), groups = new Map(), picked = [];
    const cap = { Pages: 3, Founders: 2, Ventures: 5, Projects: 8, Code: 5 };
    for (const r of list) {
      const key = r.e.g === 'Projects' ? r.e.t : r.e.id;
      if (r.e.g === 'Projects' && (per.get(key) || 0) >= 2) continue;
      if ((groups.get(r.e.g) || 0) >= cap[r.e.g]) continue;
      per.set(key, (per.get(key) || 0) + 1); groups.set(r.e.g, (groups.get(r.e.g) || 0) + 1);
      picked.push(r);
    }
    const marks = [...new Set(vsets.flatMap((vs) => [...vs.keys()]))].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
    return { list: picked, marks };
  }

  // ------------------------------------------------------------------ drawing results
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function highlight(text, marks) {
    if (!marks.length) return esc(text);
    const rx = new RegExp(`(^|[^\\p{L}\\p{N}])(${marks.map(reEsc).join('|')})`, 'giu');
    let out = '', last = 0, m;
    while ((m = rx.exec(text))) {
      const start = m.index + m[1].length;
      let end = start + m[2].length;
      while (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) end++;
      out += esc(text.slice(last, start)) + '<mark>' + esc(text.slice(start, end)) + '</mark>';
      last = end; rx.lastIndex = end;
    }
    return out + esc(text.slice(last));
  }
  function snippet(text, marks) {
    const low = norm(text);
    let at = -1;
    for (const w of marks) {
      const m = new RegExp(`(^|[^a-z0-9])${reEsc(w)}`).exec(low);
      if (m && (at < 0 || m.index < at)) at = m.index + m[1].length;
    }
    const len = innerWidth < 600 ? 120 : 170;
    if (at < 0 || at < 50) return text.length > len ? text.slice(0, text.lastIndexOf(' ', len) > 40 ? text.lastIndexOf(' ', len) : len) + '…' : text;
    let s = text.lastIndexOf(' ', at - 40); s = s < 0 ? 0 : s + 1;
    let e = text.indexOf(' ', s + len); e = e < 0 ? text.length : e;
    return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
  }

  // ------------------------------------------------------------------ the search bar
  const home = opener.classList.contains('hdr-search');
  let dock = document.querySelector('.dock');
  let dockIn = dock && dock.querySelector('.dock-in');
  if (home || !dockIn) {          // the home page has no bottom bar: make a small one just for search
    dock = document.createElement('div'); dock.className = 'dock dock-solo'; dock.hidden = true;
    dockIn = document.createElement('div'); dockIn.className = 'dock-in'; dock.append(dockIn);
    document.body.append(dock);
  }
  const form = document.createElement('form');
  form.className = 'sx'; form.setAttribute('role', 'search'); form.hidden = true;
  form.innerHTML = `<span class="sx-ico">${ICON}</span><input class="sx-in" type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Search projects, ventures, founders, code" aria-label="Search the site" role="combobox" aria-expanded="false" aria-controls="sx-list" aria-autocomplete="list"><button type="button" class="sx-x" aria-label="Close search">${X}</button>`;
  dockIn.append(form);
  const input = form.querySelector('.sx-in');
  const panel = document.createElement('div');
  panel.className = 'sx-panel'; panel.hidden = true;
  panel.innerHTML = '<div class="sx-scroll"><div class="sx-list" id="sx-list" role="listbox" aria-label="Search results"></div></div><p class="sx-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></p>';
  document.body.append(panel);
  const listEl = panel.querySelector('.sx-list');
  const scrollEl = panel.querySelector('.sx-scroll');
  const dim = document.createElement('div'); dim.className = 'sx-dim'; dim.hidden = true;
  document.body.append(dim);
  const live = document.createElement('p'); live.className = 'sr sx-live'; live.setAttribute('aria-live', 'polite');
  document.body.append(live);

  let isOpen = false, active = -1, rows = [], lastQ = null;
  // ------------------------------------------------------------------ suggestions picked for this visitor
  // Worked out on the visitor's own device from what they read here and where they came from. Nothing is sent
  // anywhere and no AI is used, so it costs nothing and is instant.
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };
  (() => {
    const seen = store.get('n9-seen', []);
    if (seen[seen.length - 1] !== location.pathname) { seen.push(location.pathname); store.set('n9-seen', seen.slice(-30)); }
    try { if (!sessionStorage.getItem('n9-ref')) sessionStorage.setItem('n9-ref', document.referrer ? new URL(document.referrer).hostname : '-'); } catch (_) { /* ignore */ }
  })();
  document.addEventListener('cv:loaded', () => store.set('n9-code', Math.min(9, store.get('n9-code', 0) + 1)));
  const SLUG_TAGS = { udaan: 'hardware', 'moodie-foodie': 'edu web', nexgen: 'edu web', 'binance-futures-bot': 'fintech dev', 'finance-api': 'fintech dev', khata: 'ai fintech', stealth: 'ai dev', 'paypal-attribute': 'ai fintech', flexdrop: 'research ai', pixelproof: 'ai research', arthanetra: 'ai fintech' };
  const CHIPS = [
    ['payments', 'fintech default'], ['drone', 'hardware default'], ['IBM', 'career investor default'], ['Python', 'dev default'], ['AI agents', 'ai default'], ['Khata', 'ai fintech default'], ['founders', 'career investor default'],
    ['funding', 'investor'], ['Limen', 'investor ai'], ['Housefi', 'investor'], ['hackathon', 'career'], ['TypeScript', 'dev'], ['architecture', 'dev'], ['live demo', 'dev web'],
    ['trading', 'fintech'], ['FlexDrop', 'research'], ['simulation', 'research'], ['RC plane', 'hardware'], ['self-driving car', 'hardware'], ['PixelProof', 'ai research'], ['students', 'edu'], ['NexGen', 'edu'], ['canteen', 'edu'],
  ];
  function suggestions() {
    const sig = {};
    const add = (tags, w) => tags.split(' ').forEach((t) => { sig[t] = (sig[t] || 0) + w; });
    let ref = ''; try { ref = sessionStorage.getItem('n9-ref') || ''; } catch (_) { /* ignore */ }
    if (/linkedin\./.test(ref)) add('career investor', 3);
    if (/github\./.test(ref)) add('dev', 3);
    const seen = store.get('n9-seen', []).slice(-12);
    seen.forEach((path, i) => {
      const w = 1 + i / seen.length;                       // newer pages count more
      const m = path.match(/^\/projects\/([a-z0-9-]+)\//);
      if (m && SLUG_TAGS[m[1]]) add(SLUG_TAGS[m[1]], w);
      else if (path.startsWith('/ventures')) add('investor', w);
      else if (path.startsWith('/founders')) add('career', w);
    });
    const code = store.get('n9-code', 0); if (code) add('dev', Math.min(3, code));
    const here = (document.querySelector('.d-title')?.textContent || '').trim().toLowerCase();
    const scored = CHIPS.filter(([l]) => l.toLowerCase() !== here)
      .map(([l, tags], i) => [l, tags.split(' ').reduce((a, t) => a + (sig[t] || 0), 0) + (tags.includes('default') ? 0.6 : 0) - i * 0.01])
      .sort((a, b) => b[1] - a[1]);
    const recent = store.get('n9-recent', []).slice(0, 2);
    const all = [...recent.map((r) => [r, true]), ...scored.map(([l]) => [l, false])];
    const chips = all.filter((x, i) => all.findIndex((y) => y[0].toLowerCase() === x[0].toLowerCase()) === i).slice(0, 7);
    return { chips, personal: Object.keys(sig).length > 0 || recent.length > 0 };
  }
  const remember = (q) => { q = q.trim(); if (q.length < 2) return; store.set('n9-recent', [q, ...store.get('n9-recent', []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5)); };
  const CLOCK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/></svg>';

  // ------------------------------------------------------------------ "Ask Nexara9 AI"
  const AI = document.querySelector('meta[name="n9-ai"]')?.content;
  const VER = new URL(indexUrl, location.href).searchParams.get('v') || '';
  const aiCache = new Map();
  let lastIds = [];
  const looksLikeQuestion = (q) => /\?\s*$/.test(q) || q.trim().split(/\s+/).length >= 3 || /^(what|which|who|whom|whose|how|why|where|when|does|do|did|is|are|was|can|could|should|tell|explain|show|list|give|compare)\b/i.test(q.trim());
  const aiRow = (q, n) => `<a class="sx-r sx-ai" role="option" id="sx-o${n}" data-n="${n}" data-ai href="#"><span class="sx-t"><span class="sx-ai-ball" aria-hidden="true"></span>Ask Nexara9 AI<span class="ai-beta">Beta</span></span><span class="sx-x2">“${esc(q)}”: a short answer from what is on this site</span><span class="sx-go" aria-hidden="true">${GO}</span></a>`;
  function renumber() { listEl.querySelectorAll('.sx-r').forEach((el, i) => { el.id = `sx-o${i}`; el.dataset.n = i; }); }
  async function askAI(q) {
    const slot = listEl.querySelector('.sx-ai');
    if (!slot || !AI) return;
    remember(q);
    const box = document.createElement('div');
    box.className = 'sx-ans'; box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<p class="sx-ans-h"><span class="sx-ai-ball" aria-hidden="true"></span>Nexara9 AI<span class="ai-beta">Beta</span></p><div class="sx-ans-b"><span class="sx-dots" aria-hidden="true"><i></i><i></i><i></i></span> Thinking…</div><p class="sx-ans-f"></p>';
    slot.replaceWith(box); renumber(); setActive(0);
    const b = box.querySelector('.sx-ans-b'), f = box.querySelector('.sx-ans-f');
    const body = JSON.stringify({ q, v: VER, ids: lastIds });
    try {
      let d = aiCache.get(body);
      if (!d) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
        const res = await fetch(`${AI}/v1/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl.signal, credentials: 'omit' });
        clearTimeout(t);
        d = await res.json().catch(() => ({}));
        if (!res.ok || !d.answer) throw new Error(d.error || 'The AI could not answer right now.');
        aiCache.set(body, d);
      }
      if (!box.isConnected) return;
      const src = d.sources || [];
      const used = new Set();
      const link = (n) => { const s = src[n - 1]; if (!s) return ''; used.add(n); return `<a class="sx-cite" href="${s.u === 'mail:' ? '#' : esc(s.u)}"${s.u === 'mail:' ? ' data-mail' : ''} title="${esc(s.t + (s.sub ? ' · ' + s.sub : ''))}">${n}</a>`; };
      b.innerHTML = `<p>${esc(d.answer).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[(\d+)\]/g, (_, n) => link(+n)).replace(/\n+/g, '</p><p>')}</p>`;
      if (used.size) b.insertAdjacentHTML('beforeend', `<p class="sx-src">${[...used].sort((x, y) => x - y).map((n) => { const s = src[n - 1]; return `<a href="${s.u === 'mail:' ? '#' : esc(s.u)}"${s.u === 'mail:' ? ' data-mail' : ''}><span>${n}</span>${esc(s.t)}${s.sub ? ` · ${esc(s.sub)}` : ''}</a>`; }).join('')}</p>`);
      f.textContent = '';
    } catch (e) {
      if (!box.isConnected) return;
      b.innerHTML = `<p class="sx-ans-err">${esc(e.name === 'AbortError' ? 'The AI took too long. Please try again.' : (e.message || 'The AI could not answer right now.'))}</p>`;
    }
  }

  function render() {
    const q = input.value.trim();
    if (q === lastQ) return; lastQ = q;
    active = -1; rows = [];
    if (!q) {
      const { chips, personal } = suggestions();
      listEl.innerHTML = `<div class="sx-empty"><p>Search everything on Nexara9: projects, ventures, founders and code.${AI ? ' Or ask a question.' : ''}</p>${personal ? '<p class="sx-for">Picked for you</p>' : ''}<div class="sx-try">${chips.map(([s, recent]) => `<button type="button" class="sx-chip${recent ? ' sx-chip-recent' : ''}" data-q="${esc(s)}"${recent ? ' aria-label="Recent search: ' + esc(s) + '"' : ''}>${recent ? CLOCK : ''}${esc(s)}</button>`).join('')}</div></div>`;
      input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
      live.textContent = '';
      return;
    }
    if (!data) { listEl.innerHTML = '<div class="sx-empty"><p>Loading…</p></div>'; return; }
    const { list, marks } = search(q);
    if (!list.length) {
      lastIds = [];
      listEl.innerHTML = `${AI ? aiRow(q, 0) : ''}<div class="sx-empty"><p>Nothing found for “${esc(q)}”.</p><p class="sx-hint">Try a project name, a language, a topic like “payments” or a founder${AI ? ', or ask the AI above' : ''}.</p></div>`;
      input.setAttribute('aria-expanded', AI ? 'true' : 'false'); live.textContent = 'No results';
      if (AI) setActive(0);
      return;
    }
    const order = [];
    for (const r of list) if (!order.includes(r.e.g)) order.push(r.e.g);
    lastIds = list.filter((r) => r.e.g !== 'Code').slice(0, 8).map((r) => r.e.id);
    const qFirst = AI && looksLikeQuestion(q);
    let html = '', n = 0;
    if (qFirst) { html += aiRow(q, n); rows.push(null); n++; }
    for (const g of order) {
      html += `<div class="sx-g" role="presentation">${g === 'Code' ? 'Code files' : g}</div>`;
      for (const r of list.filter((x) => x.e.g === g)) {
        const e = r.e;
        const title = e.t;
        const sub = e.g === 'Code' ? e.sub.split(' · ')[0] : e.sub;
        const body = e.g === 'Code' ? e.sub.split(' · ').slice(1).join(' · ') : snippet(e.x, marks);
        html += `<a class="sx-r" role="option" id="sx-o${n}" data-n="${n}" href="${e.u === 'mail:' ? '#' : esc(e.u)}"${e.u === 'mail:' ? ' data-mail' : ''}><span class="sx-t">${highlight(title, marks)}${sub ? `<span class="sx-s">${esc(sub)}</span>` : ''}</span><span class="sx-x2${e.g === 'Code' ? ' sx-path' : ''}">${highlight(body, marks)}</span><span class="sx-go" aria-hidden="true">${GO}</span></a>`;
        rows.push(e); n++;
      }
    }
    if (AI && !qFirst && q.length >= 3) { html += aiRow(q, n); rows.push(null); n++; }
    listEl.innerHTML = html;
    scrollEl.scrollTop = 0;
    input.setAttribute('aria-expanded', 'true');
    live.textContent = `${n} result${n === 1 ? '' : 's'}`;
    setActive(0);
  }
  function setActive(i) {
    const items = listEl.querySelectorAll('.sx-r');
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, k) => el.setAttribute('aria-selected', k === active ? 'true' : 'false'));
    const el = items[active];
    input.setAttribute('aria-activedescendant', el.id);
    const r = el.getBoundingClientRect(), p = scrollEl.getBoundingClientRect();
    if (r.top < p.top + 30) scrollEl.scrollTop -= p.top + 30 - r.top;
    else if (r.bottom > p.bottom - 8) scrollEl.scrollTop += r.bottom - p.bottom + 8;
  }
  function go(el) {
    if (!el) return;
    if (el.hasAttribute('data-ai')) { askAI(input.value.trim()); return; }
    if (input.value.trim()) remember(input.value);
    if (el.hasAttribute('data-mail')) {
      const m = document.querySelector('[data-mail-u]');
      close(false);
      if (m) location.href = `mailto:${m.dataset.mailU}@${m.dataset.mailD}?subject=${encodeURIComponent(m.dataset.mailS || 'Hello Nexara9')}`;
      return;
    }
    const url = new URL(el.getAttribute('href'), location.href);
    const same = url.pathname === location.pathname && url.search === location.search;
    close(false);
    if (same && url.hash) {
      if (location.hash === url.hash) history.replaceState(null, '', url.pathname + url.search);
      location.hash = url.hash;
    } else if (same && !url.hash) {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    } else {
      location.href = url.href;
    }
  }

  // ------------------------------------------------------------------ open / close with a smooth width change
  function animateWidth(change) {
    if (reduce || home) { change(); return; }
    const from = dockIn.getBoundingClientRect().width;
    change();
    const to = dockIn.getBoundingClientRect().width;
    if (Math.abs(from - to) < 2) return;
    const z = parseFloat(getComputedStyle(dock).zoom) || 1;    // very large screens zoom the bar
    dockIn.classList.add('sx-anim');
    const a = dockIn.animate([{ width: `${from / z}px` }, { width: `${to / z}px` }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    a.onfinish = a.oncancel = () => dockIn.classList.remove('sx-anim');
  }
  // Phones: keep the bar and the results above the on-screen keyboard
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--sx-kb', `${kb}px`);
    document.documentElement.style.setProperty('--sx-avail', `${Math.round(vv.height)}px`);
  };
  if (vv) { vv.addEventListener('resize', () => isOpen && fit()); vv.addEventListener('scroll', () => isOpen && fit()); }

  function open() {
    if (isOpen) return;
    isOpen = true;
    fit();
    opener.setAttribute('aria-expanded', 'true');
    load().then(() => { lastQ = null; render(); }).catch(() => { listEl.innerHTML = '<div class="sx-empty"><p>Search could not load. Please check your connection and try again.</p></div>'; });
    if (home) { dock.hidden = false; }
    animateWidth(() => { dock.classList.add('is-search'); form.hidden = false; });
    if (home && !reduce) dock.animate([{ transform: 'translate(-50%, 24px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    if (!reduce) form.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 80, fill: 'backwards' });
    panel.hidden = false; dim.hidden = false;
    if (!reduce) {
      panel.animate([{ opacity: 0, transform: 'translate(-50%, 12px) scale(.98)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)', delay: 60, fill: 'backwards' });
      dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    }
    lastQ = null; render();
    input.focus({ preventScroll: true });
    document.documentElement.classList.add('sx-on');
  }
  function close(refocus = true) {
    if (!isOpen) return;
    isOpen = false;
    opener.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    // the bar changes back at once; the results fade out and are then hidden (by a timer, so a slow or
    // busy screen can never leave them stuck open)
    animateWidth(() => { dock.classList.remove('is-search'); form.hidden = true; });
    if (home) dock.hidden = true;
    document.documentElement.classList.remove('sx-on');
    const finish = () => { if (!isOpen) { panel.hidden = true; dim.hidden = true; } };
    if (reduce) finish();
    else {
      dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.catch(() => {}).then(() => dim.getAnimations().forEach((a) => a.cancel()));
      panel.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 10px) scale(.98)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {}).then(() => panel.getAnimations().forEach((a) => a.cancel()));
      setTimeout(finish, 170);
    }
    if (refocus) opener.focus({ preventScroll: true });
  }

  opener.setAttribute('aria-expanded', 'false');
  opener.setAttribute('aria-haspopup', 'listbox');
  opener.addEventListener('click', () => (isOpen ? close() : open()));
  opener.addEventListener('pointerenter', () => load().catch(() => {}), { once: true });
  opener.addEventListener('focus', () => load().catch(() => {}), { once: true });
  form.querySelector('.sx-x').addEventListener('click', () => close());
  form.addEventListener('submit', (e) => { e.preventDefault(); go(listEl.querySelectorAll('.sx-r')[active]); });
  dim.addEventListener('click', () => close());
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, data && data.length > 400 ? 60 : 0); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; render(); } else close(); }
  });
  listEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.sx-chip');
    if (chip) { input.value = chip.dataset.q; render(); input.focus(); return; }
    const cite = e.target.closest('.sx-cite, .sx-src a');
    if (cite && !(e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); go(cite); return; }
    const r = e.target.closest('.sx-r');
    if (r && !(e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); go(r); }
  });
  listEl.addEventListener('pointermove', (e) => { const r = e.target.closest('.sx-r'); if (r && +r.dataset.n !== active) setActive(+r.dataset.n); });
  document.addEventListener('keydown', (e) => {
    if (isOpen && e.key === 'Escape') { close(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (!isOpen && !typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); open(); }
  });
  // Coming back with the Back button: start with the bar as it was
  window.addEventListener('pageshow', (e) => { if (e.persisted && isOpen) { isOpen = true; close(false); } });
})();
