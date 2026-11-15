// Records the PixelProof demo video: a scripted "laptop screen recording" with a visible cursor.
// Usage: node demo/record.js <outdir> [countSeed]     (Studio must be running on http://127.0.0.1:8765)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || 'demo/out';
const COUNT_SEED = process.argv[3] || '3';
const BASE = 'http://127.0.0.1:8765';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  const mark = (label) => { marks.push({ t: +((Date.now() - t0) / 1000).toFixed(1), label }); console.log(marks.at(-1)); };
  await page.goto('file://' + path.resolve(__dirname, 'desktop.html'));
  let cx = 960, cy = 540;
  async function moveTo(x, y, speed = 1) {
    const d = Math.hypot(x - cx, y - cy);
    const ms = Math.max(320, Math.min(1100, d * 0.85)) / speed;
    await page.evaluate(([x, y, ms]) => desk.move(x, y, ms), [x, y, ms]);
    cx = x; cy = y;
    await sleep(ms + 60);
  }
  const F = () => page.frameLocator('#frame');
  const frame = () => page.frames().find((f) => f.url().startsWith(BASE));
  async function center(loc) { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; }
  async function click(loc, pause = 350) {
    const [x, y] = await center(loc);
    await moveTo(x, y);
    await sleep(120);
    await page.evaluate(([x, y]) => desk.click(x, y), [x, y]);
    await loc.click();
    await sleep(pause);
  }
  async function hover(loc, hold = 700) { const [x, y] = await center(loc); await moveTo(x, y); await sleep(hold); }
  async function scrollTo(y, ms = 900) {
    await frame().evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
    await sleep(ms);
  }
  async function scrollToSel(sel, offset = 20, ms = 1100) {
    const y = await frame().evaluate(([sel, off]) => {
      const e = typeof sel === 'string' && sel.startsWith('h2:') ?
        [...document.querySelectorAll('h2')].find((h) => h.textContent.includes(sel.slice(3))) : document.querySelector(sel);
      return e ? e.getBoundingClientRect().top + window.scrollY - off : 0;
    }, [sel, offset]);
    await scrollTo(y, ms);
  }

  // ---------------------------------------------------------------- scene 1: terminal
  mark('terminal');
  await sleep(900);
  await page.evaluate(() => term.prompt());
  const cmd = 'Expand-Archive -Path "$HOME\\Downloads\\PixelProof.zip" -DestinationPath "$HOME\\PixelProof" -Force; Set-Location "$HOME\\PixelProof\\pixelproof"; .\\run_local.bat';
  for (const ch of cmd) { await page.evaluate((c) => term.type(c), ch); await sleep(ch === ' ' ? 32 : 18); }
  await sleep(450);
  await page.evaluate(() => term.enter());
  const outLines = [
    ['Creating virtual environment...', 500], ['Running the test-suite (every family x level must produce verified twins)...', 600],
    ['<span class=dim>......</span>', 900], ['----------------------------------------------------------------------', 80],
    ['Ran 6 tests in 24.1s', 200], ['', 0], ['<span class=ok>OK</span>', 600],
    ['Auditing the demo dataset (re-deriving every answer from pixels)...', 700],
    ['{', 40], ['  "ok": <span class=ok>240</span>,', 40], ['  "bad": <span class=ok>0</span>,', 600],
    ['GROQ_API_KEY found: the "Ask model" button will query qwen/qwen3.8-27b on Groq.', 400],
    ['PixelProof Studio on <span class=url>http://127.0.0.1:8765</span>  (model: groq:qwen/qwen3.8-27b)', 120],
    ['Findings report on <span class=url>http://127.0.0.1:8765/report</span>', 120], ['Press Ctrl+C to stop.', 1300],
  ];
  for (const [l, w] of outLines) { await page.evaluate((l) => term.line(l), l); await sleep(w); }

  // ---------------------------------------------------------------- scene 2: studio overview
  await page.evaluate((u) => desk.showBrowser(u), BASE + '/');
  mark('studio-open');
  await sleep(2600);
  await hover(F().locator('.stat').nth(0), 500);
  await hover(F().locator('.stat.ok'), 1100);
  await hover(F().locator('.fam[data-f=gauge]'), 500);
  await hover(F().locator('.fam[data-f=maze]'), 500);
  await hover(F().locator('#lv button[data-l="4"]'), 600);
  await hover(F().locator('.q'), 900);
  await scrollToSel('.pair', 90, 1200);
  await hover(F().locator('.truth').nth(0), 900);
  await hover(F().locator('.truth').nth(1), 900);
  await scrollTo(0, 900);

  // ---------------------------------------------------------------- scene 3: maze twins + highlight
  mark('maze');
  await click(F().locator('.fam[data-f=maze]'));
  await click(F().locator('#lv button[data-l="2"]'));
  await click(F().locator('#go'), 1300);
  await hover(F().locator('.change'), 1200);
  await click(F().locator('#hl'), 700);
  await scrollToSel('.pair', 90, 1200);
  await hover(F().locator('img.tw').nth(0), 1300);
  await hover(F().locator('.truth').nth(0), 800);
  await hover(F().locator('.truth').nth(1), 1400);
  await scrollTo(0, 900);

  // ---------------------------------------------------------------- scene 4: wires
  mark('wires');
  await click(F().locator('.fam[data-f=wires]'));
  await click(F().locator('#lv button[data-l="3"]'));
  await click(F().locator('#go'), 1300);
  await scrollToSel('.pair', 90, 1200);
  await hover(F().locator('img.tw').nth(0), 1500);
  await hover(F().locator('img.tw').nth(1), 1500);
  await scrollTo(0, 900);

  // ---------------------------------------------------------------- scene 5: counting + ask model
  mark('count-ask');
  await click(F().locator('.fam[data-f=count]'));
  await click(F().locator('#lv button[data-l="0"]'));
  await click(F().locator('#hl'), 300); // highlight off for a clean view
  const seed = F().locator('#seed');
  await click(seed, 200);
  await seed.fill('');
  for (const ch of COUNT_SEED) { await seed.type(ch); await sleep(120); }
  await click(F().locator('#go'), 1300);
  await click(F().locator('#ask'), 300);
  await frame().waitForSelector('.ans.bad, .ans.ok:not([style*="chip"])', { timeout: 120000 });
  await sleep(500);
  await scrollToSel('.pair', 90, 1200);
  await hover(F().locator('.truth').nth(0), 800);
  await hover(F().locator('.ans').nth(0), 1200);
  await hover(F().locator('.ans').nth(1), 1200);
  await click(F().locator('.ans summary').nth(0), 600);
  await scrollToSel('.ans', 200, 900);
  await sleep(2200);
  await scrollTo(0, 900);

  // ---------------------------------------------------------------- scene 6: findings report
  mark('report');
  const [rx, ry] = await center(F().locator('#replink'));
  await moveTo(rx, ry); await sleep(150);
  await page.evaluate(([x, y]) => desk.click(x, y), [rx, ry]);
  await page.evaluate((u) => { desk.tab2(); desk.url('127.0.0.1:8765/report'); document.getElementById('frame').src = u; }, BASE + '/report');
  await sleep(1800);
  await moveTo(1500, 520, 0.8);
  await sleep(1200);
  await scrollToSel('h2:Model scorecard', 30, 1300);
  await sleep(2600);
  await scrollToSel('h2:Where', 30, 1300);
  await sleep(3200);
  await scrollToSel('h2:Difficulty curves', 30, 1300);
  await sleep(2600);
  await scrollToSel('h2:Validity gauntlet', 30, 1300);
  await sleep(2600);
  await scrollToSel('h2:Failure gallery', 30, 1300);
  await sleep(3200);
  await scrollToSel('h2:Honest limitations', 30, 1300);
  await sleep(2200);
  await scrollTo(0, 1200);
  mark('end');
  await sleep(2500);
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  const v = page.video();
  await ctx.close();
  await browser.close();
  console.log('video', await v.path());
})();
