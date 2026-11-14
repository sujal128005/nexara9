# Nexara9 · nexara9.me

**Many ventures. One golden standard.**

The website of Nexara9: a home page, a Projects page, a Flagship ventures page, a Founders page,
and one page per open project that explains the problem, how it works, the architecture, the
languages and repository structure, the methodology, the technology, a live or interactive demo
and the concepts behind it. Inside pages are light by default, with a dark-mode switch.

Live at [nexara9.me](https://nexara9.me), served by GitHub Pages from the `main` branch.

## Change the words

Every word on the site is in **`src/content.mjs`** (projects, team members, founders, links,
flagship ventures, tagline, contact email) and **`src/tech.mjs`** (each project's languages,
architecture diagram and repository walkthrough). Edit them, then rebuild:

```bash
node src/build.mjs
```

This regenerates `index.html`, `projects/`, `404.html`, `sitemap.xml` and the other generated files.
Commit everything and push; GitHub Pages publishes it in about a minute.

- **Add a project:** copy one entry in `projects`, change the `slug` (it becomes the web address),
  and fill in the fields. Pick an emblem with `glyph` (see `src/glyphs.mjs`).
- **Add a person:** add them to `people`, then use their key in a project's `team`.
- **Flagship ventures** (`flagships`) show only a short line and have no page of their own on purpose.

## Preview on your computer

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## What's where

| Path | What |
|---|---|
| `src/content.mjs` | All content |
| `src/tech.mjs` | Languages, architecture and repository walkthrough per project |
| `src/build.mjs` | Turns content into pages |
| `src/glyphs.mjs` | Logo and project emblems (SVG) |
| `assets/css/main.css` | Home page design |
| `assets/css/site.css` | Inside pages design (light and dark themes) |
| `assets/js/theme.js` | Applies the saved theme before the page appears |
| `assets/js/main.js` | Menu, filters, step-by-step viewer, scroll effects |
| `assets/js/home.js` | The home page starfield |
| `assets/js/demos.js` | Interactive demos on project pages |
| `assets/fonts/` | Self-hosted fonts (Instrument Serif, Geist, Geist Mono; SIL Open Font Licence) |
| `assets/img/projects/` | Project images |
| `CNAME` | The custom domain. Do not delete it. |

## Security

- No third-party scripts, fonts, trackers, cookies or forms. Every file is served from this site.
- A strict Content Security Policy on every page allows scripts, styles, fonts and images from this
  site only, and blocks all network requests from page scripts.
- External links open with `rel="noopener noreferrer"`. The page refuses to run inside another
  site's frame.
- The contact email is assembled by script, so it is not sitting in the HTML for scrapers.
- `/.well-known/security.txt` tells researchers how to report a problem.
- In **Settings → Pages**, keep **Enforce HTTPS** switched on.
