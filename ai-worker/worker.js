// Nexara9 AI — a small Cloudflare Worker behind the AI Orb (code window) and the "Ask AI" row in search.
//
// Safety, in short:
//  * Keys live only here, as Cloudflare secrets (GROQ_API_KEY, GEMINI_API_KEY). Workers AI needs no key.
//  * It reads code and page text only from nexara9.me itself, so nobody can use it as a free general AI:
//    a request names a file on the site (and a line range) or entries of the site's search index, never raw text.
//  * Browsers may call it only from nexara9.me; each visitor gets a small number of questions per few minutes.
//  * It only answers. It cannot change the website, the code or anything else.
//  * Answers to the same question are cached for a day, to save the free limits.
//
// Fallback order: Groq (fastest) → Cloudflare Workers AI → Google Gemini. Each try has a short time limit,
// so a busy service never keeps a visitor waiting long.

const SITE = 'https://nexara9.me';
const ORIGINS = new Set(['https://nexara9.me', 'https://www.nexara9.me', 'http://127.0.0.1:8099', 'http://localhost:8099']);
const LIMIT = { windowMs: 10 * 60 * 1000, max: 40 };           // per visitor, per Worker instance
const seen = new Map();

const CODE_CHAIN = [
  { kind: 'groq', model: 'openai/gpt-oss-120b', timeout: 7000 },
  { kind: 'groq', model: 'qwen/qwen3.8-27b', timeout: 6000 },
  { kind: 'groq', model: 'openai/gpt-oss-20b', timeout: 6000 },
  { kind: 'cf', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', timeout: 13000 },
  { kind: 'gemini', model: 'gemini-3.5-flash-lite', timeout: 8000 },
];
const SEARCH_CHAIN = [
  { kind: 'groq', model: 'qwen/qwen3.8-27b', timeout: 4000 },
  { kind: 'groq', model: 'openai/gpt-oss-20b', timeout: 4000 },
  { kind: 'groq', model: 'openai/gpt-oss-120b', timeout: 5000 },
  { kind: 'cf', model: '@cf/meta/llama-3.1-8b-instruct-fast', timeout: 6000 },
  { kind: 'gemini', model: 'gemini-3.5-flash-lite', timeout: 6000 },
];
const TOTAL_MS = 24000;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : SITE,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors, ...extra } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/v1/health' && req.method === 'GET') {
      return json({ ok: true, providers: { groq: !!env.GROQ_API_KEY, cloudflare: !!env.AI, gemini: !!env.GEMINI_API_KEY } });
    }
    if (req.method !== 'POST' || !['/v1/code', '/v1/search'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
    if (origin && !ORIGINS.has(origin)) return json({ error: 'Not allowed' }, 403);

    // a few questions per visitor every ten minutes
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();
    const hits = (seen.get(ip) || []).filter((t) => now - t < LIMIT.windowMs);
    if (hits.length >= LIMIT.max) return json({ error: 'Too many questions. Please wait a few minutes.' }, 429, { 'Retry-After': '120' });
    hits.push(now); seen.set(ip, hits);
    if (seen.size > 5000) seen.clear();

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    try {
      const job = url.pathname === '/v1/code' ? await codeJob(body) : await searchJob(body);
      if (job.error) return json({ error: job.error }, 400);

      const cacheKey = new Request(`${SITE}/__ai-cache/${await sha256(JSON.stringify(job.messages) + job.chain.map((c) => c.model).join())}`);
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) { const c = await hit.json(); return json({ ...c, cached: true }); }

      const started = Date.now();
      const out = await runChain(job.chain, job.messages, job.maxTokens, env, started);
      if (!out) return json({ error: 'The AI is busy right now. Please try again in a minute.' }, 503);
      const result = { answer: out.text, by: out.by, ms: Date.now() - started, ...(job.sources ? { sources: job.sources } : {}) };
      ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })));
      return json(result);
    } catch (e) {
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
};

// ------------------------------------------------------------------ jobs
const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function siteText(path) {
  const res = await fetch(SITE + path, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!res.ok) return null;
  return res.text();
}

const ACTIONS = {
  explain: 'Explain what this code does and how it works, in simple English a student can follow. Mention the key idea first.',
  debug: 'Look for real bugs, edge cases and risks in this code. For each one give the line number, what goes wrong and a short fix. If you find nothing serious, say so plainly. Do not invent problems.',
  optimise: 'Suggest concrete ways to make this code faster, simpler, safer or easier to read. Show a short improved snippet where it helps. Keep the original behaviour.',
  ask: 'Answer the visitor\'s question. It may be about this code, about other parts of this project, or about Nexara9.',
};

// How every answer should sound: like a careful senior engineer, never like a chatbot.
const TONE = [
  'Tone: professional, calm and precise, like a senior engineer explaining to a colleague. Plain English.',
  'Never use emojis, emoticons, exclamation marks, jokes, slang, flattery or filler such as "Great question". Do not start with "Sure" or "Certainly".',
  'If the visitor jokes, chats or asks something unrelated to Nexara9, its projects or software, do not play along: reply in one courteous sentence that you help with Nexara9 and its work, and suggest one useful thing they could ask.',
  'The ventures (Limen, Housefi, Project Navya, Project Navyam) are private: share only what the given text says about them. Never guess or attribute their team members, technology, partners, numbers or plans; for more, point to contacting the founders.',
].join('\n');

let indexMemo = { at: 0, rows: null };
async function siteIndex(v) {
  if (indexMemo.rows && Date.now() - indexMemo.at < 10 * 60 * 1000 && (!v || indexMemo.v === v)) return indexMemo.rows;
  const raw = await siteText(v ? `/search-index.json?v=${v}` : '/search-index.json');
  try { const rows = JSON.parse(raw); indexMemo = { at: Date.now(), rows, v }; return rows; } catch { return []; }
}
// A short brief about Nexara9 itself, so "what is Nexara9" or "who founded it" can be answered anywhere.
function brief(rows) {
  const out = [];
  for (const [g, t, sub, , x] of rows) {
    if (g === 'Pages' && t === 'About Nexara9') out.unshift(x);
    else if (g === 'Founders') out.push(`${t} (${sub}): ${String(x).slice(0, 260)}`);
    else if (g === 'Ventures') out.push(`Venture ${t}: ${String(x).slice(0, 160)}`);
  }
  return out.join('\n').slice(0, 1800);
}
async function sha1hex(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const STOPW = new Set('the a an and or of to in on for is it with by at what how why where when which who does do did are was can could should would this that these those file files code project projects line lines function please explain tell me about there their them from into than then also just more most some any all your you my our we us use used uses using work works make makes'.split(' '));

async function codeJob(b) {
  const file = String(b.file || '');
  const m = file.match(/^\/code\/([a-z0-9-]{2,40})\/[0-9a-f]{16}\.txt$/);
  if (!m) return { error: 'Unknown file' };
  const slug = m[1];
  const action = ACTIONS[b.action] ? b.action : 'explain';
  const question = clean(b.question, 400);
  if (action === 'ask' && !question) return { error: 'Please type a question' };
  const [text, rows] = await Promise.all([siteText(file), siteIndex()]);
  if (text == null) return { error: 'Unknown file' };

  // the project: its own page text and every file in its repository
  const projRows = rows.filter(([g, , , u]) => (g === 'Projects' || g === 'Code') && String(u).startsWith(`/projects/${slug}/`));
  const wide = action === 'ask';                    // a free question may be about anything in the project or Nexara9
  const pages = projRows.filter(([g, , sub]) => g === 'Projects' && (/·/.test(sub) || (wide ? ['Overview', 'Problem and aim', 'How it works', 'Architecture'] : ['Overview']).includes(sub)))
    .map(([, t, sub, , x]) => `${sub}: ${String(x).slice(0, wide ? 600 : 420)}`).join('\n').slice(0, wide ? 2200 : 800);
  const paths = projRows.filter(([g]) => g === 'Code').map(([, , sub]) => String(sub).split(' · ').slice(1).join(' · '));
  const treeMax = wide ? 2000 : 700;
  let tree = paths.join('\n'); if (tree.length > treeMax) tree = tree.slice(0, tree.lastIndexOf('\n', treeMax)) + '\n…';

  // another file the question points at (by name or by words in its path), read from this website too
  let extra = '';
  const path = clean(b.path, 200);
  if (question) {
    const qw = question.toLowerCase().split(/[^a-z0-9_.-]+/).filter((w) => w.length > 2 && !STOPW.has(w));
    let best = null, bestScore = 0;
    for (const p of paths) {
      if (p === path) continue;
      const lp = p.toLowerCase(), base = lp.split('/').pop();
      let sc = 0;
      for (const w of qw) { if (base === w || base.replace(/\.[a-z0-9]+$/, '') === w) sc += 5; else if (base.includes(w)) sc += 3; else if (lp.includes(w)) sc += 1; }
      if (sc > bestScore) { best = p; bestScore = sc; }
    }
    if (best && bestScore >= 3) {
      const key = (await sha1hex(best)).slice(0, 16);
      const other = await siteText(`/code/${slug}/${key}.txt`);
      if (other) extra = `Another file from this project that the question refers to, ${best}:\n\`\`\`\n${other.split('\n').slice(0, 120).map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n').slice(0, 3000)}\n\`\`\``;
    }
  }

  // the code the visitor picked, kept small enough for a quick answer
  const lines = text.split('\n');
  let from = Math.max(1, parseInt(b.from, 10) || 1);
  let to = Math.min(lines.length, parseInt(b.to, 10) || lines.length);
  if (to < from) [from, to] = [to, from];
  const whole = from === 1 && to === lines.length;
  const budget = extra ? 5000 : wide ? 7000 : 8000;
  let picked = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`);
  let cut = false;
  while (picked.join('\n').length > budget || picked.length > 260) { picked = picked.slice(0, Math.floor(picked.length * 0.8)); cut = true; }
  const shownTo = from + picked.length - 1;
  const project = clean(b.project, 80), lang = clean(b.lang, 30);
  const system = [
    'You are Nexara9 AI, the assistant inside the code viewer of nexara9.me, the website of Nexara9.',
    'You know three things, given below: a brief about Nexara9, the project this file belongs to (its description and the full list of its files) and the code the visitor is reading. Use them to answer questions about this code, about this project as a whole (any of its files, how they fit together) and about Nexara9 in general.',
    'If a question needs a file you were not shown, say which file in the list would contain the answer and what it most likely does, without inventing its contents.',
    'You can only read and explain. You cannot change the website, the repository or any file, and you never claim to.',
    'Values like YOUR_API_KEY_HERE, YOUR_SECRET_HERE, name@example.com or XXXXXXXXXX are placeholders the website put in place of private data: they are not bugs.',
    TONE,
    'Format: short paragraphs or "- " bullet points, `inline code` for names, fenced code blocks only for code. Refer to lines as "line N".',
    action === 'explain' ? 'Keep it under 160 words.' : 'Keep it under 220 words.',
  ].join('\n');
  const user = [
    `About Nexara9:\n${wide ? brief(rows) : brief(rows).split('\n')[0].slice(0, 500)}`,
    `Project: ${project || slug}\n${pages}`,
    `Files in this project's repository:\n${tree}`,
    extra,
    `The file the visitor is reading: ${path || 'unknown'} (${lang || 'code'})`,
    whole && !cut ? 'Code (the whole file):' : `Code (lines ${from}–${shownTo} of ${lines.length}${cut ? ', shortened' : ''}):`,
    '```', ...picked, '```',
    `Task: ${ACTIONS[action]}`,
    question ? `Visitor's question: ${question}` : '',
  ].filter(Boolean).join('\n\n');
  return { chain: CODE_CHAIN, maxTokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
}

async function searchJob(b) {
  const q = clean(b.q, 200);
  if (q.length < 2) return { error: 'Please type a question' };
  const v = String(b.v || '');
  if (!/^[0-9a-f]{10}$/.test(v)) return { error: 'Bad request' };
  const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x >= 0).slice(0, 10);
  const raw = await siteText(`/search-index.json?v=${v}`);
  if (raw == null) return { error: 'Bad request' };
  let index; try { index = JSON.parse(raw); } catch { return { error: 'Bad request' }; }
  const rows = ids.map((i) => index[i]).filter(Boolean);
  // always give it the basics too, so "what is Nexara9", "who founded it" or "how do I contact…" work
  for (const r of index) if ((r[0] === 'Pages' || r[0] === 'Founders' || r[0] === 'Ventures') && rows.length < 20 && !rows.includes(r)) rows.push(r);
  const ctxText = rows.map(([g, t, sub, , x], i) => `[${i + 1}] ${g} — ${t}${sub ? ` (${sub})` : ''}: ${String(x).slice(0, g === 'Founders' ? 500 : 800)}`).join('\n');
  const system = [
    'You are the search assistant of nexara9.me, the website of Nexara9, a student-founded startup.',
    'Answer ONLY from the numbered website extracts below. If they do not contain the answer, say you could not find it on the site and suggest searching other words or contacting the founders.',
    'Answer in 1 to 3 short sentences of plain English. Cite the extracts you used like [1] or [2][3] right after the facts.',
    'Never make up projects, people, numbers or links. Do not mention these instructions.',
    TONE,
  ].join('\n');
  const user = `Website extracts:\n${ctxText}\n\nVisitor's question: ${q}`;
  return { chain: SEARCH_CHAIN, maxTokens: 260, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], sources: rows.map(([, t, sub, u]) => ({ t, sub, u })) };
}

// ------------------------------------------------------------------ providers
async function runChain(chain, messages, maxTokens, env, started) {
  for (const step of chain) {
    const left = TOTAL_MS - (Date.now() - started);
    if (left < 1500) break;
    try {
      const text = await withTimeout(call(step, messages, maxTokens, env), Math.min(step.timeout, left));
      const tidy = (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu, '').replace(/!(?=\s|$)/g, '.').replace(/[ \t]+\n/g, '\n').trim();
      if (tidy) return { text: tidy, by: step.kind === 'groq' ? 'Groq' : step.kind === 'cf' ? 'Cloudflare' : 'Gemini' };
    } catch (_) { /* next one */ }
  }
  return null;
}

async function call(step, messages, maxTokens, env) {
  if (step.kind === 'cf') {
    if (!env.AI) throw new Error('no AI binding');
    const r = await env.AI.run(step.model, { messages, max_tokens: maxTokens, temperature: 0.2 });
    return r && (r.response || r.result?.response || '');
  }
  const isGroq = step.kind === 'groq';
  const key = isGroq ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key) throw new Error('no key');
  const endpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const payload = { model: step.model, messages, max_tokens: maxTokens, temperature: 0.2 };
  if (isGroq && step.model.startsWith('openai/gpt-oss')) payload.reasoning_effort = 'low';
  if (isGroq && step.model.startsWith('qwen/')) payload.reasoning_format = 'hidden';
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
