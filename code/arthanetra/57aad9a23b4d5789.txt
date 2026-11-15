/* ArthaNetra front end. Plain JavaScript, no build step. Every visible string goes through t(). */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const API = window.ARTHANETRA_API || "";

const state = { tab: "samples", sample: null, file: null, result: null, base: null, health: null, lang: "en", S: {}, samples: [] };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (v, d = 0) => v == null || isNaN(v) ? "-" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: d });
const pct = (v, d) => {
  if (v == null || isNaN(v)) return "-";
  const x = v * 100;
  const dd = d ?? (Math.abs(x) >= 100 ? 0 : 1);
  return x.toLocaleString("en-IN", { maximumFractionDigits: dd, minimumFractionDigits: dd }) + "%";
};

/* ------------------------------------------------------------------ translation */
function t(key, p = {}) {
  const s = state.S[key];
  if (s == null) return key;
  return s.replace(/\{([a-z_]+)\}/g, (m, k) => {
    const v = p[k];
    if (v == null) return m;
    if (Array.isArray(v)) {
      const names = v.map((x) => state.S["perm." + x] || x);
      return names.length > 1 ? names.slice(0, -1).join(", ") + " " + (state.S["list.and"] || "and") + " " + names[names.length - 1] : names.join("");
    }
    return String(v);
  });
}
const span = (d) => d == null ? "-" : d < 62 ? t("unit.days", { n: Math.round(d) }) : d < 730 ? t("unit.months", { n: Math.round(d / 30.4167) }) : t("unit.years", { n: (d / 365).toFixed(1) });
const TTS = { en: "en-IN", hi: "hi-IN", hinglish: "en-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN", mr: "mr-IN", kn: "kn-IN", gu: "gu-IN", ml: "ml-IN", pa: "pa-IN", or: "or-IN" };
const BAND_COLOR = { Fair: "#30d158", Caution: "#ffb340", Risky: "#ff7a1a", Predatory: "#ff3b30" };

async function loadStrings(lang) {
  try { state.S = await api("/api/i18n/" + lang); state.lang = lang; }
  catch (_) { if (!Object.keys(state.S).length) { state.S = await api("/api/i18n/en"); state.lang = "en"; } }
  document.documentElement.lang = lang === "hinglish" ? "hi-Latn" : lang;
}
function applyStatic() {
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#footer-disclaimer").textContent = t("footer.disclaimer", { rp: state.health?.rule_pack || "IN-2026.11" });
  renderEnginePill();
  renderSamples();
}

const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  bolt: ICON('<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6l1-8z"/>'),
  phone: ICON('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  card: ICON('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>'),
  chat: ICON('<path d="M20.5 11.5a8 8 0 01-11.8 7L3.5 20l1.4-4.6A8 8 0 1120.5 11.5z"/>'),
  home: ICON('<path d="M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5.5h4V20"/>'),
  scooter: ICON('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-2-8h-3M13 9l1.5-3H17M15 17l2-5"/>'),
  check: ICON('<path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6l7-3z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>'),
};

async function api(path, opts = {}) {
  const r = await fetch(API + path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch (_) { /* not JSON */ }
    throw new Error(typeof msg === "string" ? msg : "Something went wrong. Please try again.");
  }
  return r.json();
}

/* ------------------------------------------------------------------ start */
function renderEnginePill() {
  const e = state.health?.engine;
  $("#engine-pill").textContent = !e ? t("engine.down") : e.provider === "offline" ? t("engine.offline")
    : t("engine.ai", { provider: e.provider === "groq" ? "Groq" : "Gemini", model: e.model.split("/").pop() });
}
function renderSamples() {
  const sel = $(".sample.sel")?.dataset.id;
  $("#samples").innerHTML = state.samples.map((s) => `
    <button class="sample${s.id === sel ? " sel" : ""}" data-id="${esc(s.id)}">
      ${ICONS[s.icon] || ICONS.card}
      <span class="t">${esc(t(`sample.${s.id}.title`))}</span>
      <span class="s">${esc(t(`sample.${s.id}.subtitle`))}</span>
      <span class="c">${esc(t(`sample.${s.id}.category`))}</span>
    </button>`).join("");
  $$(".sample").forEach((b) => b.addEventListener("click", async () => {
    $$(".sample").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
    const s = await api("/api/samples/" + b.dataset.id);
    state.sample = s.text;
    $("#doc").value = s.text;
    run();
  }));
}

async function boot() {
  let lang = "en";
  try { lang = localStorage.getItem("an-lang") || "en"; } catch (_) { /* storage blocked */ }
  $("#lang").value = lang;
  try { state.health = await api("/api/health"); } catch (_) { state.health = null; }
  try { state.samples = await api("/api/samples"); } catch (_) { state.samples = []; }
  await loadStrings(lang);
  applyStatic();
}

/* ------------------------------------------------------------------ language switch */
$("#lang").addEventListener("change", async () => {
  const lang = $("#lang").value;
  try { localStorage.setItem("an-lang", lang); } catch (_) { /* ignore */ }
  await loadStrings(lang);
  applyStatic();
  const r = state.result;
  if (!r) return;
  render(r, { keepSim: true });
  $("#explain-body").innerHTML = `<p class="lead">${esc(t("ex.translating"))}</p>`;
  try {
    const out = await api("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: r, document_text: r.document_text, language: lang }) });
    if (state.lang !== lang) return; // switched again meanwhile
    r.explanation = out;
    renderVerdict(r);
    renderExplain(r);
  } catch (e) { renderExplain(r); }
});

/* ------------------------------------------------------------------ input */
$$(".seg").forEach((tab) => tab.addEventListener("click", () => {
  $$(".seg").forEach((x) => { x.classList.toggle("active", x === tab); x.setAttribute("aria-selected", x === tab); });
  state.tab = tab.dataset.tab;
  $$(".tab-body").forEach((b) => b.classList.toggle("hidden", b.dataset.body !== state.tab));
}));
const drop = $("#drop");
$("#file").addEventListener("change", (e) => setFile(e.target.files[0]));
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
function setFile(f) { state.file = f || null; $("#file-name").textContent = f ? `${f.name}, ${(f.size / 1024).toFixed(0)} KB` : ""; }
$("#go").addEventListener("click", run);

/* ------------------------------------------------------------------ analysis */
let timer = null;
function progressStart() {
  let i = 1;
  $("#progress").classList.remove("hidden");
  $("#progress-bar").style.width = "6%";
  $("#progress-text").textContent = t("step.1");
  timer = setInterval(() => {
    i = Math.min(i + 1, 7);
    $("#progress-text").textContent = t("step." + i);
    $("#progress-bar").style.width = `${Math.min(92, 6 + (i - 1) * 14)}%`;
  }, 950);
}
function progressStop() { clearInterval(timer); $("#progress-bar").style.width = "100%"; setTimeout(() => $("#progress").classList.add("hidden"), 250); }

async function run() {
  const fd = new FormData();
  if (state.tab === "upload" && state.file) fd.append("file", state.file);
  else {
    const text = state.tab === "samples" ? (state.sample || $("#doc").value) : $("#doc").value;
    if (!text || text.trim().length < 20) { showError(t("err.empty")); return; }
    fd.append("text", text);
  }
  fd.append("language", state.lang);
  fd.append("benchmark", $("#benchmark").value || "7.1");
  fd.append("offline", $("#offline").checked ? "true" : "false");
  $("#error").classList.add("hidden");
  $("#results").classList.add("hidden");
  $("#go").disabled = true;
  progressStart();
  try {
    const r = await api("/api/analyze", { method: "POST", body: fd });
    progressStop();
    state.result = r;
    render(r);
    $("#results").classList.remove("hidden");
    setTimeout(() => $("#results").scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  } catch (e) {
    progressStop();
    showError(e.message);
  } finally { $("#go").disabled = false; }
}
function showError(m) { const el = $("#error"); el.textContent = m; el.classList.remove("hidden"); }

/* ------------------------------------------------------------------ render */
function render(r, opts = {}) {
  renderVerdict(r); renderTruth(r); renderMoney(r); renderFindings(r); renderProof(r);
  renderSim(r, opts.keepSim); renderExplain(r); renderAsk(r, opts.keepSim); renderMethod(r);
}

function ringSVG(score, band) {
  const R = 84, C = 2 * Math.PI * R, len = Math.max(0.5, score) / 100 * C;
  return `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#efeff4" stroke-width="18"/>
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="${BAND_COLOR[band]}" stroke-width="18" stroke-linecap="round"
      stroke-dasharray="${len} ${C}" transform="rotate(-90 100 100)">
      <animate attributeName="stroke-dasharray" from="0 ${C}" to="${len} ${C}" dur="0.9s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></circle>
    <text x="100" y="106" text-anchor="middle" font-size="60" font-weight="700" fill="#1d1d1f" letter-spacing="-2">${score}</text>
    <text x="100" y="134" text-anchor="middle" font-size="14" font-weight="500" fill="#86868b">${esc(t("verdict.score"))}</text>`;
}

function renderVerdict(r) {
  const s = r.score;
  $("#ring").innerHTML = ringSVG(s.score, s.band);
  $("#band").className = "band " + s.band;
  $("#band").textContent = t("band." + s.band) + ".";
  $("#headline").textContent = r.explanation?.headline || t("advice." + s.band);
  $("#advice").textContent = t("advice." + s.band);
  const masked = Object.values(r.privacy?.redactions || {}).reduce((a, b) => a + b, 0);
  const meta = [t("product." + r.product_type), r.facts.provider,
    r.evidence_score != null && t("verdict.verified", { pct: Math.round(r.evidence_score * 100) }),
    masked && t("verdict.masked", { n: masked })];
  $("#meta").innerHTML = meta.filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
}

function card(label, num, cls, note) {
  return `<div class="compare-card"><p class="compare-label">${esc(label)}</p><p class="compare-num ${cls}">${esc(num)}</p><p class="compare-note">${esc(note)}</p></div>`;
}
function fact(label, value) { return `<div class="fact"><b>${esc(value)}</b>${esc(label)}</div>`; }

function renderTruth(r) {
  const c = r.computed, d = r.score.dgi, f = r.facts;
  let html = "", facts = [];
  if (c.kind === "investment") {
    $("#truth-title").textContent = t("res.truth_title_inv");
    const claimed = f.claimed_return != null;
    html = card(t("truth.claims"), claimed ? pct(f.claimed_return) : t("truth.double"), "shown", claimed ? t("truth.claim_note") : t("truth.double_note")) +
      card(t("truth.earn"), pct(c.irr, 2), c.irr >= c.benchmark_rate ? "good" : "bad", t("truth.earn_note"));
    facts = [fact(t("truth.pay_in"), inr(c.total_premium)), fact(t("truth.get"), inr(c.maturity_benefit)),
      fact(t("truth.same_money", { rate: pct(c.benchmark_rate) }), inr(c.benchmark_maturity))];
  } else {
    $("#truth-title").textContent = t("res.truth_title");
    const isCard = c.kind === "credit_card";
    const shownNote = isCard ? t("truth.card_note") : (f.advertised_claim || "");
    const good = (c.apr ?? 0) < 0.16 || (d && Math.abs(d.gap_pp) < 1);
    html = card(isCard ? t("truth.card_show") : t("truth.show"), d ? pct(d.shown) : t("truth.not_stated"), "shown", d ? shownNote : t("truth.no_rate")) +
      card(t("truth.pay"), pct(c.apr), good ? "good" : "bad", t("truth.pay_note"));
    if (d && Math.abs(d.gap_pp) >= 0.5) facts.push(fact(t("fact.points"), (d.gap_pp > 0 ? "+" : "") + d.gap_pp.toLocaleString("en-IN", { maximumFractionDigits: 1 })));
    if (d && d.ratio && d.ratio > 1.2) facts.push(fact(t("fact.times"), d.ratio.toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "x"));
    if (c.ear != null && c.ear - (c.apr ?? 0) > 0.02) facts.push(fact(t("fact.compounded"), pct(c.ear)));
    if (c.implied_reducing_rate && f.rate_method === "flat") facts.push(fact(t("fact.flat", { rate: pct(c.implied_reducing_rate) }), pct(f.stated_rate)));
    if (isCard && c.years_to_repay) facts.push(fact(t("fact.card_years"), t("unit.years", { n: c.years_to_repay })));
  }
  $("#truth").innerHTML = html + (facts.length ? `<div class="compare-facts">${facts.join("")}</div>` : "");
}

function stats(c) {
  if (c.kind === "investment") return [[t("stat.pay_in"), inr(c.total_premium)], [t("stat.get_back"), inr(c.maturity_benefit)],
    [t("stat.multiple"), (c.money_multiple ?? 0).toFixed(2) + "x"], [t("stat.lost"), inr(c.opportunity_loss), c.opportunity_loss > 0 ? "bad" : "good"]];
  if (c.kind === "credit_card") return [[t("stat.spent"), inr(c.net_received)], [t("stat.min_pay"), inr(c.total_paid), "bad"],
    [t("stat.clear"), c.years_to_repay ? t("unit.years", { n: c.years_to_repay }) : t("unit.never"), "bad"], [t("stat.int_gst"), inr(c.interest_total + c.gst_total), "bad"]];
  return [[t("stat.in_account"), inr(c.net_received)], [t("stat.repay"), inr(c.total_paid)],
    [t("stat.cost"), inr(c.cost_of_credit), c.cost_of_credit > 0 ? "bad" : "good"], [t("stat.over"), span(c.tenure_days)]];
}
const bdLabel = (b) => b.key ? t(b.key, b.params || {}) : b.label;

function chartSVG(flows) {
  if (!flows?.length) return "";
  const W = 1000, H = 200, pad = 6, mid = 100;
  const maxDay = Math.max(...flows.map((f) => f.day), 1);
  const maxAbs = Math.max(...flows.map((f) => Math.abs(f.amount)), 1);
  const bw = Math.max(3, Math.min(30, (W - 2 * pad) / flows.length * 0.62));
  const bars = flows.map((f) => {
    const x = pad + (f.day / maxDay) * (W - 2 * pad - bw);
    const h = Math.max(2, Math.abs(f.amount) / maxAbs * 78);
    const y = f.amount >= 0 ? mid - h : mid;
    const col = f.amount >= 0 ? "#34c759" : f.kind === "fee" ? "#ff3b30" : "#ff9f0a";
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2)}" fill="${col}"><title>${f.amount >= 0 ? "+" : "-"}${inr(Math.abs(f.amount), 2)}</title></rect>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t("chart.title"))}">
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="#d2d2d7" stroke-width="1"/>${bars}</svg>
    <div class="legend"><span>${esc(t("chart.day0"))}</span><span style="margin-left:auto">${esc(span(maxDay))}</span></div>`;
}

function renderMoney(r) {
  const c = r.computed;
  const parts = (c.breakdown || []).filter((p) => p.amount > 0);
  const total = parts.reduce((a, p) => a + p.amount, 0) || 1;
  $("#money").innerHTML = `
    <div class="stats">${stats(c).map(([k, v, cls]) => `<div><p class="stat-label">${esc(k)}</p><p class="stat-value ${cls || ""}">${esc(v)}</p></div>`).join("")}</div>
    <div class="bar">${parts.map((p) => `<span class="k-${p.kind}" style="width:${(p.amount / total * 100).toFixed(2)}%" title="${esc(bdLabel(p))}: ${inr(p.amount)}"></span>`).join("")}</div>
    <div class="legend">${parts.map((p) => `<span><i class="dot k-${p.kind}"></i>${esc(bdLabel(p))}<b>${inr(p.amount)}</b></span>`).join("")}</div>
    <div class="chart"><p class="chart-title">${esc(t("chart.title"))}</p><p class="stat-label">${esc(t("chart.sub"))}</p>${chartSVG(c.flows)}</div>`;
}

const findingText = (f) => f.msg_key ? t(f.msg_key, f.params || {}) : f.explanation;

function renderFindings(r) {
  const issues = r.findings.filter((f) => f.severity !== "good").length;
  $("#findings-title").textContent = issues ? t("res.findings_title") : t("res.findings_none_title");
  $("#rulepack").textContent = issues ? t("rules.count", { n: issues, rp: r.rule_pack }) : t("rules.none", { rp: r.rule_pack });
  $("#findings").innerHTML = r.findings.length ? r.findings.map((f) => `
    <div class="finding">
      <span class="sev ${f.severity}">${esc(t("sev." + f.severity))}</span>
      <h3>${esc(t("rule." + f.rule_id))}</h3>
      <p>${esc(findingText(f))}</p>
      <p class="cite">${esc(t("finding.source", { cite: f.citation }))}</p>
      ${f.evidence ? `<p class="quote">${esc(t("finding.from_doc"))} "${esc(f.evidence)}" <button data-q="${esc(f.evidence)}">${esc(t("finding.show"))}</button></p>` : ""}
    </div>`).join("") : `<div class="finding"><p>${esc(t("finding.nothing"))}</p></div>`;
  $$("#findings .quote button").forEach((b) => b.addEventListener("click", () => jumpTo(b.dataset.q)));
  const pats = r.patterns || [];
  $("#patterns").innerHTML = pats.length ? `<div class="patterns"><h3>${esc(t("patterns.title"))}</h3><div class="pills">` +
    pats.map((p) => `<span class="pill" title="${esc(p.key ? t("pat." + p.key + ".why") : p.why)}"><b>${esc(p.key ? t("pat." + p.key + ".name") : p.category)}</b>${esc(p.phrase)}</span>`).join("") + `</div></div>` : "";
}

function renderProof(r) {
  const rows = (r.fields || []).filter((x) => !(x.status === "inferred" || String(x.value).toLowerCase() === "unknown"));
  const counted = rows.filter((x) => x.status !== "inferred");
  const ok = counted.filter((x) => x.status === "verified").length;
  const cons = r.consensus;
  let summary = t("proof.summary", { ok, n: counted.length });
  if (cons && cons.agree.length) summary += " " + t("proof.agree", { n: cons.agree.length });
  if (counted.some((x) => x.status === "unverified")) summary += " " + t("proof.dropped");
  $("#evidence-summary").textContent = summary;
  $("#ledger").innerHTML = `<table>${rows.map((x) => `
    <tr data-q="${esc(x.quote || "")}"><td><div class="lbl">${esc(x.key === "fee" ? x.label : t("field." + x.key))}</div>${x.quote ? `<div class="q">"${esc(x.quote)}"</div>` : ""}</td>
    <td class="v">${esc(x.value)}</td><td class="status ${x.status}">${esc(t("status." + x.status))}</td></tr>`).join("")}</table>`;
  $$("#ledger tr").forEach((tr) => tr.addEventListener("click", () => tr.dataset.q && jumpTo(tr.dataset.q)));

  const text = r.document_text || "", low = text.toLowerCase(), ranges = [];
  const add = (q, cls) => { if (!q || q.length < 3) return; const i = low.indexOf(q.toLowerCase().trim()); if (i >= 0) ranges.push([i, i + q.trim().length, cls]); };
  rows.forEach((f) => add(f.quote, "ev"));
  r.findings.forEach((f) => add(f.evidence, "ev"));
  (r.patterns || []).forEach((p) => ranges.push([p.start, p.end, "dp"]));
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = "", pos = 0;
  for (const [s, e, cls] of ranges) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s)) + `<mark class="${cls}" data-s="${s}">${esc(text.slice(s, e))}</mark>`;
    pos = e;
  }
  $("#docview").innerHTML = out + esc(text.slice(pos));
}

function jumpTo(q) {
  const text = state.result?.document_text || "";
  const i = text.toLowerCase().indexOf((q || "").toLowerCase().trim());
  if (i < 0) return;
  const m = $$("#docview mark").find((x) => { const s = +x.dataset.s; return s <= i + 2 && s + x.textContent.length >= i; });
  if (!m) return;
  const box = $("#docview");
  box.scrollTo({ top: m.offsetTop - box.clientHeight / 2, behavior: "smooth" });
  if (box.getBoundingClientRect().top < 0 || box.getBoundingClientRect().bottom > innerHeight) box.scrollIntoView({ behavior: "smooth", block: "center" });
  m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash");
}

/* ------------------------------------------------------------------ simulator */
const FMT = {};
function slider(k, label, min, max, val, step, fmt) {
  FMT[k] = fmt;
  return `<div class="ctl"><label for="s-${k}">${esc(label)} <span id="lbl-${k}">${esc(fmt(val))}</span></label>
    <input id="s-${k}" type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
function renderSim(r, keep) {
  const m = r.model, c = r.computed;
  const prev = keep ? Object.fromEntries($$("#sim-controls input").map((i) => [i.dataset.k, i.value])) : {};
  if (!keep) state.base = { apr: c.apr, total: c.total_paid, score: r.score.score, irr: c.irr, months: c.months_to_repay };
  const ctl = [];
  if (m.model_type === "LoanModel") {
    const fees = (m.fees || []).reduce((a, f) => a + f.amount, 0);
    ctl.push(slider("fees", t("sim.fees"), 0, Math.max(Math.round(fees * 2), 1000), Math.round(fees), Math.max(1, Math.round(fees / 50)), (v) => inr(v)));
    const base = m.rate_annual ?? c.implied_reducing_rate ?? 0.12;
    ctl.push(slider("rate", t("sim.rate"), 0, Math.round(Math.max(base * 200, 30)), +(base * 100).toFixed(2), 0.25, (v) => v.toFixed(2) + "%"));
    if (m.frequency !== "bullet" && (m.n_installments || 0) > 2) {
      ctl.push(slider("prepay", t("sim.prepay"), 0, m.n_installments - 1, 0, 1, (v) => v ? String(v) : t("unit.never")));
      ctl.push(slider("fc", t("sim.fc"), 0, 6, +(m.foreclosure_pct * 100).toFixed(1), 0.5, (v) => v.toFixed(1) + "%"));
    }
  } else if (m.model_type === "CardModel") {
    const minPay = Math.round(Math.max(m.outstanding * m.min_due_pct, m.min_due_floor));
    ctl.push(slider("pay", t("sim.pay"), 0, Math.round(m.outstanding / 2), 0, Math.max(100, Math.round(minPay / 10)), (v) => v ? inr(v) : t("sim.min_due")));
    ctl.push(slider("mrate", t("sim.mrate"), 0.5, 5, +(m.monthly_rate * 100).toFixed(2), 0.05, (v) => v.toFixed(2) + "%"));
  } else {
    ctl.push(slider("bench", t("sim.bench"), 3, 14, +(m.benchmark_rate * 100).toFixed(1), 0.1, (v) => v.toFixed(1) + "%"));
    ctl.push(slider("mat", t("sim.mat"), Math.round(m.maturity_benefit * 0.5), Math.round(m.maturity_benefit * 2), m.maturity_benefit, Math.max(1000, Math.round(m.maturity_benefit / 200)), (v) => inr(v)));
  }
  $("#sim-controls").innerHTML = ctl.join("");
  let changed = false;
  $$("#sim-controls input").forEach((i) => {
    if (prev[i.dataset.k] != null && prev[i.dataset.k] !== i.value) { i.value = prev[i.dataset.k]; changed = true; }
    $(`#lbl-${i.dataset.k}`).textContent = FMT[i.dataset.k](+i.value);
    i.addEventListener("input", () => { $(`#lbl-${i.dataset.k}`).textContent = FMT[i.dataset.k](+i.value); debounceSim(); });
  });
  if (changed) doSim(); else simOut(c, r.score);
}
let simT = null;
function debounceSim() { clearTimeout(simT); simT = setTimeout(doSim, 160); }
async function doSim() {
  const r = state.result, m = JSON.parse(JSON.stringify(r.model));
  const v = (k) => { const el = $(`#sim-controls input[data-k="${k}"]`); return el ? +el.value : null; };
  if (m.model_type === "LoanModel") {
    const fees = (r.model.fees || []).reduce((a, f) => a + f.amount, 0), target = v("fees");
    if (fees > 0) m.fees.forEach((f) => { const k = target / fees; f.amount *= k; if (f.base_amount != null) f.base_amount *= k; f.gst *= k; });
    else if (target > 0) m.fees = [{ name: "Upfront fee", amount: target, timing: "upfront_deducted", base_amount: target, gst: 0 }];
    if (m.disbursed != null && (r.model.fees || []).some((f) => f.timing === "upfront_deducted")) m.disbursed = r.model.disbursed + (fees - target);
    const base = r.model.rate_annual ?? r.computed.implied_reducing_rate ?? 0.12, rate = v("rate") / 100;
    if (Math.abs(rate - base) > 1e-6) { m.rate_annual = rate; m.installment = null; m.bullet_repayment = null; if (m.rate_method === "flat") m.rate_method = "reducing"; }
    if (v("prepay") != null) { m.prepay_month = v("prepay") || null; m.foreclosure_pct = v("fc") / 100; }
  } else if (m.model_type === "CardModel") { m.fixed_payment = v("pay") || null; m.monthly_rate = v("mrate") / 100; }
  else { m.benchmark_rate = v("bench") / 100; m.maturity_benefit = v("mat"); }
  try {
    const out = await api("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, facts: r.facts, document_text: r.document_text, product_type: r.product_type }) });
    simOut(out.computed, out.score);
  } catch (e) { $("#sim-out").innerHTML = `<p class="sim-note">${esc(e.message)}</p>`; }
}
function delta(now, base, fmt, lowerIsBetter = true) {
  if (now == null || base == null || Math.abs(now - base) < 1e-9) return "";
  const better = lowerIsBetter ? now < base : now > base;
  return `<p class="delta ${better ? "down" : "up"}">${esc(t(now > base ? "delta.higher" : "delta.lower", { v: fmt(Math.abs(now - base)) }))}</p>`;
}
function simOut(c, s) {
  const b = state.base;
  const pts = (x) => t("unit.points", { n: (x * 100).toLocaleString("en-IN", { maximumFractionDigits: 1 }) });
  let cells;
  if (c.kind === "investment") cells = [[t("so.irr"), pct(c.irr, 2), delta(c.irr, b.irr, pts, false)], [t("so.safe"), inr(c.benchmark_maturity), ""],
    [t("so.lose"), inr(c.opportunity_loss), ""], [t("verdict.score"), s.score, delta(s.score, b.score, String)]];
  else if (c.kind === "credit_card") cells = [[t("so.debt_free"), c.months_to_repay ? t("unit.months", { n: c.months_to_repay }) : t("unit.never"), delta(c.months_to_repay, b.months, (x) => t("unit.months", { n: x }))],
    [t("so.total"), inr(c.total_paid), delta(c.total_paid, b.total, inr)], [t("stat.int_gst"), inr(c.interest_total + c.gst_total), ""], [t("verdict.score"), s.score, delta(s.score, b.score, String)]];
  else cells = [[t("so.cost"), pct(c.apr), delta(c.apr, b.apr, pts)], [t("stat.repay"), inr(c.total_paid), delta(c.total_paid, b.total, inr)],
    [t("stat.in_account"), inr(c.net_received), ""], [t("verdict.score"), s.score, delta(s.score, b.score, String)]];
  $("#sim-out").innerHTML = cells.map(([k, v, d]) => `<div><p class="stat-label">${esc(k)}</p><p class="stat-value">${esc(v)}</p>${d}</div>`).join("") +
    `<p class="sim-note">${esc(t("so.rating", { band: t("band." + s.band) }))}</p>`;
}

/* ------------------------------------------------------------------ explanation */
function renderExplain(r) {
  const x = r.explanation || {}, g = x.grounding;
  const list = (a) => (Array.isArray(a) ? a : a ? [a] : []).map((i) => String(i).replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean).map((i) => `<li>${esc(i)}</li>`).join("");
  let ground = "";
  if (g) ground = g.grounded ? t("ex.ground_ok") : t("ex.ground_bad", { nums: g.ungrounded_numbers.join(", ") });
  if (g && g.replaced_llm_output) ground += " " + t("ex.replaced");
  const who = x.generated_by === "template" ? t("ex.by_template") : (x.generated_by || "");
  $("#explain-body").innerHTML = `
    <p class="lead">${esc(x.headline)}</p><p>${esc(x.summary)}</p>
    <h3>${esc(t("ex.means"))}</h3><ul>${list(x.key_points)}</ul>
    <h3>${esc(t("ex.ask"))}</h3><ul>${list(x.questions_to_ask)}</ul>
    <h3>${esc(t("ex.say"))}</h3><div class="script">${esc(x.negotiation_script)}</div>
    <p class="script-actions"><button class="text-btn" id="copy-script">${esc(t("ex.copy"))}</button></p>
    <h3>${esc(t("ex.better"))}</h3><ul>${list(x.safer_alternatives)}</ul>
    <p class="ground">${esc(ground)} ${esc(t("ex.by", { who }))}</p>`;
  $("#copy-script").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(x.negotiation_script || "");
    e.target.textContent = t("ex.copied"); setTimeout(() => { e.target.textContent = t("ex.copy"); }, 1500);
  });
}
$("#listen").addEventListener("click", () => {
  const x = state.result?.explanation; if (!x || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance([x.headline, x.summary, ...(x.key_points || [])].join(". "));
  u.lang = TTS[state.lang] || "en-IN"; u.rate = 0.95;
  speechSynthesis.speak(u);
});
$("#share").addEventListener("click", () => {
  const r = state.result; if (!r) return;
  const c = r.computed, x = r.explanation || {};
  const line = c.kind === "investment" ? t("share.true_return", { rate: pct(c.irr, 2) }) : t("share.true_cost", { rate: pct(c.apr), got: inr(c.net_received), paid: inr(c.total_paid) });
  const flags = r.findings.filter((f) => f.severity === "high").slice(0, 3).map((f) => "- " + t("rule." + f.rule_id)).join("\n");
  const msg = [t("share.check", { product: t("product." + r.product_type) }), t("share.score", { score: r.score.score, band: t("band." + r.score.band) }),
    line, x.headline || "", flags, t("share.report", { id: r.integrity?.report_id || "" })].filter(Boolean).join("\n");
  window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
});
$("#print").addEventListener("click", () => window.print());

/* ------------------------------------------------------------------ ask */
const CHIPS = {
  loan: [["chip.cost", "cost"], ["chip.late", "late"], ["chip.perm", "perm"], ["chip.safe", "safe"]],
  credit_card: [["chip.card_cost", "cost"], ["chip.late", "late"], ["chip.fees", "fees"], ["chip.safe", "safe"]],
  investment: [["chip.guarantee", "guarantee"], ["chip.inv_cost", "cost"], ["chip.cancel", "cancel"], ["chip.safe", "safe"]],
};
function renderAsk(r, keep) {
  if (!keep) $("#chat").innerHTML = "";
  const k = r.computed.kind === "loan" ? "loan" : r.computed.kind;
  $("#suggest").innerHTML = (CHIPS[k] || CHIPS.loan).map(([key, intent]) => `<button data-intent="${intent}">${esc(t(key))}</button>`).join("");
  $$("#suggest button").forEach((b) => b.addEventListener("click", () => { $("#question").value = b.textContent; ask(b.dataset.intent); }));
  $("#mic").classList.toggle("hidden", !state.health?.engine?.voice || !navigator.mediaDevices);
}
function addMsg(who, text) {
  const d = document.createElement("div"); d.className = "msg " + who; d.textContent = text;
  $("#chat").appendChild(d); $("#chat").scrollTop = 1e9; return d;
}
async function ask(intent) {
  const q = $("#question").value.trim(); if (!q || !state.result) return;
  $("#question").value = "";
  addMsg("user", q);
  const pending = addMsg("bot", t("ask.thinking"));
  try {
    const r = state.result;
    const out = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, intent: typeof intent === "string" ? intent : null, analysis: r, document_text: r.document_text, language: state.lang }) });
    pending.textContent = out.answer;
    const n = document.createElement("span"); n.className = "note";
    const g = out.grounding;
    n.textContent = out.offline ? t("ask.offline_note") : g && !g.grounded ? t("ask.estimated", { nums: g.ungrounded_numbers.join(", ") }) : t("ask.checked");
    pending.appendChild(n);
  } catch (e) { pending.textContent = e.message; }
}
$("#askbtn").addEventListener("click", () => ask());
$("#question").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });

let rec = null, chunks = [];
$("#mic").addEventListener("click", async () => {
  if (rec && rec.state === "recording") { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream); chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      $("#mic").classList.remove("rec");
      const fd = new FormData();
      fd.append("file", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "voice.webm");
      if (state.lang.length === 2) fd.append("language", state.lang);
      try { const out = await api("/api/transcribe", { method: "POST", body: fd }); $("#question").value = out.text; ask(); }
      catch (e) { addMsg("bot", e.message); }
    };
    rec.start(); $("#mic").classList.add("rec");
  } catch (e) { addMsg("bot", t("ask.mic_err", { err: e.message })); }
});

/* ------------------------------------------------------------------ method */
function renderMethod(r) {
  const comps = r.score.components;
  $("#anatomy").innerHTML = `<p class="anatomy-total">${esc(t("m.intro"))}</p>` +
    Object.entries(comps).map(([k, c]) => {
      const label = k === "true_cost" && r.computed.kind === "investment" ? t("comp.true_cost_inv") : t("comp." + k);
      return `<div class="anat-row"><div class="anat-head"><span>${esc(label)}</span><span>${esc(t("m.of", { a: c.points, b: Math.round(c.weight * 100) }))}</span></div>
      <div class="track"><div class="fill" style="width:${(c.norm * 100).toFixed(0)}%"></div></div></div>`;
    }).join("");
  const red = r.privacy?.redactions || {};
  const masked = Object.entries(red).map(([k, n]) => `${t("pii." + k)}: ${n}`).join(", ");
  const tm = r.timings || {}, cons = r.consensus;
  let second = t("m.second_main");
  if (cons) second = t("m.second_v", { n: cons.agree.length }) + (cons.disagree.length ? ". " + t("m.second_diff", { n: cons.disagree.length }) : "");
  const rows = [
    [t("m.reader"), r.reader + (r.reader_note ? `. ${r.reader_note}` : "")],
    [t("m.verified"), r.evidence_score != null ? t("m.verified_v", { pct: Math.round(r.evidence_score * 100) }) : "-"],
    [t("m.second"), second],
    [t("m.maths"), t("m.maths_v", { n: r.computed.flows?.length || 0 })],
    [t("m.rules"), t("m.rules_v", { rp: r.rule_pack, n: r.findings.length })],
    [t("m.privacy"), (masked ? t("m.privacy_masked", { list: masked }) : t("m.privacy_none")) + " " + t("m.stored")],
    [t("m.report"), r.integrity?.report_id || "-"],
    [t("m.time"), t("m.time_v", { s: ((tm.total_ms || 0) / 1000).toFixed(1) })],
  ];
  $("#engine-info").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

boot();
