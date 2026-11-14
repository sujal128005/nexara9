// Builds the static site from src/content.mjs and src/tech.mjs into the repository root.
// Usage: node src/build.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, people, founders, founderProfiles, categories, flagships, projects, complexityLabels } from './content.mjs';
import { tech } from './tech.mjs';
import { glyph, logoMark, icon } from './glyphs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Cache-busting version: a hash of every stylesheet and script, so a changed file always gets a new URL.
const V = createHash('sha256')
  .update(['assets/css/main.css', 'assets/css/site.css', 'assets/js/main.js', 'assets/js/home.js', 'assets/js/demos.js', 'assets/js/theme.js']
    .map((f) => readFileSync(join(ROOT, f))).join('\n'))
  .digest('hex').slice(0, 10);

// ---------- helpers ----------
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (s = '') =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a class="tlink" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
${inner ? '<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>' : ''}
<link rel="stylesheet" href="/assets/css/${inner ? 'site' : 'main'}.css?v=${V}">
<script src="/assets/js/main.js?v=${V}" defer></script>
${scripts.map((s) => `<script src="/assets/js/${s}?v=${V}" defer></script>`).join('\n')}
</head>`;
}

const sunMoon = `<svg class="i-sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg><svg class="i-moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z"/></svg>`;

function header(active = '', { inner = true } = {}) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  if (inner) {
    return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'hdr')}<span class="brand-word">NEXARA<b>9</b></span></a>
  <div class="header-right">
    <a class="hdr-link" href="/founders/"${active === 'founders' ? ' aria-current="page"' : ''}>Founders</a>
    <button class="theme-toggle" type="button" aria-label="Switch between light and dark theme">${sunMoon}</button>
  </div>
</header>`;
  }
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
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr">Menu</span><i></i><i></i></button>
  </div>
</header>`;
}

// Bottom navigation for inside pages. On project pages it also carries the section and project menu.
const dockIcon = {
  projects: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>',
  ventures: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z"/></svg>',
  founders: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7.5" cy="7" r="2.8"/><circle cx="14" cy="8" r="2.2"/><path d="M2.5 16.5c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6M13 12.2c2.2 0 4 1.3 4.5 4.3"/></svg>',
  contact: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="10" rx="2"/><path d="M3.5 6l6.5 5 6.5-5"/></svg>',
  sections: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3.5" cy="5" r="1"/><circle cx="3.5" cy="10" r="1"/><circle cx="3.5" cy="15" r="1"/></svg>',
};
function dock(active, menu = '') {
  const seg = (href, key, label) => `<a class="sw-seg" href="${href}"${active === key ? ' aria-current="page"' : ''}>${dockIcon[key]}<span>${label}</span></a>`;
  return `<nav class="dock${menu ? ' dock-has-menu' : ''}" aria-label="Projects and ventures">
  <div class="dock-in">
    ${menu}
    <div class="sw${active === 'ventures' ? ' sw-r' : active === 'projects' ? ' sw-l' : ''}">${seg('/projects/', 'projects', 'Projects')}${seg('/ventures/', 'ventures', 'Ventures')}</div>
  </div>
</nav>`;
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
    <p class="lead reveal">Autonomous machines, AI products and everyday apps, built under one name.</p>
    <div class="cta-row reveal">
      <a class="btn btn-gold" href="/projects/"><span>Explore the projects</span>${icon.arrow}</a>
      <a class="btn btn-ghost" ${mailAttrs('Hello Nexara9')}>${icon.mail}<span>Contact</span></a>
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

// ---------- shared inside-page parts ----------
const code = (i) => `N9/${pad(i + 1)}`;

function footer() {
  return `<footer class="ft" id="contact">
  <div class="wrap ft-contact">
    <div>
      <p class="kicker">Contact</p>
      <p class="ft-title">Talk to the founders.</p>
    </div>
    <div class="ft-actions">
      <a class="btn btn-gold" ${mailAttrs('Hello Nexara9')}>${icon.mail}<span>Email us</span></a>
      ${ext(people.sujal.links[1].href, `<span>Sujal on LinkedIn</span>${icon.external}`, 'btn btn-dark')}
      ${ext(people.navya.links[0].href, `<span>Navya on LinkedIn</span>${icon.external}`, 'btn btn-dark')}
    </div>
  </div>
  <div class="wrap ft-top">
    <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'ftr')}<span class="brand-word">NEXARA<b>9</b></span></a>
    <nav class="ft-nav" aria-label="Footer"><a href="/projects/">Projects</a><a href="/ventures/">Ventures</a><a href="/founders/">Founders</a>${ext('https://github.com/sujal128005', 'GitHub')}</nav>
  </div>
  <p class="ft-mark" aria-hidden="true">NEXARA9</p>
  <div class="wrap ft-bottom"><span>© ${new Date().getFullYear()} Nexara9</span><span>Kurnool, India</span></div>
</footer>`;
}

const jumpNav = (items) =>
  `<nav class="jump wrap" aria-label="More">${items.map(([href, label, n]) => `<a href="${href}"><span class="jump-n">${n}</span><span class="jump-t">${label}</span><span class="jump-go">${icon.arrow}</span></a>`).join('')}</nav>`;

const CHEV = '<svg class="chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>';
const cxMeter = (n) => n
  ? `<span class="cx cx-${n}" title="Complexity ${n} of 5: ${complexityLabels[n]}"><span class="cx-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="cx-l"><span class="sr">Complexity: </span>${complexityLabels[n]}</span></span>`
  : '';
const slugify = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function sectionsFor(p) {
  const t = tech[p.slug] || {};
  return [
    ['overview', 'Overview', 'Info'], ['problem', 'Problem and aim', 'Aim'], ['how', 'How it works', 'How'],
    ...(t.arch ? [['architecture', 'Architecture', 'Arch']] : []),
    ...(t.repo ? [['code', 'Languages and code', 'Code']] : []),
    ['method', 'Methodology', 'Plan'], ['stack', 'Technology', 'Tech'], ['demo', 'Demo', 'Demo'],
    ...(p.results ? [['results', 'Results', 'Data']] : []),
    ['learn', 'Concepts', 'Idea'], ['team', 'Team', 'Team'],
  ];
}

// ---------- projects ----------
function peek(p) {
  return p.image
    ? `<span class="peek" aria-hidden="true"><img src="/assets/img/projects/${esc(p.image.src)}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="peek peek-glyph ${catClass(p)}" aria-hidden="true">${glyph(p.glyph)}</span>`;
}

function projectRow(p, i) {
  const langs = tech[p.slug]?.languages?.slice(0, 2).map(([l]) => l).join(', ') || '';
  const dots = p.cats.map((c) => `<i class="dot d-${c}" title="${esc(catLabel(c))}"></i>`).join('');
  const secs = sectionsFor(p);
  return `<li class="row" data-cats="${p.cats.join(' ')}" data-cx="${p.complexity || 0}" data-order="${i}">
  <div class="row-main">
    <span class="r-code">${code(i)}</span>
    <span class="r-thumb ${catClass(p)}" aria-hidden="true">${glyph(p.glyph)}</span>
    <span class="r-namecell"><a class="r-name" href="/projects/${p.slug}/">${esc(p.name)}</a><button type="button" class="r-toggle" aria-expanded="false" aria-controls="secs-${p.slug}" aria-label="Show the sections of ${esc(p.name)}">${CHEV}</button>${cxMeter(p.complexity)}</span>
    <span class="r-desc">${fmt(p.short)}</span>
    <span class="r-stack">${dots}<span>${esc(langs)}</span></span>
    <span class="r-year">${p.year}</span>
    <span class="r-go" aria-hidden="true">${icon.arrow}</span>
    ${peek(p)}
  </div>
  <nav class="r-secs" id="secs-${p.slug}" aria-label="Sections of ${esc(p.name)}" hidden>${secs.map(([id, l], k) => `<a href="/projects/${p.slug}/#${id}"><span>${pad(k + 1)}</span>${l}</a>`).join('')}</nav>
</li>`;
}

function projectsPage() {
  const chips = [{ id: 'all', label: 'All' }, ...categories]
    .map((c, i) => `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="${i === 0}">${c.id === 'all' ? '' : `<i class="dot d-${c.id}"></i>`}${esc(c.label)}</button>`)
    .join('');
  return `${head({ title: 'Projects · Nexara9', description: 'Every open Nexara9 project, with its architecture, code structure, demo and the ideas behind it.', path: '/projects/' })}
<body class="page-projects">
${header('projects')}
<main id="main">
  <section class="wrap title"><h1 class="mega reveal">Projects<sup>${open.length}</sup></h1></section>
  <div class="wrap filterbar">
    <div class="filters" role="group" aria-label="Filter projects">${chips}</div>
    <span class="filter-count" aria-live="polite"></span>
  </div>
  <div class="wrap sortbar">
    <div class="sort" role="group" aria-label="Sort projects"><span class="sort-k">Sort</span><button type="button" class="sort-b" data-sort="order" aria-pressed="true">Built order</button><button type="button" class="sort-b" data-sort="cx" aria-pressed="false">Complexity</button></div>
    <div class="cx-legend" aria-hidden="true">${cxMeter(1)}${cxMeter(3)}${cxMeter(5)}</div>
  </div>
  <div class="wrap index-head" aria-hidden="true"><span>No.</span><span>Project</span><span>What it does</span><span>Built with</span><span>Year</span><span></span></div>
  <ol class="index wrap">${open.map(projectRow).join('\n')}</ol>
</main>
${dock('projects')}
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
  return `${head({ title: 'Ventures · Nexara9', description: 'Limen, Housefi and the Autonomy Program.', path: '/ventures/' })}
<body class="page-ventures">
${header('ventures')}
<main id="main">
  <section class="wrap title"><h1 class="mega reveal">Ventures<sup>${flagships.length}</sup></h1></section>
  <section class="wrap">
    <ul class="venture-grid">${ventureCard(limen, true)}${ventureCard(housefi, true)}</ul>
    <div class="autonomy reveal">
      <div class="autonomy-copy">
        <p class="kicker">The Autonomy Program</p>
        <h2 class="h2">Two machines.<br>One idea.</h2>
        <p class="muted">An autonomous car and an autonomous drone, built to work together.</p>
      </div>
      <ul class="autonomy-pair">${ventureCard(navya)}<li class="autonomy-link" aria-hidden="true"><span></span></li>${ventureCard(navyam)}</ul>
    </div>
    <div class="fund-band reveal">
      <p class="fund-text">Raising pre-seed for <strong>Limen</strong> and <strong>Housefi</strong>.</p>
      <a class="btn btn-gold" ${mailAttrs('Nexara9: pre-seed funding')}>${icon.mail}<span>Talk to the founders</span></a>
    </div>
  </section>
  ${jumpNav([['/projects/', 'Projects', '01'], ['/founders/', 'Founders', '03']])}
</main>
${dock('ventures')}
${footer()}
</body>
</html>
`;
}

// ---------- founders ----------
function foundersPage() {
  const cards = founderProfiles
    .map((f, i) => {
      const p = people[f.key];
      const built = open.filter((x) => x.team.includes(f.key) && !(f.hideProjects || []).includes(x.slug));
      const [first, ...rest] = p.name.split(' ');
      return `<article class="fdr${i % 2 ? ' fdr-flip' : ''}" id="${f.key}">
      <figure class="fdr-photo reveal"><img src="/assets/img/founders/${esc(f.photo)}" alt="${esc(f.photoAlt)}" width="960" height="1200" decoding="async"><figcaption><span>${esc(p.name)}</span><span>${esc(f.role)}</span></figcaption></figure>
      <div class="fdr-info reveal">
        <h2 class="fdr-name">${esc(first)}<br>${esc(rest.join(' '))}</h2>
        <dl class="spec">
          <div><dt>Role</dt><dd>${esc(f.role)}, Nexara9</dd></div>
          <div><dt>Studies</dt><dd>${esc(f.study)}</dd></div>
          <div><dt>College</dt><dd>${esc(f.college)}</dd></div>
          <div><dt>Links</dt><dd class="spec-links">${p.links.map((l) => ext(l.href, `${esc(l.label)}${icon.external}`, 'tlink')).join('')}</dd></div>
        </dl>
        ${f.quote ? `<blockquote class="fdr-quote">${esc(f.quote)}</blockquote>` : ''}
        ${f.bio.map((b) => `<p class="fdr-bio">${fmt(b)}</p>`).join('')}
        ${f.highlights.length ? `<h3 class="sub">Highlights</h3><ol class="hl-list">${f.highlights.map((h) => `<li>${fmt(h)}</li>`).join('')}</ol>` : ''}
        <h3 class="sub">Focus</h3><p class="focus">${f.focus.map(esc).join('<span>/</span>')}</p>
        ${built.length || f.repos ? `<h3 class="sub">Projects</h3><p class="built">${built.map((b) => `<a href="/projects/${b.slug}/">${esc(b.name)}</a>`).join('')}${(f.repos || []).map((r) => ext(r.href, esc(r.name))).join('')}</p>` : ''}
      </div>
    </article>`;
    })
    .join('');
  return `${head({ title: 'Founders · Nexara9', description: 'Sujal Negi and Made Navya, founders of Nexara9.', path: '/founders/' })}
<body class="page-founders">
${header('founders')}
<main id="main">
  <section class="wrap title"><h1 class="mega reveal">Founders<sup>${founderProfiles.length}</sup></h1></section>
  <section class="wrap fdr-list">${cards}</section>
  ${jumpNav([['/projects/', 'Projects', '01'], ['/ventures/', 'Ventures', '02']])}
</main>
${dock('founders')}
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
  if (p.repo) out.push(ext(p.repo, `${icon.github}<span>GitHub</span>${icon.external}`, 'btn btn-outline'));
  return out.join('');
}

function stepsHTML(p) {
  const id = p.slug;
  const tabs = p.steps.map((s, i) => `<li><button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="step-n">${pad(i + 1)}</span><span class="step-t">${esc(s.title)}</span></button></li>`).join('');
  const panels = p.steps.map((s, i) => `<div role="tabpanel" class="step-panel" id="${id}-p${i}" aria-labelledby="${id}-t${i}"${i === 0 ? '' : ' data-inactive'}><p class="step-kicker">${pad(i + 1)} / ${pad(p.steps.length)}</p><h4>${esc(s.title)}</h4><p>${fmt(s.text)}</p></div>`).join('');
  return `<div class="stepper" data-stepper><ol class="step-list" role="tablist" aria-label="How ${esc(p.name)} works">${tabs}</ol><div class="step-panels">${panels}<div class="step-progress" aria-hidden="true"><span></span></div><div class="step-nav"><button type="button" class="btn btn-outline btn-sm" data-step="-1" aria-label="Previous step">${icon.back}</button><button type="button" class="btn btn-outline btn-sm" data-step="1"><span>Next</span>${icon.arrow}</button></div></div></div>`;
}

function archHTML(a) {
  const tiers = a.tiers
    .map((t, i) => `${i ? '<div class="tier-arrow" aria-hidden="true"><span></span></div>' : ''}<div class="tier${t.dashed ? ' tier-dashed' : ''}"><p class="tier-name"><span class="tier-n">${String.fromCharCode(65 + i)}</span>${esc(t.name)}${t.sub ? ` <code>${esc(t.sub)}</code>` : ''}${t.dashed ? ' <span class="tier-flag">planned</span>' : ''}</p><ul>${t.nodes.map(([n, d]) => `<li><strong>${fmt(n)}</strong><span>${fmt(d)}</span></li>`).join('')}</ul></div>`)
    .join('');
  return `<figure class="arch"><figcaption class="arch-title">${esc(a.title)}</figcaption><div class="arch-tiers tiers-${a.tiers.length}">${tiers}</div></figure>
  <h3 class="sub">Request flow</h3>
  <ol class="flow">${a.flow.map((f) => `<li>${fmt(f)}</li>`).join('')}</ol>`;
}

function langHTML(langs) {
  let x = 0;
  const rects = langs.map(([l, pc]) => { const r = `<rect x="${x.toFixed(2)}" y="0" width="${pc.toFixed(2)}" height="10" fill="${langColor[l] || '#999'}"/>`; x += pc; return r; }).join('');
  const legend = langs.map(([l, pc]) => `<li><svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" fill="${langColor[l] || '#999'}"/></svg><span>${esc(l)}</span><span class="pc">${pc.toFixed(1)}%</span></li>`).join('');
  return `<div class="langs"><svg class="lang-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${esc(langs.map(([l, pc]) => `${l} ${pc}%`).join(', '))}">${rects}</svg><ul class="lang-legend">${legend}</ul></div>`;
}

function treeHTML(items, depth = 0) {
  return `<ul class="tree${depth ? '' : ' tree-root'}">${items
    .map(([path, desc, kids]) => {
      const isDir = /\/$/.test(path) || kids;
      const row = `<span class="t-ico ${isDir ? 'dir' : 'file'}" aria-hidden="true"></span><code class="t-path">${esc(path)}</code><span class="t-desc">${fmt(desc)}</span>`;
      const id = depth === 0 ? ` id="repo-${slugify(path)}"` : '';
      return kids
        ? `<li${id}><details${depth === 0 ? ' open' : ''}><summary>${row}</summary>${treeHTML(kids, depth + 1)}</details></li>`
        : `<li${id}><div class="t-row">${row}</div></li>`;
    })
    .join('')}</ul>`;
}

function tableHTML(r) {
  return `<figure class="results"><div class="table-scroll"><table><thead><tr>${r.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><figcaption>${fmt(r.caption)}${r.note ? `<br>${fmt(r.note)}` : ''}</figcaption></figure>`;
}

function demoSection(p) {
  const out = [];
  if (p.demo && !p.demo.inPage) {
    out.push(`<ul class="live">${[p.demo, ...(p.more || [])].map((d) => `<li>${ext(d.href, `<span class="live-l">${esc(d.label)}</span><span class="live-url">${esc(d.href.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span>${icon.external}`, 'live-a')}</li>`).join('')}</ul>`);
  }
  if (p.widget) out.push(`<div class="widget" data-widget="${p.widget}"><noscript><p>Turn on JavaScript to use this demo.</p></noscript></div>`);
  if (p.gallery) {
    out.push(`<div class="gallery">${p.gallery.map((g, i) => `<figure class="shot${i === 0 ? ' shot-wide' : ''}"><img src="/assets/img/projects/${esc(g.src)}" alt="${esc(g.caption)}" loading="lazy" decoding="async"><figcaption>${esc(g.caption)}</figcaption></figure>`).join('')}</div>`);
  }
  return out.join('');
}

function personRow(key) {
  const p = people[key];
  const isFounder = founders.includes(key);
  const links = p.links.map((l) => ext(l.href, `${esc(l.label)}${icon.external}`, 'tlink')).join('');
  return `<li><span class="pr-name">${isFounder ? `<a href="/founders/#${key}">${esc(p.name)}</a>` : esc(p.name)}</span><span class="pr-role">${isFounder ? 'Co-founder, Nexara9' : 'Team member'}</span><span class="pr-links">${links}</span></li>`;
}

function detailPage(p, idx, prev, next) {
  const t = tech[p.slug] || {};
  const sections = sectionsFor(p);
  const num = Object.fromEntries(sections.map(([id], i) => [id, pad(i + 1)]));
  const sec = (id, title, body) => `<section id="${id}" class="sec reveal"><header class="sec-h"><span class="sec-n">${num[id]}</span><h2>${title}</h2></header><div class="sec-b">${body}</div></section>`;
  const visual = p.image
    ? `<img src="/assets/img/projects/${esc(p.image.src)}" alt="${esc(p.image.alt)}" decoding="async">`
    : `<div class="bp ${catClass(p)}" aria-hidden="true"><span class="bp-c bp-tl">${code(idx)}</span><span class="bp-c bp-tr">${p.year}</span><span class="bp-c bp-bl">${esc(p.cats.map(catLabel).join(' · '))}</span><span class="bp-c bp-br">${esc((t.languages || []).map(([l]) => l).slice(0, 2).join(' · '))}</span>${glyph(p.glyph, 'glyph bp-glyph')}</div>`;

  return `${head({ title: `${p.name} · Nexara9`, description: p.short, path: `/projects/${p.slug}/`, scripts: p.widget ? ['demos.js'] : [] })}
<body class="page-detail">
${header('projects')}
<main id="main">
  <section class="wrap d-head">
    <a class="back" href="/projects/">${icon.back}<span>All projects</span></a>
    <p class="d-meta reveal"><span class="r-code">${code(idx)}</span>${p.cats.map((c) => `<span><i class="dot d-${c}"></i>${esc(catLabel(c))}</span>`).join('')}${cxMeter(p.complexity)}</p>
    <h1 class="d-title reveal">${esc(p.name)}</h1>
    <div class="d-intro reveal">
      <p class="d-lead">${fmt(p.short)}</p>
      <div class="actions">${linkButtons(p)}</div>
    </div>
    <dl class="spec spec-row reveal">
      <div><dt>Status</dt><dd>${esc(p.status)}</dd></div>
      <div><dt>Year</dt><dd>${p.year}</dd></div>
      <div><dt>Built for</dt><dd>${esc(p.context)}</dd></div>
      <div><dt>Languages</dt><dd>${esc((t.languages || []).slice(0, 3).map(([l]) => l).join(', ') || '—')}</dd></div>
      <div><dt>Team</dt><dd>${p.team.map((k) => esc(people[k].name)).join(', ')}</dd></div>
    </dl>
  </section>
  <figure class="wrap d-visual reveal">${visual}</figure>

  <div class="wrap d-body">
    <article class="prose">
      ${sec('overview', 'Overview', p.overview.map((x) => `<p>${fmt(x)}</p>`).join(''))}
      ${sec('problem', 'Problem and aim', `<div class="pa-grid"><div class="pa"><h3 class="sub">Problem</h3><p>${fmt(p.problem)}</p></div><div class="pa pa-aim"><h3 class="sub">Aim</h3><p>${fmt(p.aim)}</p></div></div>`)}
      ${sec('how', 'How it works', stepsHTML(p))}
      ${t.arch ? sec('architecture', 'Architecture', archHTML(t.arch)) : ''}
      ${t.repo ? sec('code', 'Languages and code', `${langHTML(t.languages)}<h3 class="sub">Repository</h3>${treeHTML(t.repo)}`) : ''}
      ${sec('method', 'Methodology', `<ol class="method">${p.methodology.map((m) => `<li>${fmt(m)}</li>`).join('')}</ol>`)}
      ${sec('stack', 'Technology', `<div class="stack">${p.stack.map((g) => g.items.map((it, j) => `<div class="st-row"><span class="st-g">${j === 0 ? esc(g.group) : ''}</span><span class="st-n">${esc(it.name)}</span><span class="st-w">${fmt(it.why)}</span></div>`).join('')).join('')}</div>`)}
      ${sec('demo', 'Demo', demoSection(p))}
      ${p.results ? sec('results', 'Results', tableHTML(p.results)) : ''}
      ${sec('learn', 'Concepts', `<div class="learn">${p.learn.map((l, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary><span class="qa-n">${pad(i + 1)}</span><span class="qa-q">${esc(l.q)}</span><span class="qa-x" aria-hidden="true"></span></summary><div class="qa-a"><p>${fmt(l.a)}</p></div></details>`).join('')}</div>`)}
      ${sec('team', 'Team', `<ul class="people">${p.team.map(personRow).join('')}</ul>`)}
    </article>
  </div>

  <nav class="pager wrap" aria-label="More projects">
    ${prev ? `<a class="pager-link" href="/projects/${prev.slug}/"><span class="pager-k">${icon.back}${code(idx - 1)}</span><span class="pager-name">${esc(prev.name)}</span></a>` : '<span></span>'}
    ${next ? `<a class="pager-link pager-next" href="/projects/${next.slug}/"><span class="pager-k">${code(idx + 1)}${icon.arrow}</span><span class="pager-name">${esc(next.name)}</span></a>` : `<a class="pager-link pager-next" href="/projects/"><span class="pager-k">Index${icon.arrow}</span><span class="pager-name">All projects</span></a>`}
  </nav>
</main>
${dock('projects', `<div class="dd dock-dd">
      <button type="button" class="dd-btn dock-menu" aria-expanded="false" aria-controls="dd-sec" aria-label="Sections of this project">${dockIcon.sections}<span class="pbar-cur">${sections[0][2]}</span></button>
      <div class="dd-panel dock-panel" id="dd-sec" hidden>
        <p class="dd-h">${esc(p.name)}</p>
        ${sections.map(([id, l, sh]) => `<a href="#${id}" data-sec="${id}" data-short="${sh}"><span>${num[id]}</span>${l}</a>${id === 'code' && t.repo ? `<div class="dd-sub">${t.repo.map(([path]) => `<a href="#repo-${slugify(path)}" data-repo>${esc(path)}</a>`).join('')}</div>` : ''}`).join('')}
        <p class="dd-h dd-h2">Other projects</p>
        ${open.map((x, k) => `<a class="dd-proj-link" href="/projects/${x.slug}/"${x.slug === p.slug ? ' aria-current="page"' : ''}><span>${code(k)}</span>${esc(x.name)}</a>`).join('')}
      </div>
    </div>
`)}
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
  <h1 class="mega">404</h1>
  <p class="d-lead">This page does not exist.</p>
  <div class="actions"><a class="btn btn-primary" href="/"><span>Home</span>${icon.arrow}</a><a class="btn btn-outline" href="/projects/"><span>Projects</span></a></div>
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
