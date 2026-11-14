// Builds the static site from src/content.mjs into the repository root.
// Usage: node src/build.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, people, founders, categories, flagships, projects } from './content.mjs';
import { glyph, logoMark, icon } from './glyphs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '20261114'; // cache-busting version for CSS/JS

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

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

function head({ title, description, path, scripts = [] }) {
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
<meta name="theme-color" content="#0a0907">
<meta name="color-scheme" content="dark">
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
<link rel="preload" href="/assets/fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/main.css?v=${V}">
<script src="/assets/js/main.js?v=${V}" defer></script>
${scripts.map((s) => `<script src="/assets/js/${s}?v=${V}" defer></script>`).join('\n')}
</head>`;
}

function header(active = '') {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'hdr')}<span class="brand-word">NEXARA<b>9</b></span></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr">Menu</span><i></i><i></i></button>
  <nav id="site-nav" class="site-nav" aria-label="Main">
    ${link('/projects/', 'Projects', 'projects')}
    ${link('/projects/#ventures', 'Ventures', 'ventures')}
    <a class="nav-cta" ${mailAttrs('Hello Nexara9')}>Contact</a>
  </nav>
</header>`;
}

function personHTML(key, { compact = false } = {}) {
  const p = people[key];
  const links = p.links
    .map((l) => ext(l.href, `${esc(l.label)}${icon.external}`, 'chip-link'))
    .join('');
  return `<li class="person${compact ? ' compact' : ''}"><span class="person-name">${esc(p.name)}</span>${links ? `<span class="person-links">${links}</span>` : ''}</li>`;
}

function footer() {
  const f = founders.map((k) => personHTML(k)).join('');
  return `<footer class="site-footer" id="contact">
  <div class="foot-cta">
    <p class="eyebrow">Work with us</p>
    <h2 class="display-sm">Back a Nexara9 venture, or build the next one with us.</h2>
    <a class="btn btn-gold" ${mailAttrs('Hello Nexara9')}>${icon.mail}<span>Write to us</span></a>
  </div>
  <div class="foot-grid">
    <div>
      <a class="brand" href="/" aria-label="Nexara9 home">${logoMark('brand-mark', 'ftr')}<span class="brand-word">NEXARA<b>9</b></span></a>
      <p class="muted small">${esc(site.tagline)}</p>
    </div>
    <div>
      <p class="label">Founders</p>
      <ul class="people">${f}</ul>
    </div>
    <div>
      <p class="label">Explore</p>
      <ul class="foot-links"><li><a href="/projects/">All projects</a></li><li><a href="/projects/#ventures">Flagship ventures</a></li><li>${ext('https://github.com/sujal128005', 'GitHub')}</li></ul>
    </div>
  </div>
  <p class="legal">© ${new Date().getFullYear()} Nexara9. All projects shown were designed and built by the Nexara9 team.</p>
</footer>`;
}

// ---------- pages ----------
function homePage() {
  const total = projects.length + flagships.length;
  return `${head({ title: 'Nexara9 · Many ventures. One golden standard.', description: site.description, path: '/', scripts: ['home.js'] })}
<body class="page-home">
<canvas id="sky" aria-hidden="true"></canvas>
<div class="home">
${header('home')}
<main id="main" class="home-main">
  <div class="home-copy">
    <p class="eyebrow reveal"><span class="pulse"></span>A house of ventures<span class="hide-sm">&nbsp;· Building since ${site.since}</span></p>
    <h1 class="display reveal">Many ventures.<br><em class="gold-text">One golden standard.</em></h1>
    <p class="lead reveal">Nexara9 is the company we are building: one name over many projects, from autonomous machines and AI agents to apps people use every day. Every one of them is designed, built and shipped by us.</p>
    <div class="cta-row reveal">
      <a class="btn btn-gold" href="/projects/"><span>Explore the projects</span>${icon.arrow}</a>
      <a class="btn btn-ghost" href="/projects/#ventures"><span>Flagship ventures</span></a>
    </div>
  </div>
  <div class="home-emblem" aria-hidden="true">
    <div class="orbit">
      <svg class="orbit-ring" viewBox="0 0 400 400" fill="none">
        <circle cx="200" cy="200" r="196" stroke="currentColor" stroke-opacity=".18"/>
        <circle cx="200" cy="200" r="150" stroke="currentColor" stroke-opacity=".10" stroke-dasharray="2 6"/>
        ${Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
          const x = (200 + Math.cos(a) * 196).toFixed(1);
          const y = (200 + Math.sin(a) * 196).toFixed(1);
          return `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor"/>`;
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
  <p class="founders">Founded by ${founders
    .map((k) => {
      const p = people[k];
      const l = p.links.find((x) => x.label === 'LinkedIn') || p.links[0];
      return l ? ext(l.href, esc(p.name), 'u-link') : esc(p.name);
    })
    .join(' &amp; ')}</p>
</footer>
</div>
</body>
</html>
`;
}

function projectCard(p, i) {
  const tags = p.cats.map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join('');
  const inner = `
    <div class="card-top">
      <span class="card-index">${pad(i + 1)}</span>
      <span class="card-year">${p.year}</span>
    </div>
    <div class="card-glyph">${glyph(p.glyph)}</div>
    <h3 class="card-title">${esc(p.name)}</h3>
    <p class="card-text">${fmt(p.short)}</p>
    <div class="card-foot">
      <div class="tags">${tags || '<span class="tag tag-soft">In the lab</span>'}</div>
      ${p.comingSoon ? '<span class="soon">Soon</span>' : `<span class="card-go" aria-hidden="true">${icon.arrow}</span>`}
    </div>`;
  const cats = p.cats.join(' ');
  if (p.comingSoon) {
    return `<li class="card card-soon reveal" data-cats="${cats}"><div class="card-body">${inner}</div></li>`;
  }
  return `<li class="card reveal" data-cats="${cats}"><a class="card-body" href="/projects/${p.slug}/" aria-label="${esc(p.name)}: ${esc(p.short)}">${inner}</a></li>`;
}

function flagshipCard(f) {
  return `<li class="venture venture-${f.id} reveal">
    <div class="venture-head">
      <span class="venture-kind">${esc(f.kind)}</span>
      <span class="venture-lock">${icon.lock}<span>Private</span></span>
    </div>
    <div class="venture-glyph">${glyph(f.glyph)}</div>
    <h3 class="venture-name">${esc(f.name)}</h3>
    <p class="venture-line">${esc(f.line)}</p>
    <p class="venture-badge">${esc(f.badge)}</p>
    ${
      f.funding
        ? `<a class="btn btn-gold btn-sm" ${mailAttrs(`${f.name}: funding enquiry`)}>${icon.mail}<span>Fund ${esc(f.name)}</span></a>`
        : ''
    }
  </li>`;
}

function projectsPage() {
  const [limen, housefi, navya, navyam] = flagships;
  const chips = [{ id: 'all', label: 'All' }, ...categories]
    .map(
      (c, i) =>
        `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="${i === 0}">${esc(c.label)}</button>`,
    )
    .join('');
  return `${head({
    title: 'Projects · Nexara9',
    description: 'Every Nexara9 project: what it is, how it works, the technology behind it and what it taught us.',
    path: '/projects/',
  })}
<body class="page-projects">
${header('projects')}
<main id="main">
  <section class="page-hero wrap">
    <p class="eyebrow reveal">The portfolio</p>
    <h1 class="display-md reveal">Everything we have built, <em class="gold-text">and what it taught us.</em></h1>
    <p class="lead reveal">Open any project to see the problem, how it works, the technology and the ideas behind it. Our flagship ventures stay private until they are ready.</p>
  </section>

  <section class="ventures wrap" id="ventures" aria-labelledby="ventures-title">
    <div class="section-head reveal">
      <p class="eyebrow">Flagship ventures</p>
      <h2 class="h2" id="ventures-title">The work we are betting on.</h2>
      <p class="muted">These are kept deliberately quiet. We share more with partners and investors.</p>
    </div>
    <ul class="venture-grid">
      ${flagshipCard(limen)}
      ${flagshipCard(housefi)}
    </ul>
    <div class="autonomy reveal">
      <div class="autonomy-copy">
        <p class="eyebrow">The Autonomy Program</p>
        <h3 class="h3">Two machines. <em class="gold-text">One idea.</em></h3>
        <p class="muted">An autonomous car and an autonomous drone, designed to work together. What they will do together is something we will reveal when it is ready.</p>
      </div>
      <ul class="autonomy-pair">
        ${flagshipCard(navya)}
        <li class="autonomy-link" aria-hidden="true"><span></span></li>
        ${flagshipCard(navyam)}
      </ul>
    </div>
    <div class="fund-band reveal">
      <div>
        <p class="eyebrow">Pre-seed</p>
        <p class="fund-text">We are raising for <strong>Limen</strong> and <strong>Housefi</strong>. If you would like to back us, we would love to talk.</p>
      </div>
      <a class="btn btn-gold" ${mailAttrs('Nexara9: pre-seed funding')}>${icon.mail}<span>Talk to the founders</span></a>
    </div>
  </section>

  <section class="open wrap" aria-labelledby="open-title">
    <div class="section-head reveal">
      <p class="eyebrow">Open projects</p>
      <h2 class="h2" id="open-title">Built in public. Explained in full.</h2>
    </div>
    <div class="filters" role="group" aria-label="Filter projects">${chips}<span class="filter-count" aria-live="polite"></span></div>
    <ul class="card-grid">
      ${projects.map(projectCard).join('\n')}
    </ul>
  </section>
</main>
${footer()}
</body>
</html>
`;
}

function linkButtons(p) {
  const out = [];
  if (p.demo?.inPage) {
    out.push(`<a class="btn btn-gold" href="#demo">${icon.play}<span>${esc(p.demo.label)}</span></a>`);
  } else if (p.demo) {
    out.push(ext(p.demo.href, `${icon.play}<span>${esc(p.demo.label)}</span>${icon.external}`, 'btn btn-gold'));
  }
  if (p.repo) out.push(ext(p.repo, `${icon.github}<span>View code on GitHub</span>${icon.external}`, 'btn btn-ghost'));
  return out.join('');
}

function stepsHTML(p) {
  const id = p.slug;
  const tabs = p.steps
    .map(
      (s, i) =>
        `<li><button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="step-n">${pad(i + 1)}</span><span class="step-t">${esc(s.title)}</span></button></li>`,
    )
    .join('');
  const panels = p.steps
    .map(
      (s, i) =>
        `<div role="tabpanel" class="step-panel" id="${id}-p${i}" aria-labelledby="${id}-t${i}"${i === 0 ? '' : ' data-inactive'}><p class="step-kicker">Step ${i + 1} of ${p.steps.length}</p><h4>${esc(s.title)}</h4><p>${fmt(s.text)}</p></div>`,
    )
    .join('');
  return `<div class="stepper" data-stepper><ol class="step-list" role="tablist" aria-label="How ${esc(p.name)} works">${tabs}</ol><div class="step-panels">${panels}<div class="step-nav"><button type="button" class="btn btn-ghost btn-sm" data-step="-1">${icon.back}<span>Previous</span></button><button type="button" class="btn btn-ghost btn-sm" data-step="1"><span>Next step</span>${icon.arrow}</button></div></div></div>`;
}

function tableHTML(r) {
  return `<figure class="results"><div class="table-scroll"><table><thead><tr>${r.head
    .map((h) => `<th scope="col">${esc(h)}</th>`)
    .join('')}</tr></thead><tbody>${r.rows
    .map((row) => `<tr>${row.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div><figcaption>${fmt(r.caption)}${r.note ? `<br><span class="muted">${fmt(r.note)}</span>` : ''}</figcaption></figure>`;
}

function demoSection(p) {
  const blocks = [];
  if (p.widget) {
    blocks.push(`<div class="widget" data-widget="${p.widget}"><noscript><p class="muted">Turn on JavaScript to use this interactive demo.</p></noscript></div>`);
  }
  if (p.gallery) {
    blocks.push(`<div class="gallery">${p.gallery
      .map(
        (g, i) =>
          `<figure class="shot${i === 0 ? ' shot-wide' : ''}"><img src="/assets/img/projects/${esc(g.src)}" alt="${esc(g.caption)}" loading="lazy" decoding="async"><figcaption>${esc(g.caption)}</figcaption></figure>`,
      )
      .join('')}</div>`);
  }
  const live = p.demo && !p.demo.inPage
    ? `<div class="live-card">
        <div><p class="label">Hosted demo</p><p class="live-url">${esc(p.demo.href.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p></div>
        ${ext(p.demo.href, `<span>Open ${esc(p.demo.label.toLowerCase())}</span>${icon.external}`, 'btn btn-gold btn-sm')}
      </div>`
    : '';
  const runIt = p.demo?.inPage
    ? `<p class="muted small">This project runs on your own machine, not on a website. The demo above shows how it behaves; the full instructions to run it are in the ${ext(p.repo, 'GitHub repository', 'u-link')}.</p>`
    : '';
  return `${live}${blocks.join('')}${runIt}`;
}

function detailPage(p, idx, prev, next) {
  const team = p.team.map((k) => personHTML(k)).join('');
  const toc = [
    ['overview', 'Overview'],
    ['problem', 'Problem and aim'],
    ['how', 'How it works'],
    ['method', 'Methodology'],
    ['stack', 'Technology'],
    ['demo', 'Demo'],
    ...(p.results ? [['results', 'Results']] : []),
    ['learn', 'Learn the concepts'],
    ['team', 'Team'],
  ];
  const tags = p.cats.map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join('');
  const visual = p.image
    ? `<figure class="hero-shot"><img src="/assets/img/projects/${esc(p.image.src)}" alt="${esc(p.image.alt)}" decoding="async"></figure>`
    : `<div class="hero-glyph" aria-hidden="true">${glyph(p.glyph, 'glyph glyph-xl')}<span class="hero-index">${pad(idx + 1)}</span></div>`;

  return `${head({
    title: `${p.name} · Nexara9`,
    description: p.short,
    path: `/projects/${p.slug}/`,
    scripts: p.widget ? ['demos.js'] : [],
  })}
<body class="page-detail">
${header('projects')}
<main id="main">
  <section class="detail-hero wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/projects/">${icon.back}<span>All projects</span></a></nav>
    <div class="detail-hero-grid">
      <div>
        <p class="eyebrow reveal">Project ${pad(idx + 1)} · ${p.year}</p>
        <h1 class="display-md reveal">${esc(p.name)}</h1>
        <p class="lead reveal">${fmt(p.short)}</p>
        <div class="tags reveal">${tags}<span class="tag tag-context">${esc(p.context)}</span></div>
        <div class="cta-row reveal">${linkButtons(p)}</div>
      </div>
      <div class="reveal">${visual}</div>
    </div>
    <dl class="facts reveal">
      <div><dt>Status</dt><dd>${esc(p.status)}</dd></div>
      <div><dt>Year</dt><dd>${p.year}</dd></div>
      <div><dt>Built for</dt><dd>${esc(p.context)}</dd></div>
      <div><dt>Team</dt><dd>${p.team.map((k) => esc(people[k].name)).join(', ')}</dd></div>
    </dl>
  </section>

  <div class="detail-body wrap">
    <aside class="toc" aria-label="On this page">
      <p class="label">On this page</p>
      <ol>${toc.map(([id, l]) => `<li><a href="#${id}">${l}</a></li>`).join('')}</ol>
    </aside>
    <article class="prose">
      <section id="overview" class="block reveal">
        <h2 class="h2">Overview</h2>
        ${p.overview.map((t) => `<p>${fmt(t)}</p>`).join('')}
      </section>

      <section id="problem" class="block reveal">
        <div class="pa-grid">
          <div class="pa"><p class="label">The problem</p><p>${fmt(p.problem)}</p></div>
          <div class="pa pa-aim"><p class="label">The aim</p><p>${fmt(p.aim)}</p></div>
        </div>
      </section>

      <section id="how" class="block reveal">
        <h2 class="h2">How it works</h2>
        <p class="muted">Step through the pipeline. Use the tabs, or the arrow keys once a tab is focused.</p>
        ${stepsHTML(p)}
      </section>

      <section id="method" class="block reveal">
        <h2 class="h2">Methodology</h2>
        <ol class="method">${p.methodology.map((m) => `<li><p>${fmt(m)}</p></li>`).join('')}</ol>
      </section>

      <section id="stack" class="block reveal">
        <h2 class="h2">Technology</h2>
        <div class="stack">${p.stack
          .map(
            (g) =>
              `<div class="stack-group"><p class="label">${esc(g.group)}</p><ul>${g.items
                .map((it) => `<li><span class="stack-name">${esc(it.name)}</span><span class="stack-why">${fmt(it.why)}</span></li>`)
                .join('')}</ul></div>`,
          )
          .join('')}</div>
      </section>

      <section id="demo" class="block reveal">
        <h2 class="h2">Demo</h2>
        ${demoSection(p)}
      </section>

      ${p.results ? `<section id="results" class="block reveal"><h2 class="h2">Results</h2>${tableHTML(p.results)}</section>` : ''}

      <section id="learn" class="block reveal">
        <h2 class="h2">Learn the concepts</h2>
        <p class="muted">The ideas this project is built on, in plain words.</p>
        <div class="learn">${p.learn
          .map(
            (l, i) =>
              `<details class="qa"${i === 0 ? ' open' : ''}><summary><span class="qa-n">${pad(i + 1)}</span><span class="qa-q">${esc(l.q)}</span><span class="qa-x" aria-hidden="true"></span></summary><div class="qa-a"><p>${fmt(l.a)}</p></div></details>`,
          )
          .join('')}</div>
      </section>

      <section id="team" class="block reveal">
        <h2 class="h2">Team</h2>
        <ul class="people people-lg">${team}</ul>
      </section>
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
  <h1 class="display-md">This page is <em class="gold-text">off the map.</em></h1>
  <p class="lead">The link may be old, or the page may have moved.</p>
  <div class="cta-row"><a class="btn btn-gold" href="/"><span>Go home</span>${icon.arrow}</a><a class="btn btn-ghost" href="/projects/"><span>See all projects</span></a></div>
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

const open = projects.filter((p) => !p.comingSoon);

// remove old generated project folders
const projDir = join(ROOT, 'projects');
if (existsSync(projDir)) rmSync(projDir, { recursive: true });

write('index.html', homePage());
write('projects/index.html', projectsPage());
open.forEach((p, i) =>
  write(`projects/${p.slug}/index.html`, detailPage(p, projects.indexOf(p), open[i - 1], open[i + 1])),
);
write('404.html', notFoundPage());

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
const urls = ['/', '/projects/', ...open.map((p) => `/projects/${p.slug}/`)];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${site.url}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
write(
  'site.webmanifest',
  JSON.stringify(
    {
      name: 'Nexara9',
      short_name: 'Nexara9',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0907',
      theme_color: '#0a0907',
      icons: [
        { src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ) + '\n',
);
const expires = new Date(Date.now() + 365 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
write(
  '.well-known/security.txt',
  `Contact: mailto:${site.email}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${site.url}/.well-known/security.txt\n`,
);
console.log(`Built ${urls.length} pages + 404 into ${ROOT}`);
