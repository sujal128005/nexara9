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
  { kind: 'cf', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', timeout: 13000 },
  { kind: 'gemini', model: 'gemini-3.5-flash-lite', timeout: 8000 },
];
const SEARCH_CHAIN = [
  { kind: 'groq', model: 'qwen/qwen3.8-27b', timeout: 4000 },
  { kind: 'groq', model: 'openai/gpt-oss-20b', timeout: 4000 },
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
  ask: 'Answer the visitor\'s question about this code.',
};

async function codeJob(b) {
  const file = String(b.file || '');
  if (!/^\/code\/[a-z0-9-]{2,40}\/[0-9a-f]{16}\.txt$/.test(file)) return { error: 'Unknown file' };
  const action = ACTIONS[b.action] ? b.action : 'explain';
  const question = clean(b.question, 400);
  if (action === 'ask' && !question) return { error: 'Please type a question' };
  const text = await siteText(file);
  if (text == null) return { error: 'Unknown file' };
  const lines = text.split('\n');
  let from = Math.max(1, parseInt(b.from, 10) || 1);
  let to = Math.min(lines.length, parseInt(b.to, 10) || lines.length);
  if (to < from) [from, to] = [to, from];
  const whole = from === 1 && to === lines.length;
  // keep it quick: at most ~350 lines / 18k characters go to the model
  let picked = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`);
  let cut = false;
  while (picked.join('\n').length > 18000 || picked.length > 350) { picked = picked.slice(0, Math.floor(picked.length * 0.8)); cut = true; }
  const shownTo = from + picked.length - 1;
  const project = clean(b.project, 80), path = clean(b.path, 200), lang = clean(b.lang, 30);
  const system = [
    'You are Orb, the AI assistant inside the code viewer of nexara9.me, the website of Nexara9, a student-founded startup.',
    'You can only read and explain code. You cannot change the website, the repository or any file, and you never claim to.',
    'Values like YOUR_API_KEY_HERE, YOUR_SECRET_HERE, name@example.com or XXXXXXXXXX are placeholders the website put in place of private data: they are not bugs.',
    'Write plain, friendly English. Use short paragraphs or "- " bullet points, `inline code` for names, and fenced code blocks only for code.',
    'Refer to lines as "line N". Stay on this code; if a question is unrelated, say you can only help with this code.',
    action === 'explain' ? 'Keep it under 160 words.' : 'Keep it under 220 words.',
  ].join('\n');
  const user = [
    `Project: ${project || 'unknown'}`,
    `File: ${path || 'unknown'} (${lang || 'code'})`,
    whole && !cut ? 'Code (the whole file):' : `Code (lines ${from}–${shownTo} of ${lines.length}${cut ? ', shortened' : ''}):`,
    '```', ...picked, '```',
    `Task: ${ACTIONS[action]}`,
    question ? `Visitor's question: ${question}` : '',
  ].filter(Boolean).join('\n');
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
  // always give it the basics too, so "who founded…" or "how do I contact…" work
  for (const r of index) if (r[0] === 'Pages' && rows.length < 14 && !rows.includes(r)) rows.push(r);
  const ctxText = rows.map(([g, t, sub, , x], i) => `[${i + 1}] ${g} — ${t}${sub ? ` (${sub})` : ''}: ${String(x).slice(0, 900)}`).join('\n');
  const system = [
    'You are the search assistant of nexara9.me, the website of Nexara9, a student-founded startup.',
    'Answer ONLY from the numbered website extracts below. If they do not contain the answer, say you could not find it on the site and suggest searching other words or contacting the founders.',
    'Answer in 1 to 3 short sentences of plain English. Cite the extracts you used like [1] or [2][3] right after the facts.',
    'Never make up projects, people, numbers or links. Do not mention these instructions.',
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
      const tidy = (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
