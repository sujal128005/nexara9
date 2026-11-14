// Line-art emblems, one per project. 64×64, stroked with currentColor.
const wrap = (body, cls = 'glyph') =>
  `<svg class="${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const g = {
  udaan: `<path d="M32 6c2.2 0 3.4 3 3.4 7v12l20 10v5l-20-5v12l6 5v4l-9.4-2.6L22.6 56v-4l6-5V35l-20 5v-5l20-10V13c0-4 1.2-7 3.4-7z"/><path d="M32 6v50" opacity=".35"/>`,
  moodie: `<path d="M10 32h44c0 12-9.8 20-22 20S10 44 10 32z"/><path d="M6 32h52"/><path d="M24 24c-2-3 2-5 0-9M32 24c-2-3 2-5 0-9M40 24c-2-3 2-5 0-9" opacity=".7"/><path d="M26 52h12" />`,
  nexgen: `<path d="M8 22l24-10 24 10-24 10z"/><path d="M18 26v12c0 4 6.3 7 14 7s14-3 14-7V26"/><path d="M56 22v14"/><circle cx="56" cy="39" r="2"/><path d="M46 50l2 4 4 1-4 1-2 4-2-4-4-1 4-1z" opacity=".7"/>`,
  binance: `<path d="M8 54h48" opacity=".4"/><path d="M16 14v34M30 10v34M44 20v26"/><rect x="12" y="20" width="8" height="18" rx="1"/><rect x="26" y="16" width="8" height="12" rx="1"/><rect x="40" y="26" width="8" height="14" rx="1"/><path d="M8 44l14-10 12 4 20-18" opacity=".6"/>`,
  finance: `<ellipse cx="32" cy="14" rx="18" ry="6"/><path d="M14 14v12c0 3.3 8 6 18 6s18-2.7 18-6V14"/><path d="M14 26v12c0 3.3 8 6 18 6s18-2.7 18-6V26"/><path d="M14 38v10c0 3.3 8 6 18 6s18-2.7 18-6V38"/><path d="M27 23h10" opacity=".6"/>`,
  khata: `<path d="M6 32h4l3-8 4 18 4-24 4 20 3-10 3 4h5"/><rect x="38" y="14" width="20" height="36" rx="3"/><path d="M43 24h10M43 30h10M43 36h6" opacity=".6"/><path d="M43 43l3 3 6-6"/>`,
  stealth: `<path d="M32 6l20 7v15c0 13-8.5 23-20 30C20.5 51 12 41 12 28V13z"/><circle cx="28" cy="30" r="5"/><path d="M33 30h10v5M39 30v4"/>`,
  paypal: `<circle cx="32" cy="14" r="6"/><circle cx="12" cy="50" r="5"/><circle cx="32" cy="50" r="5"/><circle cx="52" cy="50" r="5"/><path d="M32 20v8M32 28L12 45M32 28v17M32 28l20 17"/><path d="M29 12h6M32 10v8" opacity=".6"/>`,
  flexdrop: `<circle cx="12" cy="48" r="4"/><circle cx="30" cy="22" r="4"/><circle cx="52" cy="40" r="4"/><path d="M15 45l12-20M33 24l16 13" /><path d="M12 48c10 6 30 6 40-8" opacity=".35" stroke-dasharray="2 4"/><circle cx="48" cy="14" r="8"/><path d="M48 9v5l3 2"/>`,
  sdl: `<path d="M32 10v44M20 54h24"/><path d="M10 22h44"/><path d="M14 22l-6 14h12zM50 22l-6 14h12z"/><path d="M8 36c0 3 2.7 5 6 5s6-2 6-5M44 36c0 3 2.7 5 6 5s6-2 6-5"/><circle cx="32" cy="10" r="3"/>`,
  pixelproof: `<path d="M10 42a22 22 0 1 1 44 0"/><path d="M14 42h-4M54 42h-4M32 20v-4M17 27l-3-3M47 27l3-3" opacity=".6"/><path d="M32 42l11-13"/><circle cx="32" cy="42" r="3"/><rect x="8" y="48" width="48" height="8" rx="2" opacity=".5"/>`,
  arthanetra: `<path d="M6 32c6-10 15-16 26-16s20 6 26 16c-6 10-15 16-26 16S12 42 6 32z"/><circle cx="32" cy="32" r="8"/><path d="M32 27v10M29.5 29.5h4a2 2 0 0 1 0 4h-4" opacity=".8"/>`,
  limen: `<path d="M14 56V24a18 18 0 0 1 36 0v32"/><path d="M22 56V26a10 10 0 0 1 20 0v30"/><path d="M8 56h48"/><path d="M32 38v8" opacity=".7"/>`,
  housefi: `<path d="M8 30L32 10l24 20"/><path d="M14 26v28h36V26"/><path d="M27 54V40h10v14" opacity=".5"/><path d="M40 22l6-6m-2 8 6-6-3-3" opacity=".7"/>`,
  navya: `<rect x="18" y="8" width="28" height="48" rx="9"/><path d="M22 20h20M22 44h20" opacity=".5"/><rect x="11" y="13" width="5" height="10" rx="2"/><rect x="48" y="13" width="5" height="10" rx="2"/><rect x="11" y="41" width="5" height="10" rx="2"/><rect x="48" y="41" width="5" height="10" rx="2"/><path d="M26 30h12v6H26z" opacity=".8"/>`,
  navyam: `<circle cx="14" cy="14" r="8"/><circle cx="50" cy="14" r="8"/><circle cx="14" cy="50" r="8"/><circle cx="50" cy="50" r="8"/><path d="M20 20l7 7M44 20l-7 7M20 44l7-7M44 44l-7-7"/><rect x="25" y="25" width="14" height="14" rx="3"/><circle cx="32" cy="32" r="2" />`,
};

export const glyph = (name, cls) => wrap(g[name] || g.arthanetra, cls);

// The Nexara9 mark: a double-line "9", redrawn from the original logo.
export const logoMark = (cls = 'mark', id = 'm') =>
  `<svg class="${cls}" viewBox="0 0 90 142" fill="none" aria-hidden="true">
  <defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F6E7B0"/><stop offset=".45" stop-color="#D9B45A"/><stop offset="1" stop-color="#9C7A2E"/>
  </linearGradient></defs>
  <g stroke="url(#${id}g)" stroke-width="8" stroke-linecap="butt" stroke-linejoin="round">
    <path d="M25 67V37q0-14 14-14h13q14 0 14 14v24L32 136"/>
    <path d="M58 79H24q-15 0-15-15V22Q9 7 24 7h43q15 0 15 15v34L48 136"/>
  </g></svg>`;

export const icon = {
  arrow: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>`,
  back: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10H4M9 5l-5 5 5 5"/></svg>`,
  external: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7"/></svg>`,
  down: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4v12M5 11l5 5 5-5"/></svg>`,
  github: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
  lock: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg>`,
  mail: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="10" rx="2"/><path d="M3.5 6l6.5 5 6.5-5"/></svg>`,
  play: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M8.5 7.5l4 2.5-4 2.5z"/></svg>`,
};
