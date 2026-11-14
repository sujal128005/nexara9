// Builds the static site from src/content.mjs and src/tech.mjs into the repository root.
// Usage: node src/build.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, people, founders, founderProfiles, categories, flagships, projects } from './content.mjs';
import { tech } from './tech.mjs';
import { glyph, logoMark, icon } from './glyphs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '20261115'; // cache-busting version for CSS/JS

// ---------- helpers ----------
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (s = '') =>
  esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const ext = (href, inner, cls = '') =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
const catLabel = (id) => categories.find((c) => c.id === id)?.label ?? id;
const pad = (n) => String(n).padStart(2, '0');
const mailAttrs = (subject) => {
  const [u, d] = site.email.split('@');
  return `href="/#contact" data-mail-u="${esc(u)}" data-mail-d="${esc(d)}" data-mail-s="${esc(subject)}"`;
};
const open = projects.filter((p) => !p.comingSoon);
const catClass = (p) => `c-${p.cats[0] || 'none'}`;

const langColor = {
  Python: '#3572A5', TypeScript: '#3178C6', JavaScript: '#E4C12B', HTML: '#E34C26', CSS: '#7A4FBF',
  SQL: '#E38C00', Shell: '#5FB236', Batchfile: '#9DB82A', 'C++': '#F34B7D', Solidity: '#AA6746',
};

const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "manifest-src 'self'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

function head({ title, description, path, scripts = [], inner = true }) {
  const url = site.url + path;
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="${inner ? '#fbfaf7' : '#0a0907'}">
<meta name="color-scheme" content="${inner ? 'light dark' : 'dark'}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nexara9">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${site.url}/assets/brand/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
${inner ? `<script src="/assets/js/theme.js?v=${V}"></script>` : `<link rel="preload" href="/assets/fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>`}
<link rel="preload" href="/assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/${inner ? 'site' : 'main'}.css?v=${V}">
<script src="/assets/js/main.js?v=${V}" defer></script>
${scripts.map((s) => `<script src="/assets/js/${s}?v=${V}" defer></script>`).join('\n')}
</head>`;
}

const sunMoon = `<svg class="i-sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg><svg class="i-moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z"/></svg>`;

function header(active = '', { inner = true } = {}) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'hdr')}<span class="brand-word">NEXARA<b>9</b></span></a>
  <div class="header-right">
    <nav id="site-nav" class="site-nav" aria-label="Main">
      ${link('/projects/', 'Projects', 'projects')}
      ${link('/ventures/', 'Ventures', 'ventures')}
      ${link('/founders/', 'Founders', 'founders')}
      <a class="nav-cta" ${mailAttrs('Hello Nexara9')}>Contact</a>
    </nav>
    ${inner ? `<button class="theme-toggle" type="button" aria-label="Switch between light and dark theme">${sunMoon}</button>` : ''}
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr">Menu</span><i></i><i></i></button>
  </div>
</header>`;
}

function personHTML(key) {
  const p = people[key];
  const links = p.links.map((l) => ext(l.href, `${esc(l.label)}${icon.external}`, 'chip-link')).join('');
  return `<li class="person"><span class="avatar" aria-hidden="true">${esc(p.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span><span class="person-main"><span class="person-name">${esc(p.name)}</span>${links ? `<span class="person-links">${links}</span>` : ''}</span></li>`;
}

function footer() {
  return `<footer class="site-footer" id="contact">
  <div class="wrap foot-cta">
    <div>
      <p class="eyebrow">Work with us</p>
      <h2 class="h2">Back a Nexara9 venture, or build the next one with us.</h2>
    </div>
    <a class="btn btn-primary" ${mailAttrs('Hello Nexara9')}>${icon.mail}<span>Write to us</span></a>
  </div>
  <div class="wrap foot-grid">
    <div>
      <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'ftr')}<span class="brand-word">NEXARA<b>9</b></span></a>
      <p class="muted small">${esc(site.tagline)}</p>
    </div>
    <div>
      <p class="label">Explore</p>
      <ul class="foot-links"><li><a href="/projects/">Projects</a></li><li><a href="/ventures/">Flagship ventures</a></li><li><a href="/founders/">Founders</a></li></ul>
    </div>
    <div>
      <p class="label">Elsewhere</p>
      <ul class="foot-links"><li>${ext('https://github.com/sujal128005', 'GitHub')}</li><li>${ext(people.sujal.links[1].href, 'Sujal on LinkedIn')}</li><li>${ext(people.navya.links[0].href, 'Navya on LinkedIn')}</li></ul>
    </div>
  </div>
  <p class="wrap legal">© ${new Date().getFullYear()} Nexara9. Designed and built by the Nexara9 team.</p>
</footer>`;
}

// ---------- home (unchanged design) ----------
function homePage() {
  const total = projects.length + flagships.length;
  return `${head({ title: 'Nexara9 · Many ventures. One golden standard.', description: site.description, path: '/', scripts: ['home.js'], inner: false })}
<body class="page-home">
<canvas id="sky" aria-hidden="true"></canvas>
<div class="home">
${header('home', { inner: false })}
<main id="main" class="home-main">
  <div class="home-copy">
    <p class="eyebrow reveal"><span class="pulse"></span>A house of ventures<span class="hide-sm">&nbsp;· Building since ${site.since}</span></p>
    <h1 class="display reveal">Many ventures.<br><em class="gold-text">One golden standard.</em></h1>
    <p class="lead reveal">Nexara9 is the company we are building: one name over many projects, from autonomous machines and AI agents to apps people use every day. Every one of them is designed, built and shipped by us.</p>
    <div class="cta-row reveal">
      <a class="btn btn-gold" href="/projects/"><span>Explore the projects</span>${icon.arrow}</a>
      <a class="btn btn-ghost" href="/ventures/"><span>Flagship ventures</span></a>
    </div>
  </div>
  <div class="home-emblem" aria-hidden="true">
    <div class="orbit">
      <svg class="orbit-ring" viewBox="0 0 400 400" fill="none">
        <circle cx="200" cy="200" r="196" stroke="currentColor" stroke-opacity=".18"/>
        <circle cx="200" cy="200" r="150" stroke="currentColor" stroke-opacity=".10" stroke-dasharray="2 6"/>
        ${Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
          return `<circle cx="${(200 + Math.cos(a) * 196).toFixed(1)}" cy="${(200 + Math.sin(a) * 196).toFixed(1)}" r="3.2" fill="currentColor"/>`;
        }).join('')}
      </svg>
      ${logoMark('hero-mark', 'hero')}
    </div>
  </div>
</main>
<footer class="home-foot">
  <dl class="stats">
    <div><dt>Projects</dt><dd>${total}</dd></div>
    <div><dt>Flagship ventures</dt><dd>${flagships.length}</dd></div>
    <div><dt>First build</dt><dd>${site.since}</dd></div>
  </dl>
  <p class="founders">Founded by ${founders.map((k) => `<a class="u-link" href="/founders/#${k}">${esc(people[k].name)}</a>`).join(' &amp; ')}</p>
</footer>
</div>
</body>
</html>
`;
}

// ---------- projects ----------
function projectCard(p, i) {
  const tags = p.cats.map((c) => `<span class="tag t-${c}">${esc(catLabel(c))}</span>`).join('');
  const langs = tech[p.slug]?.languages?.slice(0, 2).map(([l]) => l).join(' · ') || '';
  return `<li class="card reveal" data-cats="${p.cats.join(' ')}"><a class="card-body" href="/projects/${p.slug}/">
    <div class="card-tile ${catClass(p)}">${glyph(p.glyph)}<span class="card-index">${pad(i + 1)}</span></div>
    <div class="card-main">
      <div class="card-meta"><span>${p.year}</span>${langs ? `<span>${esc(langs)}</span>` : ''}</div>
      <h3 class="card-title">${esc(p.name)}</h3>
      <p class="card-text">${fmt(p.short)}</p>
      <div class="card-foot"><div class="tags">${tags}</div><span class="card-go" aria-hidden="true">${icon.arrow}</span></div>
    </div>
  </a></li>`;
}

function projectsPage() {
  const chips = [{ id: 'all', label: 'All' }, ...categories]
    .map((c, i) => `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="${i === 0}">${esc(c.label)}</button>`)
    .join('');
  return `${head({ title: 'Projects · Nexara9', description: 'Every open Nexara9 project: what it is, how it is built, the code structure and the ideas behind it.', path: '/projects/' })}
<body class="page-projects">
${header('projects')}
<main id="main">
  <section class="page-hero wrap">
    <p class="eyebrow reveal">Projects</p>
    <h1 class="h1 reveal">Everything we have built, and <span class="hl">what it taught us.</span></h1>
    <p class="lead reveal">Open any project to see the problem, the architecture, the languages and code structure, a live or interactive demo, and the concepts behind it.</p>
    <dl class="hero-stats reveal">
      <div><dt>Open projects</dt><dd>${open.length}</dd></div>
      <div><dt>Flagship ventures</dt><dd>${flagships.length}</dd></div>
      <div><dt>Building since</dt><dd>${site.since}</dd></div>
    </dl>
  </section>
  <section class="wrap open" aria-label="Projects">
    <div class="filters" role="group" aria-label="Filter projects">${chips}<span class="filter-count" aria-live="polite"></span></div>
    <ul class="card-grid">${open.map(projectCard).join('\n')}</ul>
  </section>
  <section class="wrap cross reveal">
    <a class="cross-card cross-dark" href="/ventures/"><span class="label">Flagship ventures</span><span class="cross-title">The work we are betting on</span><span class="cross-go">${icon.arrow}</span></a>
    <a class="cross-card" href="/founders/"><span class="label">Founders</span><span class="cross-title">Meet the people behind Nexara9</span><span class="cross-go">${icon.arrow}</span></a>
  </section>
</main>
${footer()}
</body>
</html>
`;
}

// ---------- ventures ----------
function ventureCard(f, big) {
  return `<li class="venture${big ? ' venture-big' : ''} reveal">
    <div class="venture-head"><span class="venture-kind">${esc(f.kind)}</span><span class="venture-lock">${icon.lock}<span>Private</span></span></div>
    <div class="venture-glyph">${glyph(f.glyph)}</div>
    <h3 class="venture-name">${esc(f.name)}</h3>
    <p class="venture-line">${esc(f.line)}</p>
    <p class="venture-badge">${esc(f.badge)}</p>
    ${f.funding ? `<a class="btn btn-gold" ${mailAttrs(`${f.name}: funding enquiry`)}>${icon.mail}<span>Fund ${esc(f.name)}</span></a>` : ''}
  </li>`;
}

function venturesPage() {
  const [limen, housefi, navya, navyam] = flagships;
  return `${head({ title: 'Flagship ventures · Nexara9', description: 'The Nexara9 ventures we are betting on: Limen, Housefi and the Autonomy Program.', path: '/ventures/' })}
<body class="page-ventures">
${header('ventures')}
<main id="main">
  <section class="page-hero wrap">
    <p class="eyebrow reveal">Flagship ventures</p>
    <h1 class="h1 reveal">The work we are <span class="hl">betting on.</span></h1>
    <p class="lead reveal">These are kept deliberately quiet. We share more with partners and investors, so if you would like to know more, talk to us.</p>
  </section>
  <section class="wrap">
    <ul class="venture-grid">${ventureCard(limen, true)}${ventureCard(housefi, true)}</ul>
    <div class="autonomy reveal">
      <div class="autonomy-copy">
        <p class="eyebrow">The Autonomy Program</p>
        <h2 class="h2">Two machines. One idea.</h2>
        <p class="muted">An autonomous car and an autonomous drone, designed to work together. What they will do together is something we will reveal when it is ready.</p>
      </div>
      <ul class="autonomy-pair">${ventureCard(navya)}<li class="autonomy-link" aria-hidden="true"><span></span></li>${ventureCard(navyam)}</ul>
    </div>
    <div class="fund-band reveal">
      <div><p class="eyebrow">Pre-seed</p><p class="fund-text">We are raising for <strong>Limen</strong> and <strong>Housefi</strong>. If you would like to back us, we would love to talk.</p></div>
      <a class="btn btn-gold" ${mailAttrs('Nexara9: pre-seed funding')}>${icon.mail}<span>Talk to the founders</span></a>
    </div>
  </section>
  <section class="wrap cross reveal">
    <a class="cross-card" href="/projects/"><span class="label">Projects</span><span class="cross-title">See everything we have built in the open</span><span class="cross-go">${icon.arrow}</span></a>
    <a class="cross-card" href="/founders/"><span class="label">Founders</span><span class="cross-title">Meet the people behind Nexara9</span><span class="cross-go">${icon.arrow}</span></a>
  </section>
</main>
${footer()}
</body>
</html>
`;
}

// ---------- founders ----------
function foundersPage() {
  const cards = founderProfiles
    .map((f) => {
      const p = people[f.key];
      const built = open.filter((x) => x.team.includes(f.key));
      return `<article class="founder reveal" id="${f.key}">
      <div class="founder-side">
        <span class="founder-avatar" aria-hidden="true">${esc(f.initials)}</span>
        <h2 class="founder-name">${esc(p.name)}</h2>
        <p class="founder-role">${esc(f.role)}, Nexara9</p>
        <p class="founder-study">${esc(f.study)}<br><span class="muted">${esc(f.college)}</span></p>
        <div class="founder-links">${p.links.map((l) => ext(l.href, `<span>${esc(l.label)}</span>${icon.external}`, 'btn btn-outline btn-sm')).join('')}</div>
      </div>
      <div class="founder-body">
        ${f.quote ? `<blockquote class="founder-quote">“${esc(f.quote.replace(/^“|”$/g, ''))}”</blockquote>` : ''}
        ${f.bio.map((b) => `<p>${fmt(b)}</p>`).join('')}
        <p class="label">Focus</p>
        <div class="tags">${f.focus.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
        <p class="label">Highlights</p>
        <ul class="highlights">${f.highlights.map((h) => `<li>${fmt(h)}</li>`).join('')}</ul>
        ${built.length ? `<p class="label">Projects on this site</p><div class="built">${built.map((b) => `<a class="built-link" href="/projects/${b.slug}/">${esc(b.name)}${icon.arrow}</a>`).join('')}</div>` : ''}
      </div>
    </article>`;
    })
    .join('');
  return `${head({ title: 'Founders · Nexara9', description: 'Sujal Negi and Made Navya, the founders of Nexara9.', path: '/founders/' })}
<body class="page-founders">
${header('founders')}
<main id="main">
  <section class="page-hero wrap">
    <p class="eyebrow reveal">Founders</p>
    <h1 class="h1 reveal">Two builders, <span class="hl">one standard.</span></h1>
    <p class="lead reveal">Nexara9 was started by two engineering students at IIITDM Kurnool who would rather ship than talk about shipping.</p>
  </section>
  <section class="wrap founders-list">${cards}</section>
</main>
${footer()}
</body>
</html>
`;
}

// ---------- project detail ----------
function linkButtons(p) {
  const out = [];
  if (p.demo?.inPage) out.push(`<a class="btn btn-primary" href="#demo">${icon.play}<span>${esc(p.demo.label)}</span></a>`);
  else if (p.demo) out.push(ext(p.demo.href, `${icon.play}<span>${esc(p.demo.label)}</span>${icon.external}`, 'btn btn-primary'));
  for (const d of p.more || []) out.push(ext(d.href, `<span>${esc(d.label)}</span>${icon.external}`, 'btn btn-outline'));
  if (p.repo) out.push(ext(p.repo, `${icon.github}<span>View on GitHub</span>${icon.external}`, 'btn btn-outline'));
  return out.join('');
}

function stepsHTML(p) {
  const id = p.slug;
  const tabs = p.steps.map((s, i) => `<li><button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="step-n">${i + 1}</span><span class="step-t">${esc(s.title)}</span></button></li>`).join('');
  const panels = p.steps.map((s, i) => `<div role="tabpanel" class="step-panel" id="${id}-p${i}" aria-labelledby="${id}-t${i}"${i === 0 ? '' : ' data-inactive'}><p class="step-kicker">Step ${i + 1} of ${p.steps.length}</p><h4>${esc(s.title)}</h4><p>${fmt(s.text)}</p></div>`).join('');
  return `<div class="stepper" data-stepper><ol class="step-list" role="tablist" aria-label="How ${esc(p.name)} works">${tabs}</ol><div class="step-panels">${panels}<div class="step-progress" aria-hidden="true"><span></span></div><div class="step-nav"><button type="button" class="btn btn-outline btn-sm" data-step="-1">${icon.back}<span>Previous</span></button><button type="button" class="btn btn-outline btn-sm" data-step="1"><span>Next step</span>${icon.arrow}</button></div></div></div>`;
}

function archHTML(a) {
  const tiers = a.tiers
    .map((t, i) => `${i ? '<div class="tier-arrow" aria-hidden="true"><span></span></div>' : ''}<div class="tier tier-${i + 1}${t.dashed ? ' tier-dashed' : ''}"><p class="tier-name">${esc(t.name)}${t.sub ? ` <code>${esc(t.sub)}</code>` : ''}${t.dashed ? ' <span class="tier-flag">planned</span>' : ''}</p><ul>${t.nodes.map(([n, d]) => `<li><strong>${fmt(n)}</strong><span>${fmt(d)}</span></li>`).join('')}</ul></div>`)
    .join('');
  return `<figure class="arch"><figcaption class="arch-title">${esc(a.title)}</figcaption><div class="arch-tiers tiers-${a.tiers.length}">${tiers}</div></figure>
  <p class="label">The journey of one request</p>
  <ol class="flow">${a.flow.map((f) => `<li>${fmt(f)}</li>`).join('')}</ol>`;
}

function langHTML(langs) {
  let x = 0;
  const rects = langs.map(([l, pc]) => { const r = `<rect x="${x.toFixed(2)}" y="0" width="${pc.toFixed(2)}" height="10" fill="${langColor[l] || '#999'}"/>`; x += pc; return r; }).join('');
  const legend = langs.map(([l, pc]) => `<li><svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${langColor[l] || '#999'}"/></svg><span>${esc(l)}</span><span class="muted">${pc.toFixed(1)}%</span></li>`).join('');
  return `<div class="langs"><svg class="lang-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${esc(langs.map(([l, pc]) => `${l} ${pc}%`).join(', '))}">${rects}</svg><ul class="lang-legend">${legend}</ul></div>`;
}

function treeHTML(items, depth = 0) {
  return `<ul class="tree${depth ? '' : ' tree-root'}">${items
    .map(([path, desc, kids]) => {
      const isDir = /\/$/.test(path) || kids;
      const row = `<span class="t-ico ${isDir ? 'dir' : 'file'}" aria-hidden="true"></span><code class="t-path">${esc(path)}</code><span class="t-desc">${fmt(desc)}</span>`;
      return kids
        ? `<li><details${depth === 0 ? ' open' : ''}><summary>${row}</summary>${treeHTML(kids, depth + 1)}</details></li>`
        : `<li><div class="t-row">${row}</div></li>`;
    })
    .join('')}</ul>`;
}

function tableHTML(r) {
  return `<figure class="results"><div class="table-scroll"><table><thead><tr>${r.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><figcaption>${fmt(r.caption)}${r.note ? `<br><span class="muted">${fmt(r.note)}</span>` : ''}</figcaption></figure>`;
}

function demoSection(p) {
  const out = [];
  if (p.demo && !p.demo.inPage) {
    for (const d of [p.demo, ...(p.more || [])]) {
      out.push(`<div class="live-card"><div><p class="label">${esc(d.label)}</p><p class="live-url">${esc(d.href.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p></div>${ext(d.href, `<span>Open</span>${icon.external}`, 'btn btn-primary btn-sm')}</div>`);
    }
  }
  if (p.widget) out.push(`<div class="widget" data-widget="${p.widget}"><noscript><p class="muted">Turn on JavaScript to use this interactive demo.</p></noscript></div>`);
  if (p.gallery) {
    out.push(`<div class="gallery">${p.gallery.map((g, i) => `<figure class="shot${i === 0 ? ' shot-wide' : ''}"><img src="/assets/img/projects/${esc(g.src)}" alt="${esc(g.caption)}" loading="lazy" decoding="async"><figcaption>${esc(g.caption)}</figcaption></figure>`).join('')}</div>`);
  }
  if (p.demo?.inPage) out.push(`<p class="muted small">The demo above runs in your browser and shows how the project behaves. To run the real thing, follow the instructions in the ${ext(p.repo, 'GitHub repository', 'u-link')}.</p>`);
  return out.join('');
}

function detailPage(p, idx, prev, next) {
  const t = tech[p.slug] || {};
  const n = pad(idx + 1);
  const sections = [
    ['overview', 'Overview'], ['problem', 'Problem and aim'], ['how', 'How it works'],
    ...(t.arch ? [['architecture', 'Architecture']] : []),
    ...(t.repo ? [['code', 'Languages and code']] : []),
    ['method', 'Methodology'], ['stack', 'Technology'], ['demo', 'Demo'],
    ...(p.results ? [['results', 'Results']] : []),
    ['learn', 'Learn the concepts'], ['team', 'Team'],
  ];
  const num = Object.fromEntries(sections.map(([id], i) => [id, pad(i + 1)]));
  const sh = (id, title) => `<p class="sec-n">${num[id]}</p><h2 class="h2">${title}</h2>`;
  const tags = p.cats.map((c) => `<span class="tag t-${c}">${esc(catLabel(c))}</span>`).join('');
  const visual = p.image
    ? `<figure class="hero-shot"><img src="/assets/img/projects/${esc(p.image.src)}" alt="${esc(p.image.alt)}" decoding="async"></figure>`
    : `<div class="hero-tile ${catClass(p)}" aria-hidden="true">${glyph(p.glyph, 'glyph glyph-xl')}<span class="hero-index">${n}</span></div>`;

  return `${head({ title: `${p.name} · Nexara9`, description: p.short, path: `/projects/${p.slug}/`, scripts: p.widget ? ['demos.js'] : [] })}
<body class="page-detail">
${header('projects')}
<main id="main">
  <section class="detail-hero wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/projects/">Projects</a><span aria-hidden="true">/</span><span>${esc(p.name)}</span></nav>
    <div class="detail-hero-grid">
      <div>
        <p class="eyebrow reveal">Project ${n} · ${p.year}</p>
        <h1 class="h1 reveal">${esc(p.name)}</h1>
        <p class="lead reveal">${fmt(p.short)}</p>
        <div class="tags reveal">${tags}<span class="tag tag-context">${esc(p.context)}</span></div>
        <div class="cta-row reveal">${linkButtons(p)}</div>
      </div>
      <div class="reveal">${visual}</div>
    </div>
    <dl class="facts reveal">
      <div><dt>Status</dt><dd>${esc(p.status)}</dd></div>
      <div><dt>Languages</dt><dd>${esc((t.languages || []).slice(0, 3).map(([l]) => l).join(', ') || '—')}</dd></div>
      <div><dt>Built for</dt><dd>${esc(p.context)}</dd></div>
      <div><dt>Team</dt><dd>${p.team.map((k) => esc(people[k].name)).join(', ')}</dd></div>
    </dl>
  </section>

  <div class="detail-body wrap">
    <aside class="toc" aria-label="On this page"><p class="label">On this page</p><ol>${sections.map(([id, l]) => `<li><a href="#${id}"><span>${num[id]}</span>${l}</a></li>`).join('')}</ol></aside>
    <article class="prose">
      <section id="overview" class="block reveal">${sh('overview', 'Overview')}${p.overview.map((x) => `<p>${fmt(x)}</p>`).join('')}</section>
      <section id="problem" class="block reveal">${sh('problem', 'Problem and aim')}
        <div class="pa-grid"><div class="pa"><p class="label">The problem</p><p>${fmt(p.problem)}</p></div><div class="pa pa-aim"><p class="label">The aim</p><p>${fmt(p.aim)}</p></div></div></section>
      <section id="how" class="block reveal">${sh('how', 'How it works')}<p class="muted">Step through it. Use the tabs, or the arrow keys once a tab is focused.</p>${stepsHTML(p)}</section>
      ${t.arch ? `<section id="architecture" class="block reveal">${sh('architecture', 'Architecture')}<p class="muted">How the pieces fit together, from what you see to where the data lives.</p>${archHTML(t.arch)}</section>` : ''}
      ${t.repo ? `<section id="code" class="block reveal">${sh('code', 'Languages and code')}<p class="label">Languages</p>${langHTML(t.languages)}<p class="label">Repository, folder by folder</p><p class="muted small">What each folder and file is responsible for. Open a folder to see inside.</p>${treeHTML(t.repo)}</section>` : ''}
      <section id="method" class="block reveal">${sh('method', 'Methodology')}<ol class="method">${p.methodology.map((m) => `<li><p>${fmt(m)}</p></li>`).join('')}</ol></section>
      <section id="stack" class="block reveal">${sh('stack', 'Technology')}<div class="stack">${p.stack.map((g) => `<div class="stack-group"><p class="label">${esc(g.group)}</p><ul>${g.items.map((it) => `<li><span class="stack-name">${esc(it.name)}</span><span class="stack-why">${fmt(it.why)}</span></li>`).join('')}</ul></div>`).join('')}</div></section>
      <section id="demo" class="block reveal">${sh('demo', 'Demo')}${demoSection(p)}</section>
      ${p.results ? `<section id="results" class="block reveal">${sh('results', 'Results')}${tableHTML(p.results)}</section>` : ''}
      <section id="learn" class="block reveal">${sh('learn', 'Learn the concepts')}<p class="muted">The ideas this project is built on, in plain words.</p><div class="learn">${p.learn.map((l, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary><span class="qa-q">${esc(l.q)}</span><span class="qa-x" aria-hidden="true"></span></summary><div class="qa-a"><p>${fmt(l.a)}</p></div></details>`).join('')}</div></section>
      <section id="team" class="block reveal">${sh('team', 'Team')}<ul class="people">${p.team.map(personHTML).join('')}</ul></section>
    </article>
  </div>

  <nav class="pager wrap" aria-label="More projects">
    ${prev ? `<a class="pager-link" href="/projects/${prev.slug}/"><span class="label">${icon.back} Previous</span><span class="pager-name">${esc(prev.name)}</span></a>` : '<span></span>'}
    ${next ? `<a class="pager-link pager-next" href="/projects/${next.slug}/"><span class="label">Next ${icon.arrow}</span><span class="pager-name">${esc(next.name)}</span></a>` : `<a class="pager-link pager-next" href="/projects/"><span class="label">Back to ${icon.arrow}</span><span class="pager-name">All projects</span></a>`}
  </nav>
</main>
${footer()}
</body>
</html>
`;
}

function notFoundPage() {
  return `${head({ title: 'Page not found · Nexara9', description: 'This page does not exist.', path: '/404.html' })}
<body class="page-404">
${header()}
<main id="main" class="wrap nf">
  <p class="eyebrow">Error 404</p>
  <h1 class="h1">This page is <span class="hl">off the map.</span></h1>
  <p class="lead">The link may be old, or the page may have moved.</p>
  <div class="cta-row"><a class="btn btn-primary" href="/"><span>Go home</span>${icon.arrow}</a><a class="btn btn-outline" href="/projects/"><span>See all projects</span></a></div>
</main>
</body>
</html>
`;
}

// ---------- write ----------
function write(rel, content) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
for (const d of ['projects', 'ventures', 'founders']) {
  const p = join(ROOT, d);
  if (existsSync(p)) rmSync(p, { recursive: true });
}
write('index.html', homePage());
write('projects/index.html', projectsPage());
write('ventures/index.html', venturesPage());
write('founders/index.html', foundersPage());
open.forEach((p, i) => write(`projects/${p.slug}/index.html`, detailPage(p, i, open[i - 1], open[i + 1])));
write('404.html', notFoundPage());

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
const urls = ['/', '/projects/', '/ventures/', '/founders/', ...open.map((p) => `/projects/${p.slug}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site.url}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
write('site.webmanifest', JSON.stringify({
  name: 'Nexara9', short_name: 'Nexara9', start_url: '/', display: 'standalone', background_color: '#0a0907', theme_color: '#0a0907',
  icons: [{ src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2) + '\n');
const expires = new Date(Date.now() + 365 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
write('.well-known/security.txt', `Contact: mailto:${site.email}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${site.url}/.well-known/security.txt\n`);
console.log(`Built ${urls.length} pages + 404 into ${ROOT}`);
