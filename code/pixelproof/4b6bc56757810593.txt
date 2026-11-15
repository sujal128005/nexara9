"""Self-contained HTML findings report (dataset validity + model strengths/weaknesses)."""
from __future__ import annotations

import base64
import html
import io
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image

from .core import LEVELS
from .pipeline import STAGES, load_tasks
from .scoring import load_results, summarize

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6"]
SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#9085e9"]
SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf",
       "#1c5cab", "#184f95"]

CSS = """
:root{--surface:#fcfcfb;--panel:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--line:#e6e4df;
--grid:#eeece8;--accent:#2a78d6;--good:#008300;--bad:#c62f2e;%s}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){--surface:#1a1a19;--panel:#222220;
--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--line:#3a3936;--grid:#2e2d2a;--accent:#3987e5;--good:#3fa83f;
--bad:#e66767;%s}}
:root[data-theme="dark"]{--surface:#1a1a19;--panel:#222220;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;
--line:#3a3936;--grid:#2e2d2a;--accent:#3987e5;--good:#3fa83f;--bad:#e66767;%s}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink);
font:15px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:20px;margin:40px 0 4px}
.sub{color:var(--ink2);margin:0 0 20px}.note{color:var(--muted);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.tile .v{font-size:28px;font-weight:650;letter-spacing:-.02em}.tile .k{color:var(--ink2);font-size:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%%;font-size:13.5px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left}
th{color:var(--ink2);font-weight:600}td.num{text-align:right;font-variant-numeric:tabular-nums}
.heat td.cell{text-align:center;font-variant-numeric:tabular-nums;border:2px solid var(--panel);border-radius:6px;min-width:64px}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--ink2);margin:6px 0}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.multi{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.multi h4{margin:0 0 2px;font-size:14px}svg text{fill:var(--ink2);font-size:11px}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.ex{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ex img{width:100%%;display:block;background:#fff}.ex .b{padding:10px 12px;font-size:13px}
.ok{color:var(--good);font-weight:600}.no{color:var(--bad);font-weight:600}
.bar{height:18px;border-radius:0 4px 4px 0;background:var(--accent)}
code{font-size:12.5px;background:var(--grid);padding:1px 5px;border-radius:4px}
ul.lim li{margin:4px 0}
"""


def _vars(series):
    return "".join(f"--s{i + 1}:{c};" for i, c in enumerate(series))


def _pct(x):
    return "–" if x is None else f"{x * 100:.0f}%"


def _thumb(path: Path, w=320) -> str:
    im = Image.open(path).convert("RGB")
    im.thumbnail((w, w))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _seq(v):
    return SEQ[min(len(SEQ) - 1, max(0, int(round(v * (len(SEQ) - 1)))))]


def _curve_svg(fam, models, sums):
    W, H, pl, pr, pt, pb = 280, 150, 40, 10, 10, 24
    iw, ih = W - pl - pr, H - pt - pb
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="pair accuracy by difficulty for {fam}">']
    for g in (0, .5, 1):
        y = pt + ih * (1 - g)
        out.append(f'<line x1="{pl}" x2="{W - pr}" y1="{y}" y2="{y}" stroke="var(--grid)"/>'
                   f'<text x="{pl - 6}" y="{y + 4}" text-anchor="end">{int(g * 100)}%</text>')
    for lv in range(LEVELS):
        x = pl + iw * lv / (LEVELS - 1)
        out.append(f'<text x="{x}" y="{H - 6}" text-anchor="middle">L{lv}</text>')
    for mi, m in enumerate(models):
        pts = []
        for lv in range(LEVELS):
            b = sums[m]["grid"].get(f"{fam}|{lv}")
            if b and b["pairs"]:
                pts.append((pl + iw * lv / (LEVELS - 1), pt + ih * (1 - b["pair_acc"]), lv, b))
        if not pts:
            continue
        col = f"var(--s{mi + 1})"
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="'
                   + " ".join(f"{x:.1f},{y:.1f}" for x, y, _, _ in pts) + '"/>')
        for x, y, lv, b in pts:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{col}" stroke="var(--panel)" stroke-width="2">'
                       f'<title>{html.escape(m)} · {fam} L{lv}: pair acc {_pct(b["pair_acc"])}, task acc '
                       f'{_pct(b["acc"])} (n={b["pairs"]} pairs)</title></circle>')
    out.append("</svg>")
    return "".join(out)


def build_report(ds: str | Path, out: str | Path | None = None, title: str = "PixelProof findings") -> Path:
    ds = Path(ds)
    man = json.loads((ds / "manifest.json").read_text())
    tasks = {t.id: t for t in load_tasks(ds)}
    res_files = sorted((ds / "results").glob("*.jsonl")) if (ds / "results").exists() else []
    results = {}
    for f in res_files:
        rs = load_results(f)
        if rs:
            results[rs[0].get("model") or f.stem] = rs
    # real models first, baselines last
    def is_control(m):
        return m.startswith("baseline") or m.startswith("blind:")

    models = sorted(results, key=lambda m: (is_control(m), m))
    sums = {m: summarize(results[m]) for m in models}
    fams = man["families"]
    ft = man["funnel_total"]
    cand = ft.get("candidates", 0)
    acc_pairs = ft.get("accepted_pairs", 0)

    h = [f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
         f"<title>{html.escape(title)}</title><style>{CSS % (_vars(SERIES), _vars(SERIES_DARK), _vars(SERIES_DARK))}</style></head><body><main>"]
    h.append(f"<h1>{html.escape(title)}</h1><p class=sub>Verifiable visual tasks for gauges, charts, wiring, counting, "
             f"layouts and routes · dataset <code>{html.escape(ds.name)}</code> · generator v{man['version']} · seed {man['seed']}</p>")
    # ---- tiles
    h.append("<div class=tiles>")
    h.append(f"<div class=tile><div class=v>{man['tasks']}</div><div class=k>tasks ({acc_pairs} counterfactual pairs)</div></div>")
    h.append(f"<div class=tile><div class=v>{len(fams)} × {len(man['levels'])}</div><div class=k>task families × difficulty levels</div></div>")
    h.append(f"<div class=tile><div class=v>{cand}</div><div class=k>candidates screened by the validity gauntlet</div></div>")
    h.append("<div class=tile><div class=v>100%</div><div class=k>shipped tasks whose answer was re-derived from pixels by an independent verifier</div></div>")
    for m in models[:3]:
        s = sums[m]
        lab = "text-only control" if is_control(m) else "vision model"
        h.append(f"<div class=tile><div class=v>{_pct(s['pair_acc'])}</div><div class=k>pair accuracy · {lab}<br>{html.escape(m)}</div></div>")
    h.append("</div>")

    # ---- leaderboard
    if models:
        h.append("<h2>Model scorecard</h2><p class=sub>Pair accuracy counts a pair only when <b>both</b> twins are right. "
                 "Twins share the exact question text but have different answers, so text-only guessing scores 0% by construction. "
                 "Visual sensitivity = share of pairs where the model changed its answer when the decisive detail changed.</p>")
        h.append("<div class=card><table><tr><th>Model</th><th class=num>Task acc.</th><th class=num>Pair acc.</th>"
                 "<th class=num>Chance (task)</th><th class=num>Visual sensitivity</th><th class=num>Unparsed</th>"
                 "<th class=num>Tasks</th><th class=num>Tokens in/out</th></tr>")
        for m in models:
            s = sums[m]
            h.append(f"<tr><td>{html.escape(m)}</td><td class=num>{_pct(s['acc'])}</td><td class=num><b>{_pct(s['pair_acc'])}</b></td>"
                     f"<td class=num>{_pct(s['chance'])}</td><td class=num>{_pct(s['sensitivity'])}</td>"
                     f"<td class=num>{_pct(s['unparsed'])}</td><td class=num>{s['n']}</td>"
                     f"<td class=num>{s['tokens_in']:,} / {s['tokens_out']:,}</td></tr>")
        h.append("</table></div>")

        # ---- heatmap per real model (first)
        for m in [x for x in models if not is_control(x)][:2]:
            s = sums[m]
            h.append(f"<h2>Where {html.escape(m)} breaks</h2><p class=sub>Pair accuracy by family and difficulty level. "
                     f"Darker = more pairs fully correct. Hover for counts.</p><div class=card><table class=heat><tr><th>Family</th>"
                     + "".join(f"<th style='text-align:center'>L{lv}</th>" for lv in range(LEVELS)) + "<th>Breaks at</th></tr>")
            for f in fams:
                row = f"<tr><td>{html.escape(man['family_info'][f]['title'])}</td>"
                for lv in range(LEVELS):
                    b = s["grid"].get(f"{f}|{lv}")
                    if not b or not b["pairs"]:
                        row += "<td class=cell>–</td>"
                        continue
                    v = b["pair_acc"]
                    fg = "#0b0b0b" if v < 0.55 else "#ffffff"
                    row += (f"<td class=cell style='background:{_seq(v)};color:{fg}' title='{f} L{lv}: "
                            f"{b['pairs']} pairs, task acc {_pct(b['acc'])}'>{_pct(v)}</td>")
                br = s["breaking"].get(f)
                row += f"<td>{'L' + str(br) if br is not None else 'not reached'}</td></tr>"
                h.append(row)
            h.append("</table></div>")

        # ---- curves
        shown = models[:4]
        h.append("<h2>Difficulty curves</h2><p class=sub>Pair accuracy as each family's difficulty knobs are turned up.</p>")
        h.append("<div class=legend>" + "".join(f"<span><i class=sw style='background:var(--s{i + 1})'></i>{html.escape(m)}</span>"
                                                 for i, m in enumerate(shown)) + "</div><div class='card multi'>")
        for f in fams:
            h.append(f"<div><h4>{html.escape(man['family_info'][f]['title'])}</h4>{_curve_svg(f, shown, sums)}</div>")
        h.append("</div>")

    # ---- validity funnel
    h.append("<h2>Validity gauntlet</h2><p class=sub>Every candidate must pass all gates before it can be shown to a model. "
             "Rejections per gate (all families):</p><div class=card><table>")
    mx = max([cand] + [1])
    h.append(f"<tr><td style='width:34%'>Candidates generated</td><td class=num style='width:70px'>{cand}</td>"
             f"<td><div class=bar style='width:100%'></div></td></tr>")
    for key, desc in STAGES:
        v = ft.get(key, 0)
        h.append(f"<tr><td>Rejected · {html.escape(desc)}</td><td class=num>{v}</td>"
                 f"<td><div class=bar style='width:{max(0.5, 100 * v / mx):.1f}%;background:var(--muted)'></div></td></tr>")
    h.append(f"<tr><td><b>Accepted pairs</b> (×2 tasks)</td><td class=num><b>{acc_pairs}</b></td>"
             f"<td><div class=bar style='width:{100 * acc_pairs / mx:.1f}%'></div></td></tr></table>"
             "<p class=note>Per-family breakdown: " + " · ".join(
                 f"{f}: {man['funnel'].get(f, {}).get('accepted_pairs', 0)}/{man['funnel'].get(f, {}).get('candidates', 0)}"
                 for f in fams) + "</p></div>")

    # ---- family table
    h.append("<h2>Task families</h2><div class=card><table><tr><th>Family</th><th>Real-world application</th>"
             "<th>Visual skill probed</th><th>Difficulty knobs</th></tr>")
    for f in fams:
        fi = man["family_info"][f]
        h.append(f"<tr><td><b>{html.escape(fi['title'])}</b><br><span class=note>{', '.join(fi['qtypes'])}</span></td>"
                 f"<td>{html.escape(fi['application'])}</td><td>{html.escape(fi['skill'])}</td>"
                 f"<td class=note>{html.escape('; '.join(f'{k}: {v}' for k, v in fi['knobs'].items()))}</td></tr>")
    h.append("</table></div>")

    # ---- failure gallery
    if models:
        m = models[0]
        rs = results[m]
        by_pair = defaultdict(dict)
        for r in rs:
            by_pair[r["pair_id"]][r["role"]] = r
        fails = [r for r in rs if not r["correct"]]
        picked, seen_f = [], defaultdict(int)
        for r in sorted(fails, key=lambda r: (-r["difficulty"], r["family"])):
            if seen_f[r["family"]] < 3:
                picked.append(r)
                seen_f[r["family"]] += 1
        h.append(f"<h2>Failure gallery · {html.escape(m)}</h2><p class=sub>Verified tasks the model got wrong "
                 f"({len(fails)} of {len(rs)}). Truth comes from the generator and was re-derived from pixels.</p><div class=gal>")
        for r in picked[:18]:
            t = tasks.get(r["id"])
            if not t:
                continue
            tw = by_pair[r["pair_id"]].get("B" if r["role"] == "A" else "A")
            twin_txt = ""
            if tw:
                twin_txt = (f"<br><span class=note>Twin: truth {html.escape(str(tw['truth']))}, model "
                            f"{html.escape(str(tw['pred']))} {'✓' if tw['correct'] else '✗'}</span>")
            h.append(f"<div class=ex><img loading=lazy alt='{html.escape(t.question)}' src='{_thumb(ds / t.image)}'><div class=b>"
                     f"<span class=note>{html.escape(t.family)} · L{t.difficulty} · {html.escape(r['kind'])}</span><br>"
                     f"{html.escape(t.question)}<br>Truth <span class=ok>{html.escape(str(r['truth']))}</span>"
                     f"{' ± ' + str(r['tol']) if r['tol'] else ''} · model <span class=no>{html.escape(str(r['pred']))}</span>"
                     f"{twin_txt}</div></div>")
        h.append("</div>")

    # ---- limitations
    h.append("""<h2>Honest limitations</h2><div class=card><ul class=lim>
<li><b>Synthetic, clean renders.</b> Images are procedurally drawn; real photos add perspective, blur and glare. The factory measures a lower bound on real-world difficulty.</li>
<li><b>The verifier knows the rendering conventions</b> (palette, dial geometry, terminal positions). It is independent of the evaluated model and of the generator's answer, but not of the drawing style. Changing a renderer means updating its verifier; the test-suite enforces agreement.</li>
<li><b>Prompt sensitivity.</b> One fixed prompt and answer format per task; results can move a few points with other prompts. Unparsed answers are reported separately and count as wrong.</li>
<li><b>Sample sizes.</b> Per-cell pair counts are small in the demo run; treat single cells as indicative, use the generator to scale up (cost is linear and cached).</li>
<li><b>Difficulty levels are ordinal,</b> designed per family; L3 in one family is not calibrated to equal L3 in another.</li>
</ul></div>""")
    h.append(f"<p class=note style='margin-top:28px'>Reproduce: <code>pixelproof run --seed {man['seed']} --pairs {man['pairs_per_level']}</code>. "
             f"Audit: <code>pixelproof audit {html.escape(ds.name)}</code> re-derives every answer from pixels and checks image hashes.</p>")
    h.append("</main></body></html>")
    out = Path(out) if out else ds / "report.html"
    out.write_text("".join(h))
    return out
