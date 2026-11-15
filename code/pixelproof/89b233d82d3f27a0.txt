"""Builds the submission deck (HTML -> PDF) straight from the dataset + results, so every number is real.

    python deck/build_deck.py            # writes deck/PixelProof_deck.html (+ PDF via Playwright if available)
"""
from __future__ import annotations

import base64
import html
import io
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pixelproof.pipeline import load_tasks  # noqa: E402
from pixelproof.scoring import load_results, summarize  # noqa: E402

DS = ROOT / "data" / "demo"
OUT = ROOT / "deck"
VISION = "groq:qwen/qwen3.8-27b"
BLIND = "blind:groq:openai/gpt-oss-120b"
PRIOR = "baseline:blind-prior"
FAM_ORDER = ["gauge", "chart", "wires", "count", "spatial", "maze"]


def img64(path_or_img, w=None, h=None, q=84, fmt="JPEG"):
    im = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
    im = im.convert("RGB")
    if w or h:
        im.thumbnail((w or 4000, h or 4000), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, fmt, quality=q)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()


def pct(x):
    return f"{x * 100:.0f}%"


def load():
    man = json.loads((DS / "manifest.json").read_text())
    tasks = {t.id: t for t in load_tasks(DS)}
    res = {}
    for f in (DS / "results").glob("*.jsonl"):
        rs = load_results(f)
        if rs:
            res[rs[0]["model"]] = rs
    return man, tasks, res


def maze_pair_with_highlight(tasks):
    """Twin pair for the counterfactual slide: highlight the single toggled wall."""
    for pid in sorted({t.pair_id for t in tasks.values() if t.family == "maze" and t.difficulty == 2}):
        a, b = tasks[pid + "-A"], tasks[pid + "-B"]
        tog = b.params.get("toggled")
        if not tog:
            continue
        ims = []
        for t in (a, b):
            im = Image.open(DS / t.image).convert("RGB")
            n = t.params["n"]
            cs = (560 - 52) / n
            kind, r, c = tog
            if kind == "h":
                x, y = 26 + (c + 0.5) * cs, 26 + (r + 1) * cs
            else:
                x, y = 26 + (c + 1) * cs, 26 + (r + 0.5) * cs
            d = ImageDraw.Draw(im)
            rad = cs * 0.62
            d.ellipse([x - rad, y - rad, x + rad, y + rad], outline=(234, 128, 12), width=5)
            ims.append(im)
        return a, b, ims
    return None


def build():
    man, tasks, res = load()
    sv = summarize(res[VISION]) if VISION in res else None
    sb = summarize(res[BLIND]) if BLIND in res else None
    sp = summarize(res[PRIOR]) if PRIOR in res else None
    ft = man["funnel_total"]
    fi = man["family_info"]
    n_q = sum(len(fi[f]["qtypes"]) for f in fi)
    n_knobs = sum(len(fi[f]["knobs"]) for f in fi)

    # --------------------------------------------------------------- images
    sample = {}
    for f in FAM_ORDER:
        t = tasks.get(f"{f}-L3-0000-A") or tasks.get(f"{f}-L2-0000-A")
        sample[f] = (t, img64(DS / t.image, 520, 400))
    ladder = []
    for lv in range(5):
        t = tasks.get(f"gauge-L{lv}-0000-A")
        if t:
            ladder.append((lv, t, img64(DS / t.image, 330, 330)))
    twin = maze_pair_with_highlight(tasks)

    # failures for gallery
    gallery = []
    if sv:
        rs = res[VISION]
        by_pair = defaultdict(dict)
        for r in rs:
            by_pair[r["pair_id"]][r["role"]] = r
        wrong = [r for r in rs if not r["correct"] and r["pred"] is not None]
        picks = []
        # most striking first: easiest counting task, then a gauge near-miss, then the rest by family
        for key in (lambda r: r["family"] == "count" and r["difficulty"] == 0 and r["truth"] >= 3,
                    lambda r: r["family"] == "gauge",
                    lambda r: r["family"] == "count" and r["difficulty"] >= 1,
                    lambda r: r["family"] not in ("count", "gauge")):
            c = [r for r in wrong if key(r) and r not in picks]
            if c:
                picks.append(sorted(c, key=lambda r: r["difficulty"])[0])
        for r in picks[:4]:
            t = tasks[r["id"]]
            gallery.append((r, t, img64(DS / t.image, 420, 330)))

    # --------------------------------------------------------------- insights
    fam_title = {f: fi[f]["title"] for f in fi}
    ins = []
    if sv:
        rs = res[VISION]
        fam_acc = {f: v for f, v in sv["by_family"].items()}
        parts = [f"{fam_title[f]} <b>{sum(r['correct'] for r in rs if r['family'] == f)}/{v['n']}</b>"
                 for f, v in sorted(fam_acc.items(), key=lambda kv: -kv[1]["acc"])]
        ins.append("<b>Sharp split by skill:</b> " + " · ".join(parts) + " tasks correct.")
        cnt = [r for r in rs if r["family"] == "count"]
        cnt_err = [r for r in cnt if not r["correct"]]
        if cnt_err:
            parsed = [r for r in cnt_err if r["pred"] is not None]
            over = sum(1 for r in parsed if float(r["pred"]) > float(r["truth"]))
            partial = sum("partial" in (r["raw"] or "").lower() for r in cnt_err)
            ins.append(f"<b>Counting hallucination:</b> {over}/{len(parsed)} parsed counting errors are <b>over-counts</b>, even with "
                       f"only 1–3 objects on a white background; the model's reasoning invents “partially visible” objects at the edges "
                       f"({partial} responses).")
        g = [r for r in rs if r["family"] == "gauge"]
        if g:
            lo = [r for r in g if r["difficulty"] <= 2]
            hi = [r for r in g if r["difficulty"] >= 3]
            bad = [r for r in hi if r["pred"] is not None and not r["correct"]]
            ex = max(bad, key=lambda r: abs(float(r["pred"]) - float(r["truth"])) / max(r["tol"], 1e-9)) if bad else None
            exs = f" (e.g. {ex['truth']:g} read as {ex['pred']:g})" if ex else ""
            ins.append(f"<b>Gauges break at one knob:</b> {sum(r['correct'] for r in lo)}/{len(lo)} correct at L0–L2, "
                       f"<b>{sum(r['correct'] for r in hi)}/{len(hi)}</b> at L3–L4. Once only every other major tick is labelled, "
                       f"readings drift by one or two scale steps{exs}. The red set-point decoy is never mistaken for the pointer.")
        loops = [r for r in rs if r["kind"] == "unparsed"]
        mz = [r for r in rs if r["family"] == "maze"]
        if loops:
            ml = sum(r["family"] == "maze" for r in loops)
            ins.append(f"<b>Runaway reasoning:</b> {len(loops)}/{len(rs)} responses ({ml} of {len(mz)} mazes) loop until the "
                       f"2,048-token cap and never commit an answer, so they are scored unparsed and never guessed. "
                       f"Route planning: <b>{sum(r['correct'] for r in mz)}/{len(mz)}</b> correct.")
        ins.append(f"<b>Visual sensitivity {pct(sv['sensitivity'])}</b> on evaluated pairs: Qwen does look at the image — "
                   f"its failures are perception errors, not text priors (text-only controls: 0% pairs).")
    n_total_subset = 120
    partial_note = (f"{sv['n']} of {n_total_subset} tasks evaluated within the free-tier daily token quota"
                    if sv and sv["n"] < n_total_subset else f"{n_total_subset} tasks")

    # heatmap rows
    def heat_rows(s):
        rows = []
        for f in FAM_ORDER:
            cells = []
            for lv in range(5):
                b = s["grid"].get(f"{f}|{lv}")
                if not b or not b["pairs"]:
                    cells.append("<td class=hc>–</td>")
                    continue
                v = b["pair_acc"]
                seq = ["#eef4fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"]
                col = seq[min(6, int(round(v * 6)))]
                fg = "#0b0b0b" if v < 0.6 else "#fff"
                cells.append(f"<td class=hc style='background:{col};color:{fg}'>{pct(v)}</td>")
            br = s["breaking"].get(f)
            ran = f in s["by_family"]
            lab = ("L" + str(br)) if br is not None else ("not reached" if ran else "not run yet")
            rows.append(f"<tr><td class=hf>{html.escape(fam_title[f])}</td>{''.join(cells)}"
                        f"<td class=hb style='{'' if br is not None else 'color:#8a8984'}'>{lab}</td></tr>")
        return "".join(rows)

    tok_in = sv["tokens_in"] if sv else 0
    tok_out = sv["tokens_out"] if sv else 0

    # --------------------------------------------------------------- slides
    S = []

    def slide(body, cls=""):
        S.append(f"<section class='s {cls}'>{body}<div class=foot><span>PixelProof · Track 2 · Visual Task Factory</span>"
                 f"<span>{len(S) + 1}</span></div></section>")

    # 1 title
    coll = "".join(f"<img src='{sample[f][1]}'>" for f in FAM_ORDER)
    slide(f"""<div class=title-grid><div>
<div class=kicker>Innodata Hackathon 2026 · Track 2 — Visual Task Factory</div>
<h1 class=big>PixelProof</h1>
<p class=lead>A verifiable visual task factory: <b>every answer re-derived from pixels</b>, <b>every question proven to need the image.</b></p>
<div class=chips><span>6 task families</span><span>{n_q} question types</span><span>5 difficulty levels</span><span>counterfactual twins</span><span>independent verifiers</span></div>
</div><div class=collage>{coll}</div></div>""", "cover")

    # 2 problem
    slide("""<h2>Vision errors are costly, and most visual benchmarks cannot prove their answer keys</h2>
<div class=cols3>
<div class=card><div class=ic>⏲</div><h3>Misread gauge</h3><p>One tick off in a plant photo leads to a wrong maintenance decision.</p></div>
<div class=card><div class=ic>▥</div><h3>Misread chart</h3><p>A bar read against the wrong gridline puts a wrong figure in a report.</p></div>
<div class=card><div class=ic>⌇</div><h3>Mistraced wire</h3><p>Following the wrong wire through a crossing means a failed inspection.</p></div>
</div>
<div class=cols3 style='margin-top:34px'>
<div class='card warn'><h3>Unverified answer keys</h3><p>Keys produced by a model or a single annotator.</p></div>
<div class='card warn'><h3>Text leakage</h3><p>Language priors score points without looking at the image.</p></div>
<div class='card warn'><h3>Loose scoring</h3><p>Multiple choice rewards guessing; errors and luck look alike.</p></div>
</div>""")

    # 3 solution pillars
    slide(f"""<h2>PixelProof ships only tasks it can prove</h2>
<div class=cols4>
<div class=pill><div class=w>25%</div><h3>Reusable &amp; repeatable</h3><p>One command runs generate → audit → evaluate → report. Seeded and deterministic. Plug-in task families; any model over HTTP.</p></div>
<div class=pill><div class=w>25%</div><h3>Validated</h3><p>Ground truth from the generator, <b>re-derived from pixels</b> by an independent verifier. <b>Counterfactual twins</b> prove the image is needed.</p></div>
<div class=pill><div class=w>20%</div><h3>Meaningful variation</h3><p>6 families × {n_q} question types probe different visual relations; {n_knobs} named difficulty knobs drive 5 levels.</p></div>
<div class=pill><div class=w>30%</div><h3>Judgement &amp; impact</h3><p>Strict scoring with tolerances, pair accuracy and an error taxonomy. Cached, budgeted evaluation. Stated limitations.</p></div>
</div>
<p class=tag>Application: <b>reading industrial instruments, business charts and technical diagrams.</b></p>""")

    # 4 pipeline
    steps = [("Sample", "seeded scene graph per family + level"), ("Render", "anti-aliased 3× supersampled PNG"),
             ("G1 Evidence", "sizes, margins, crossing angles, occlusion"), ("G2 Verifier", "answer re-derived from pixels"),
             ("G3 Twin", "same question, different answer"), ("G4 Dedup", "perceptual hash"),
             ("Evaluate", "any model, cached, budgeted"), ("Score + Report", "pair acc, curves, failures")]
    flow = "".join(f"<div class=st><div class=n>{i + 1}</div><b>{a}</b><span>{b}</span></div>" + ("<div class=ar>→</div>" if i < len(steps) - 1 else "")
                   for i, (a, b) in enumerate(steps))
    slide(f"""<h2>Architecture</h2>
<div class=flow>{flow}</div>
<div class=cols3 style='margin-top:40px'>
<div class=card><h3>Dataset on disk</h3><p><code>tasks.jsonl</code>: question, answer, tolerance, knobs, scene graph, gate results, image hash. <code>manifest.json</code>: seed, version, funnel.</p></div>
<div class=card><h3>No lock-in</h3><p>Two dependencies (NumPy, Pillow). Plain-HTTP adapters for Groq, OpenAI-compatible APIs, Gemini, OpenRouter and local Ollama.</p></div>
<div class=card><h3>Failure-Frontier Search</h3><p>An adaptive staircase finds each family's breaking level in a few calls and keeps the verified failures as a hard set.</p></div>
</div>""")

    # 5 families
    cards = []
    for f in FAM_ORDER:
        t, im = sample[f]
        cards.append(f"<div class=fam><img src='{im}'><div class=fb><h3>{html.escape(fi[f]['title'])}</h3>"
                     f"<p class=app>{html.escape(fi[f]['application'])}</p><p class=sk>{html.escape(fi[f]['skill'])}</p></div></div>")
    slide(f"<h2>Six task families, each a different visual relation</h2><div class=famgrid>{''.join(cards)}</div>")

    # 6 validity: verifiers
    ver = [("Gauge", "Isolates needle pixels, estimates the angle from the outer needle segment, maps it through the printed scale"),
           ("Chart", "Scans each bar column for the series colour to measure its height, converts through the axis scale, then re-runs read, rank or difference"),
           ("Wires", "Follows the wire pixel by pixel from the start terminal, prefers the straightest path at crossings and jumps occlusion gaps"),
           ("Count", "Colour mask, then connected components, then a shape classifier based on how round and how solid each blob is"),
           ("Spatial", "Finds every object's colour and shape from pixels, computes centroids, then re-solves nearest, relation and order questions"),
           ("Maze", "Checks each wall position in the image, rebuilds the grid, then finds the shortest route (BFS) between the coloured cells")]
    vrows = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td></tr>" for a, b in ver)
    slide(f"""<h2>Validity ① · every answer is computed twice, independently</h2>
<div class=split><div><table class=vt>{vrows}</table></div>
<div class=kpis>
<div class=kpi><div class=v>{man['tasks']}</div><div class=k>tasks in demo set ({ft.get('accepted_pairs', 0)} twin pairs)</div></div>
<div class=kpi><div class=v>100%</div><div class=k>shipped answers re-derived from pixels (<code>pixelproof audit</code>)</div></div>
<div class=kpi><div class=v>{ft.get('candidates', 0)}</div><div class=k>candidates screened · {ft.get('G1_evidence', 0)} failed evidence gates, {ft.get('G3_twin', 0)} had no valid twin, {ft.get('G4_dedup', 0)} near-duplicates</div></div>
<div class=kpi><div class=v>✓</div><div class=k>Unit tests for every family × level: the verifier recovers both answers <b>and</b> twin A's pixels do not support twin B's answer</div></div>
</div></div>
<p class=tag>The verifier never sees the generator's answer: only the image and what is printed on it.</p>""")

    # 7 twins
    twin_html = ""
    if twin:
        a, b, ims = twin
        twin_html = (f"<div class=twins><figure><img src='{img64(ims[0], 430, 430)}'><figcaption>Twin A · truth <b>{a.answer['value']}</b> moves</figcaption></figure>"
                     f"<figure><img src='{img64(ims[1], 430, 430)}'><figcaption>Twin B · truth <b>{b.answer['value']}</b> moves</figcaption></figure></div>"
                     f"<p class=q>“{html.escape(a.question)}”</p>")
    bars = []
    for lab, s, col in (("Text prior that has seen every answer", sp, "#8a8984"), ("GPT-OSS-120B, image withheld", sb, "#eb6834"),
                        (f"Qwen 3.8 27B, with image ({sv['n'] if sv else 0} tasks)", sv, "#2a78d6")):
        if not s:
            continue
        bars.append(f"<div class=brow><div class=bl>{lab}</div><div class=bt><div class=bar style='width:{max(1, s['acc'] * 100):.0f}%;background:{col}'></div>"
                    f"<span>{pct(s['acc'])} tasks</span></div><div class=bt><div class=bar style='width:{max(1, s['pair_acc'] * 100):.0f}%;background:{col}'></div>"
                    f"<span><b>{pct(s['pair_acc'])}</b> pairs</span></div></div>")
    slide(f"""<h2>Validity ② · counterfactual twins prove the image is needed</h2>
<div class=split2><div>{twin_html}</div>
<div><p class=lead2>Each task has a twin that differs in <b>one decisive detail</b>: same question, different correct answer.</p>
<p class=lead2>A model that ignores the image can be right on at most one twin, so <b>text-only pair accuracy is 0% by construction</b>. Measured:</p>
<div class=bars><div class=brow head><div></div><div>task accuracy</div><div>pair accuracy (both twins)</div></div>{''.join(bars)}</div></div></div>""")

    # 8 variation
    cap = {0: "5 labelled ticks, value on a tick", 1: "+ minor ticks to interpolate", 2: "dense 10×5 scale",
           3: "+ red set-point decoy, sparse labels, below-zero scale, noise", 4: "+ half-step values, thin needle, more noise"}
    lad = "".join(f"<figure><img src='{im}'><figcaption><b>L{lv}</b> · {cap[lv]}</figcaption></figure>" for lv, t, im in ladder)
    krows = "".join(f"<tr><td><b>{html.escape(fi[f]['title'])}</b></td><td>{html.escape(', '.join(fi[f]['qtypes']))}</td>"
                    f"<td>{html.escape(', '.join(fi[f]['knobs']))}</td></tr>" for f in FAM_ORDER)
    slide(f"""<h2>Meaningful variation · knobs change the reasoning, not the style</h2>
<div class=ladder>{lad}</div>
<table class=kt><tr><th>Family</th><th>Question types</th><th>Difficulty knobs</th></tr>{krows}</table>""")

    # 9 scoring
    kinds = Counter(r["kind"] for r in res[VISION]) if sv else Counter()
    tot = sum(kinds.values()) or 1
    kbar = "".join(f"<div class=seg style='flex:{kinds[k]};background:{c}' title='{k}'></div>" for k, c in
                   (("correct", "#1baf7a"), ("off_by_one", "#eda100"), ("near_miss", "#e87ba4"), ("wrong", "#e34948"), ("unparsed", "#8a8984")) if kinds[k])
    kleg = "".join(f"<span><i style='background:{c}'></i>{k.replace('_', ' ')} {kinds[k] * 100 // tot}%</span>" for k, c in
                   (("correct", "#1baf7a"), ("off_by_one", "#eda100"), ("near_miss", "#e87ba4"), ("wrong", "#e34948"), ("unparsed", "#8a8984")))
    slide(f"""<h2>Scoring that cleanly separates correct from incorrect</h2>
<div class=cols2>
<div class='card tall'><h3>Rules</h3><ul>
<li><b>No multiple choice.</b> Answers are numbers, integers or object names, so guessing almost never works (chance is {pct(sv['chance']) if sv else '~10%'} per task, ~0% per pair).</li>
<li><b>Tolerance = 0.45 × the value resolution</b> (e.g. a minor tick). Any reading that lands on the neighbouring tick is wrong.</li>
<li><b>Strict format:</b> the last line must be <code>ANSWER: …</code>. Unparsed answers count as wrong and are reported separately.</li>
<li><b>Headline = pair accuracy:</b> both twins must be right.</li>
<li><b>Visual sensitivity:</b> did the model change its answer when the decisive detail changed?</li>
</ul></div>
<div class='card tall'><h3>Error taxonomy · Qwen 3.8 27B, {sv['n'] if sv else 0} tasks</h3>
<div class=kbar>{kbar}</div><div class=kleg>{kleg}</div>
<p style='margin-top:26px'>Near-misses and off-by-one errors are separated from gross errors and unparsed answers.</p></div>
</div>""")

    # 10 findings
    if sv:
        slide(f"""<h2>Findings · Qwen 3.8 27B reads charts perfectly but cannot count three squares</h2>
<div class=split3><div><table class=heat><tr><th></th>{''.join(f'<th>L{lv}</th>' for lv in range(5))}<th>breaks at</th></tr>{heat_rows(sv)}</table>
<p class=small>Pair accuracy (both twins correct) per family and level · {sv['pairs']} pairs · {partial_note} · model served on Groq.</p></div>
<ul class=ins>{''.join(f'<li>{x}</li>' for x in ins)}</ul></div>""")

    # 11 gallery
    if gallery:
        g = "".join(f"<div class=gx><img src='{im}'><div class=gb><span class=meta>{html.escape(fi[t.family]['title'])} · L{t.difficulty}</span>"
                    f"<p>{html.escape(t.question)}</p><div class=tv><span class=ok>truth {html.escape(str(r['truth']))}"
                    f"{' ± ' + str(round(r['tol'], 3)) if r['tol'] else ''}</span><span class=no>model {html.escape(str(r['pred']))}</span></div></div></div>"
                    for r, t, im in gallery)
        slide(f"<h2>Failure gallery · verified tasks the model got wrong</h2><div class=gal>{g}</div>")

    # 12 judgement + limitations
    slide(f"""<h2>Engineering judgement and limitations</h2>
<div class=cols2>
<div class='card tall'><h3>Design choices</h3><ul>
<li><b>Procedural rendering:</b> exact ground truth, no GPU, near-zero cost.</li>
<li><b>Pixel verifiers, not a model judge:</b> free of model bias.</li>
<li><b>Counterfactual pairs:</b> a structural guarantee that the image is needed.</li>
<li><b>Cost:</b> {tok_in:,} input + {tok_out:,} output tokens on Groq's free tier; cached re-runs are free and <code>--budget</code> caps calls.</li>
</ul></div>
<div class='card tall'><h3>Limitations</h3><ul>
<li>Clean synthetic renders give a <b>lower bound</b> on real-photo difficulty.</li>
<li>Verifiers know the rendering conventions (palette, dial geometry).</li>
<li>One fixed prompt per task; scores may shift slightly with other prompts.</li>
<li>Two twin pairs per cell: results are indicative; scale up with the generator.</li>
</ul></div></div>""")

    # demo slide
    st = ROOT / "deck" / "assets" / "studio.png"
    if st.exists():
        slide(f"""<h2>Demo · PixelProof Studio</h2>
<div class=split4><img class=shot src='{img64(st, 1100, 900)}'>
<div><div class=card><h3>Studio (live)</h3><p>Pick a family and difficulty and generate a twin pair live. See both verified answers, the verifier's reading, the knobs and the gate results. <b>Ask model</b> sends both twins to Qwen on Groq.</p></div>
<div class=card style='margin-top:20px'><h3>Run it</h3><p><code>run_local.bat</code> (Windows) or <code>./run_local.sh</code><br><code>pixelproof run --pairs 4</code><br><code>pixelproof eval data/demo --model groq:qwen/qwen3.8-27b</code><br><code>pixelproof frontier --model …</code><br><code>pixelproof audit data/demo</code></p></div></div></div>""")

    # 13 impact
    slide(f"""<h2>Impact · a trustworthy gate for vision models in operations</h2>
<div class=cols3>
<div class=card><h3>Model selection</h3><p>Know <i>where</i> a model breaks (dial density, clutter, crossings) before trusting it on plant photos, reports or diagrams.</p></div>
<div class=card><h3>Regression testing</h3><p>Seeded, deterministic sets act as a CI gate. A new model release must not lower pair accuracy on any family.</p></div>
<div class=card><h3>Data for improvement</h3><p>The Failure-Frontier hard set is verified, labelled training and evaluation data aimed at each model's weak spots.</p></div>
</div>
<div class=road><b>Next:</b> photo-realistic rendering (perspective, glare, blur) with the same verifiers · real-photo calibration set · more families (P&amp;ID symbols, tables, clocks, meters) · human baseline mode in Studio</div>
<div class=closing>Every answer re-derived from pixels.<br>Every question proven to need the image.</div>""", "end")

    CSS = """
@page{size:1920px 1080px;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e9e7e2}
body{font-family:Inter,'Inter Display',system-ui,sans-serif;color:#141413;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.s{width:1920px;height:1080px;padding:84px 110px 90px;background:#faf9f6;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.s:before{content:"";position:absolute;left:0;top:0;width:100%;height:10px;background:linear-gradient(90deg,#e8772e,#2a78d6)}
h1.big{font-size:150px;line-height:1;margin:18px 0 26px;letter-spacing:-.045em;font-weight:800}
h2{font-size:52px;line-height:1.12;letter-spacing:-.025em;margin:0 0 44px;max-width:1650px;font-weight:750}
h3{font-size:30px;margin:0 0 10px;letter-spacing:-.01em}p,li{font-size:25px;line-height:1.45;color:#3b3a37}
.kicker{font-size:24px;font-weight:600;color:#e8772e;letter-spacing:.02em;text-transform:uppercase}
.lead{font-size:36px;line-height:1.35;color:#2d2c29;max-width:820px}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.chips span{background:#fff;border:1.5px solid #dcd9d2;border-radius:999px;padding:9px 20px;font-size:22px;font-weight:600}
.title-grid{display:grid;grid-template-columns:860px 1fr;gap:60px;align-items:center;height:100%}
.collage{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.collage img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:18px;border:1px solid #dedad3;background:#fff}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.cols4{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}.cols2{display:grid;grid-template-columns:1fr 1fr;gap:34px}
.card{background:#fff;border:1.5px solid #e4e1da;border-radius:22px;padding:30px 32px}.card.tall{min-height:640px}.card.warn{border-left:8px solid #e34948}
.card ul{padding-left:26px;margin:0}.card li{margin:12px 0}
.ic{font-size:46px;color:#e8772e;margin-bottom:8px}
.pill{background:#fff;border:1.5px solid #e4e1da;border-radius:22px;padding:30px;min-height:520px}.pill .w{font-size:64px;font-weight:800;color:#2a78d6;letter-spacing:-.03em}
.tag{margin-top:40px;font-size:27px;background:#fff4ea;border-left:8px solid #e8772e;padding:20px 28px;border-radius:12px;color:#2d2c29}
.flow{display:flex;align-items:stretch;gap:8px}.st{flex:1;background:#fff;border:1.5px solid #e4e1da;border-radius:18px;padding:20px 16px;display:flex;flex-direction:column;gap:8px}
.st .n{width:40px;height:40px;border-radius:50%;background:#2a78d6;color:#fff;font-weight:700;font-size:21px;display:flex;align-items:center;justify-content:center}
.st:nth-child(n+5):nth-child(-n+11) .n{background:#e8772e}
.st b{font-size:24px}.st span{font-size:19px;color:#5a5955;line-height:1.35}.ar{align-self:center;font-size:30px;color:#a19f98}
code{font-family:'DejaVu Sans Mono',monospace;font-size:.85em;background:#f0eee9;padding:2px 7px;border-radius:6px}
.famgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.fam{background:#fff;border:1.5px solid #e4e1da;border-radius:20px;overflow:hidden;display:grid;grid-template-columns:250px 1fr}
.fam img{width:250px;height:250px;object-fit:cover;background:#fff;border-right:1.5px solid #eee}.fb{padding:20px 22px}.fb h3{font-size:27px}.fb p{font-size:20px;margin:6px 0}.fb .app{color:#2a78d6;font-weight:600}
.split{display:grid;grid-template-columns:1.15fr 1fr;gap:40px}.vt{border-collapse:collapse;width:100%}.vt td{font-size:22px;padding:14px 12px;border-bottom:1.5px solid #e4e1da;vertical-align:top;line-height:1.38}.vt td:first-child{width:130px;color:#e8772e}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:18px}.kpi{background:#fff;border:1.5px solid #e4e1da;border-radius:18px;padding:22px 24px}.kpi .v{font-size:58px;font-weight:800;letter-spacing:-.03em;color:#2a78d6}.kpi .k{font-size:20px;color:#4a4945;line-height:1.38}
.split2{display:grid;grid-template-columns:900px 1fr;gap:56px}.twins{display:flex;gap:22px}.twins figure{margin:0;flex:1}.twins img{width:100%;border-radius:16px;border:1.5px solid #dedad3}
figcaption{font-size:22px;margin-top:8px;color:#3b3a37}.q{font-size:22px;color:#5a5955;font-style:italic;margin-top:14px}
.lead2{font-size:27px;line-height:1.45}.bars{margin-top:24px;background:#fff;border:1.5px solid #e4e1da;border-radius:18px;padding:20px 24px}
.brow{display:grid;grid-template-columns:270px 1fr 1fr;gap:16px;align-items:center;margin:14px 0}.brow[head]{font-size:18px;color:#6a6964;font-weight:600}
.bl{font-size:20px;line-height:1.3}.bt{display:flex;align-items:center;gap:10px}.bt span{font-size:21px;white-space:nowrap}.bar{height:26px;border-radius:0 6px 6px 0;min-width:4px}
.ladder{display:flex;gap:16px;margin-bottom:28px}.ladder figure{margin:0;flex:1}.ladder img{width:100%;border-radius:14px;border:1.5px solid #dedad3;background:#fff}.ladder figcaption{font-size:16px;color:#5a5955}
.kt{width:100%;border-collapse:collapse}.kt th,.kt td{text-align:left;font-size:19px;padding:8px 10px;border-bottom:1.5px solid #e4e1da}.kt th{color:#6a6964}
.kbar{display:flex;height:56px;border-radius:12px;overflow:hidden;gap:3px;margin-top:20px}.seg{height:100%}
.kleg{display:flex;flex-wrap:wrap;gap:22px;margin-top:16px;font-size:21px}.kleg i{display:inline-block;width:18px;height:18px;border-radius:5px;margin-right:8px;vertical-align:-2px}
.split3{display:grid;grid-template-columns:1fr 760px;gap:50px}.heat{border-collapse:separate;border-spacing:6px}.heat th{font-size:21px;color:#6a6964;font-weight:600}
.hc{width:120px;height:74px;text-align:center;font-size:25px;font-weight:700;border-radius:10px}.hf{font-size:22px;font-weight:600;padding-right:14px;white-space:nowrap}.hb{font-size:22px;padding-left:14px;color:#e34948;font-weight:700}
.small{font-size:18px;color:#6a6964}.ins{padding-left:0;list-style:none;margin:0}.ins li{background:#fff;border:1.5px solid #e4e1da;border-radius:16px;padding:18px 22px;margin:0 0 14px;font-size:22px;line-height:1.42}
.gal{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}.gx{background:#fff;border:1.5px solid #e4e1da;border-radius:18px;overflow:hidden}.gx img{width:100%;height:330px;object-fit:contain;background:#fff;border-bottom:1.5px solid #eee}
.gb{padding:18px 20px}.gb p{font-size:19px;line-height:1.38;min-height:150px}.meta{font-size:16px;color:#6a6964;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.tv{display:flex;flex-direction:column;gap:6px;font-size:22px;font-weight:700}.ok{color:#0d8a4f}.no{color:#d23c3b}
.road{margin-top:34px;font-size:24px;background:#fff;border:1.5px dashed #c9c6be;border-radius:16px;padding:20px 26px;line-height:1.5}
.closing{margin-top:44px;font-size:52px;font-weight:800;letter-spacing:-.025em;line-height:1.2;color:#141413}
.foot{position:absolute;left:110px;right:110px;bottom:34px;display:flex;justify-content:space-between;font-size:17px;color:#9a988f}
.split4{display:grid;grid-template-columns:1080px 1fr;gap:40px}.shot{width:100%;border-radius:16px;border:1.5px solid #dedad3;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.cover{background:radial-gradient(1200px 700px at 85% 40%,#e9f1fc 0,#faf9f6 60%)}
"""
    doc = f"<!doctype html><html><head><meta charset=utf-8><title>PixelProof deck</title><style>{CSS}</style></head><body>{''.join(S)}</body></html>"
    OUT.mkdir(exist_ok=True)
    hp = OUT / "PixelProof_deck.html"
    hp.write_text(doc)
    return hp, len(S)


def to_pdf(hp: Path) -> Path | None:
    pdf = hp.with_suffix(".pdf")
    js = f"""const {{ chromium }} = require('playwright');
(async () => {{ const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://{hp}', {{ waitUntil: 'load' }}); await p.waitForTimeout(500);
await p.pdf({{ path: '{pdf}', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true }});
await b.close(); }})();"""
    try:
        subprocess.run(["node", "-e", js], check=True, cwd=str(OUT))
        return pdf
    except Exception as e:  # noqa: BLE001
        print("PDF export skipped:", e)
        return None


if __name__ == "__main__":
    hp, n = build()
    print(f"{hp} ({n} slides)")
    pdf = to_pdf(hp)
    if pdf:
        print(f"{pdf} ({pdf.stat().st_size / 1e6:.2f} MB)")
