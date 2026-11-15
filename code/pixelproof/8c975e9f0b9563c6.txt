"""PixelProof Studio: a zero-dependency local web UI to generate, inspect and stress-test tasks live."""
from __future__ import annotations

import base64
import hashlib
import json
import random
import threading
import urllib.parse
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

from .core import LEVELS, REGISTRY, png_bytes, sha256
from .models import SYSTEM, make_model
from .pipeline import STAGES, build_pair
from .scoring import classify_error, parse

CHANGED = {
    "gauge": "the needle moved to a different reading",
    "chart": "one bar's value changed",
    "wires": "two wire endpoints were swapped",
    "count": "target parts were added or removed",
    "spatial": "one object was moved",
    "maze": "exactly one wall segment was toggled",
}
LEVEL_NAMES = ["Easy", "Medium", "Hard", "Expert", "Extreme"]

PAGE = r"""<!doctype html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>PixelProof Studio</title>
<style>
:root{--bg:#f5f4f0;--panel:#fff;--ink:#141413;--ink2:#5b5a55;--muted:#8d8b84;--line:#e4e1da;--accent:#2a78d6;--accent2:#e8772e;
--ok:#0d8a4f;--okbg:#e6f5ec;--bad:#d23c3b;--badbg:#fdeceb;--chip:#f0eee9;--shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05)}
@media (prefers-color-scheme: dark){:root{--bg:#131312;--panel:#1d1d1b;--ink:#f0efec;--ink2:#bdbcb4;--muted:#8f8e86;--line:#33322e;
--accent:#3987e5;--ok:#3fbf6a;--okbg:#14301f;--bad:#e66767;--badbg:#3a1c1c;--chip:#2a2926;--shadow:none}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
header{display:flex;align-items:center;gap:18px;padding:12px 28px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:-.02em}
.logo i{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent2),var(--accent));display:grid;place-items:center;color:#fff;font-style:normal;font-size:16px}
.stats{display:flex;gap:8px;margin-left:12px;flex-wrap:wrap}.stat{background:var(--chip);border-radius:999px;padding:4px 12px;font-size:12.5px;color:var(--ink2)}
.stat b{color:var(--ink)}.stat.ok b{color:var(--ok)}
header a.rep{margin-left:auto;background:var(--ink);color:var(--panel);text-decoration:none;font-weight:650;padding:9px 16px;border-radius:10px;font-size:14px;white-space:nowrap}
main{max-width:1320px;margin:0 auto;padding:22px 28px 48px;display:grid;gap:18px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:18px 20px}
.lab{font-size:12px;font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.fams{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}@media(max-width:1000px){.fams{grid-template-columns:repeat(3,1fr)}}
.fam{border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer;background:var(--panel);text-align:left;font:inherit;color:inherit;transition:.15s}
.fam b{display:block;font-size:14.5px}.fam span{font-size:12px;color:var(--ink2);line-height:1.35;display:block;margin-top:2px}
.fam:hover{border-color:var(--accent)}.fam.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--panel));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.row{display:flex;gap:22px;align-items:end;flex-wrap:wrap;margin-top:16px}
.seg{display:flex;border:1.5px solid var(--line);border-radius:12px;overflow:hidden}
.seg button{font:inherit;border:0;background:var(--panel);color:var(--ink2);padding:8px 14px;cursor:pointer;border-right:1px solid var(--line);font-size:13.5px}
.seg button:last-child{border-right:0}.seg button small{display:block;font-size:10.5px;color:var(--muted)}
.seg button.on{background:var(--accent);color:#fff}.seg button.on small{color:#dbe8fa}
input{font:inherit;padding:9px 11px;border:1.5px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);width:110px}
.btn{font:inherit;font-weight:700;padding:11px 20px;border-radius:12px;border:0;background:var(--accent);color:#fff;cursor:pointer;font-size:15px}
.btn.sec{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}.btn.ai{background:var(--accent2)}
.btn:disabled{opacity:.5;cursor:default}
.q{font-size:20px;font-weight:650;letter-spacing:-.01em;line-height:1.35}.q small{display:block;font-size:13px;font-weight:400;color:var(--ink2);margin-top:6px}
.gates{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.gate{display:flex;align-items:center;gap:8px;background:var(--okbg);color:var(--ok);border-radius:999px;padding:6px 14px 6px 8px;font-size:13px;font-weight:650}
.gate i{width:20px;height:20px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;font-style:normal;font-size:12px}
.gate.n{background:var(--chip);color:var(--ink2);font-weight:500}
.change{margin-top:12px;font-size:14px;color:var(--ink2)}.change b{color:var(--accent2)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:900px){.pair{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}
.imgw{background:#fff;display:grid;place-items:center;border-bottom:1px solid var(--line);position:relative}
.imgw img{max-width:100%;max-height:470px;display:block}
.badge{position:absolute;top:12px;left:12px;background:var(--ink);color:var(--panel);font-weight:750;font-size:13px;padding:4px 11px;border-radius:999px}
.cb{padding:14px 16px;display:grid;gap:10px}
.truth{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.truth .k{font-size:13px;color:var(--ink2)}
.truth .v{font-size:26px;font-weight:800;color:var(--ok);letter-spacing:-.02em}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;color:var(--ink2)}
.knobs{display:flex;flex-wrap:wrap;gap:6px}.knobs span{background:var(--chip);border-radius:8px;padding:3px 9px;font-size:12px;color:var(--ink2)}
.ans{border-radius:12px;padding:10px 12px;display:none}.ans.ok{background:var(--okbg);display:block}.ans.bad{background:var(--badbg);display:block}
.ans .v{font-size:20px;font-weight:800}.ans.ok .v{color:var(--ok)}.ans.bad .v{color:var(--bad)}
.ans details{margin-top:4px}.ans summary{cursor:pointer;font-size:12.5px;color:var(--ink2)}
.ans pre{white-space:pre-wrap;font-size:12px;max-height:150px;overflow:auto;margin:6px 0 0}
.loading{opacity:.45;transition:opacity .2s}
.tog{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;color:var(--ink2);cursor:pointer;padding:10px 4px}
.tog input{width:18px;height:18px;accent-color:var(--accent2)}
.empty{color:var(--ink2);padding:30px;text-align:center}
footer{color:var(--muted);font-size:12.5px;text-align:center;padding-bottom:20px}
</style></head><body>
<header><div class=logo><i>◆</i>PixelProof Studio</div><div class=stats id=stats></div>
<a class=rep id=replink href="/report" target=_blank style="display:none">Findings report ↗</a></header>
<main>
<section class=panel>
<div class=lab>1 · Task family</div><div class=fams id=fams></div>
<div class=row>
<div><div class=lab>2 · Difficulty</div><div class=seg id=lv></div></div>
<div><div class=lab>Seed</div><input id=seed type=number value=1></div>
<button class=btn id=go>Generate twins</button><button class="btn sec" id=rnd>🎲 Random</button>
<label class=tog><input type=checkbox id=hl> Highlight what changed</label>
<button class="btn ai" id=ask style="display:none">Ask model</button>
</div></section>
<section class=panel id=qp><div class=empty>Pick a family and press <b>Generate twins</b>.</div></section>
<section class=pair id=pair></section>
</main>
<footer>Every answer re-derived from pixels · every question proven to need the image</footer>
<script>
const $=s=>document.querySelector(s);let cur=null,MODEL=null,FAM='gauge',LV=2;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
fetch('/api/info').then(r=>r.json()).then(d=>{MODEL=d.model;
 if(d.report)$('#replink').style.display='';
 const st=d.stats;let h='';
 if(st){h+=`<span class=stat><b>${st.tasks}</b> tasks</span><span class=stat><b>${st.pairs}</b> twin pairs</span><span class="stat ok"><b>✓ ${st.tasks}/${st.tasks}</b> verified from pixels</span>`;
  if(st.vision)h+=`<span class=stat>${esc(st.vision.model)}: <b>${st.vision.pair_acc}</b> pair acc.</span>`}
 $('#stats').innerHTML=h;
 $('#fams').innerHTML=d.families.map(f=>`<button class=fam data-f="${f.name}"><b>${esc(f.title)}</b><span>${esc(f.short)}</span></button>`).join('');
 document.querySelectorAll('.fam').forEach(b=>b.onclick=()=>{FAM=b.dataset.f;sync()});
 $('#lv').innerHTML=d.level_names.map((n,i)=>`<button data-l=${i}>L${i}<small>${n}</small></button>`).join('');
 document.querySelectorAll('#lv button').forEach(b=>b.onclick=()=>{LV=+b.dataset.l;sync()});
 if(MODEL){$('#ask').style.display='';$('#ask').textContent='Ask '+MODEL.split(':').pop()}
 sync();gen()});
function sync(){document.querySelectorAll('.fam').forEach(b=>b.classList.toggle('on',b.dataset.f===FAM));
 document.querySelectorAll('#lv button').forEach(b=>b.classList.toggle('on',+b.dataset.l===LV))}
$('#hl').onchange=()=>{if(!cur||cur.error)return;document.querySelectorAll('img.tw').forEach(i=>{const t=cur[i.dataset.r];i.src=$('#hl').checked?t.img_diff:t.img})};
$('#go').onclick=gen;$('#rnd').onclick=()=>{$('#seed').value=Math.floor(Math.random()*1e5);gen()};
async function gen(){$('#pair').classList.add('loading');$('#qp').classList.add('loading');$('#ask').disabled=true;
 const p=new URLSearchParams({family:FAM,level:LV,seed:$('#seed').value});
 const d=await (await fetch('/api/pair?'+p)).json();cur=d;$('#pair').classList.remove('loading');$('#qp').classList.remove('loading');
 if(d.error){$('#qp').innerHTML=`<div class=empty>${esc(d.error)}</div>`;return}
 $('#ask').disabled=false;
 $('#qp').innerHTML=`<div class=lab>Question · identical for both twins</div><div class=q>${esc(d.question)}<small>Answer format: ${esc(d.format)}</small></div>
 <div class=gates>${d.gates.map(g=>`<span class=gate title="${esc(g[1])}"><i>✓</i>${esc(g[0].replace('_',' · '))}</span>`).join('')}
 <span class="gate n">${d.funnel.candidates} candidate(s) screened · ${d.funnel.rejected} rejected</span></div>
 <div class=change>What differs between the twins: <b>${esc(d.changed)}</b> — so the correct answer differs.</div>`;
 $('#pair').innerHTML=['A','B'].map(r=>{const t=d[r];return `<div class=card><div class=imgw><span class=badge>Twin ${r}</span><img class=tw data-r="${r}" src="${$('#hl').checked?t.img_diff:t.img}" alt="twin ${r}"></div><div class=cb>
 <div class=truth><span class=k>Ground truth</span><span class=v>${esc(t.answer)}</span>${t.tol?`<span class=mono>± ${t.tol}</span>`:''}</div>
 <div class=mono>Independent pixel verifier read: <b>${esc(t.verifier)}</b> ✓ agrees</div>
 <div class=knobs>${Object.entries(t.knobs).map(([k,v])=>`<span>${esc(k)}: ${esc(v)}</span>`).join('')}</div>
 <div class=ans id=m${r}></div></div></div>`}).join('')}
$('#ask').onclick=async()=>{if(!cur)return;$('#ask').disabled=true;const old=$('#ask').textContent;$('#ask').textContent='Asking…';
 for(const r of ['A','B']){const e=$('#m'+r);e.className='ans ok';e.style.background='var(--chip)';e.innerHTML='<span class=mono>Model is looking at the image…</span>'}
 const d=await (await fetch('/api/ask',{method:'POST',body:JSON.stringify({key:cur.key})})).json();
 for(const r of ['A','B']){const x=d[r],e=$('#m'+r);if(!x)continue;e.style.background='';e.className='ans '+(x.correct?'ok':'bad');
  e.innerHTML=`<div class=k style="font-size:13px;color:var(--ink2)">${esc(MODEL)} answered</div><div class=v>${esc(x.pred??'no answer')} ${x.correct?'✓ correct':'✗ '+esc(x.kind.replaceAll('_',' '))}</div>
  <details><summary>model's reasoning</summary><pre>${esc(x.raw.slice(-900))}</pre></details>`}
 $('#ask').disabled=false;$('#ask').textContent=old}
</script></body></html>"""

_STORE: dict[str, dict] = {}
SHORT = {
    "gauge": "Plant instruments", "chart": "Report charts", "wires": "Wiring diagrams",
    "count": "Inventory & QC", "spatial": "Layouts & planograms", "maze": "Floor-plan routes",
}


def _diff_overlays(ia, ib):
    """Circle the regions where the twins' pixels differ (computed from the images, nothing else)."""
    from PIL import ImageDraw

    from .core import components
    a = np.asarray(ia.convert("RGB")).astype(int)
    b = np.asarray(ib.convert("RGB")).astype(int)
    m = np.abs(a - b).max(-1) > 60
    if m.shape[0] * m.shape[1] and m.any():
        d = m.copy()
        for _ in range(6):  # dilate so nearby changed pixels merge into one region
            d[1:] |= d[:-1]
            d[:-1] |= d[1:]
            d[:, 1:] |= d[:, :-1]
            d[:, :-1] |= d[:, 1:]
        comps = sorted(components(d, min_px=30), key=len, reverse=True)[:4]
    else:
        comps = []
    outs = []
    for im in (ia, ib):
        im = im.convert("RGB").copy()
        dr = ImageDraw.Draw(im)
        for c in comps:
            y0, x0 = c.min(0)
            y1, x1 = c.max(0)
            pad = 8
            dr.rounded_rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], radius=12, outline=(232, 119, 46), width=4)
        outs.append("data:image/png;base64," + base64.b64encode(png_bytes(im)).decode())
    return outs


def _pair(family: str, level: int, seed: int):
    fam = REGISTRY[family]
    funnel = Counter()
    res = build_pair(fam, random.Random(seed * 7919 + level), level, None, funnel, [])
    if res is None:
        return {"error": "no valid pair found for this seed — try another"}
    pa, ia, pb, ib, _checks = res
    q, fmt = fam.question(pa)
    key = f"{family}-{level}-{seed}"
    out = {"key": key, "question": q, "format": fmt, "gates": [(k, d) for k, d in STAGES], "changed": CHANGED[family],
           "funnel": {"candidates": funnel["candidates"], "rejected": funnel["candidates"] - 1}}
    store = {"q": q, "fmt": fmt}
    for role, p, img in (("A", pa, ia), ("B", pb, ib)):
        b = png_bytes(img)
        a = fam.answer(p)
        v = fam.verify(np.asarray(img), fam.public(p), p["q"])
        out[role] = {"img": "data:image/png;base64," + base64.b64encode(b).decode(), "answer": a.value, "tol": a.tol,
                     "verifier": round(v, 2) if isinstance(v, float) else v, "knobs": fam.knobs(p)}
        store[role] = {"png": b, "answer": a}
    out["A"]["img_diff"], out["B"]["img_diff"] = _diff_overlays(ia, ib)
    _STORE[key] = store
    return out


def _stats(ds: Path):
    try:
        man = json.loads((ds / "manifest.json").read_text())
    except (OSError, ValueError):
        return None
    st = {"tasks": man["tasks"], "pairs": man["funnel_total"].get("accepted_pairs", 0)}
    try:
        from .scoring import load_results, summarize
        best = None
        for f in sorted((ds / "results").glob("*.jsonl")):
            rs = load_results(f)
            if rs and not rs[0]["model"].startswith(("baseline", "blind")):
                s = summarize(rs)
                best = {"model": rs[0]["model"].split(":")[-1], "pair_acc": f"{s['pair_acc'] * 100:.0f}%"}
        st["vision"] = best
    except Exception:  # noqa: BLE001
        pass
    return st


def serve(port: int = 8765, model_spec: str | None = None, host: str = "127.0.0.1", report: str | None = None,
          open_browser: bool = False):
    model = make_model(model_spec) if model_spec else None
    report_path = Path(report) if report else None
    ds = report_path.parent if report_path else Path("data/demo")
    cache_path = Path("data") / ".studio_cache.jsonl"
    lock = threading.Lock()
    cache = {}
    if cache_path.exists():
        for line in cache_path.read_text().splitlines():
            try:
                r = json.loads(line)
                cache[r["k"]] = r["text"]
            except (ValueError, KeyError):
                pass

    def ask_cached(png, q, fmt):
        k = hashlib.sha256(f"{model.name}|{sha256(png)}|{q}|{SYSTEM}".encode()).hexdigest()
        if k in cache:
            return cache[k]
        text = model.ask(png, q, fmt)["text"]
        with lock:
            cache[k] = text
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_path, "a") as fh:
                fh.write(json.dumps({"k": k, "text": text}) + "\n")
        return text

    class H(BaseHTTPRequestHandler):
        def _send(self, code, body, ctype="application/json"):
            b = body if isinstance(body, bytes) else body.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def log_message(self, *a):
            pass

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            qs = dict(urllib.parse.parse_qsl(u.query))
            if u.path == "/":
                return self._send(200, PAGE, "text/html; charset=utf-8")
            if u.path == "/report" and report_path and report_path.exists():
                return self._send(200, report_path.read_bytes(), "text/html; charset=utf-8")
            if u.path in ("/api/info", "/api/families"):
                return self._send(200, json.dumps({
                    "model": model.name if model else None, "levels": LEVELS, "level_names": LEVEL_NAMES,
                    "report": bool(report_path and report_path.exists()), "stats": _stats(ds),
                    "families": [{"name": k, "title": REGISTRY[k].title, "short": SHORT.get(k, "")}
                                 for k in ("gauge", "chart", "wires", "count", "spatial", "maze") if k in REGISTRY]}))
            if u.path == "/api/pair":
                try:
                    d = _pair(qs.get("family", "gauge"), int(qs.get("level", 2)), int(qs.get("seed", 1)))
                except Exception as e:  # noqa: BLE001
                    d = {"error": str(e)}
                return self._send(200, json.dumps(d, default=str))
            self._send(404, "{}")

        def do_POST(self):
            if self.path != "/api/ask" or model is None:
                return self._send(404, "{}")
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            st = _STORE.get(body.get("key"))
            if not st:
                return self._send(404, "{}")
            out = {}

            def one(role):
                try:
                    text = ask_cached(st[role]["png"], st["q"], st["fmt"])
                    pred, _ = parse(text, st[role]["answer"])
                    kind = classify_error(pred, st[role]["answer"])
                    out[role] = {"pred": pred if pred is None or isinstance(pred, str) else f"{pred:g}",
                                 "correct": kind == "correct", "kind": kind, "raw": text}
                except Exception as e:  # noqa: BLE001
                    out[role] = {"pred": None, "correct": False, "kind": "error", "raw": str(e)}

            ts = [threading.Thread(target=one, args=(r,)) for r in ("A", "B")]
            for t in ts:
                t.start()
            for t in ts:
                t.join()
            self._send(200, json.dumps(out, default=str))

    srv = None
    for p in range(port, port + 30):  # if the port is taken (e.g. another dev server), use the next free one
        try:
            srv = ThreadingHTTPServer((host, p), H)
            break
        except OSError:
            print(f"Port {p} is busy, trying {p + 1}...")
    if srv is None:
        raise SystemExit(f"No free port between {port} and {port + 29}; pass --port")
    port = srv.server_address[1]
    url = f"http://{host}:{port}"
    print(f"PixelProof Studio on {url}  (model: {model.name if model else 'none'})")
    if report_path and report_path.exists():
        print(f"Findings report on {url}/report")
    print("Press Ctrl+C to stop.")
    if open_browser:
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    srv.serve_forever()
