"""Strict answer parsing, evaluation loop (cached, budgeted, parallel) and metrics."""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .core import SHAPES, Answer, normalise_label
from .models import SYSTEM, make_model
from .pipeline import load_tasks

COLOR_WORDS = ["red", "blue", "green", "orange", "purple", "pink", "teal", "brown", "gray", "black"]
_NUM = re.compile(r"[-−]?\d+(?:\.\d+)?")


def parse(text: str, ans: Answer):
    """Return (value, strict) where strict means an explicit 'ANSWER:' line was found."""
    if not text:
        return None, False
    hits = re.findall(r"ANSWER\s*[:：]\s*(.+)", text, flags=re.I)
    if not hits:  # strict: no explicit answer line (e.g. truncated rambling) -> unparsed, never guessed
        return None, False
    strict = True
    s = hits[-1]
    s = s.strip().strip("*`").strip()
    if ans.kind in ("int", "float"):
        m = _NUM.search(s.replace(",", "").replace("−", "-"))
        return (float(m.group()) if m else None), strict
    norm = normalise_label(s)
    words = norm.split()
    col = next((w for w in words if w in COLOR_WORDS), None)
    shp = next((w for w in words if w in SHAPES), None)
    if col and shp:
        return f"{col} {shp}", strict
    return norm or None, strict


def classify_error(pred, ans: Answer) -> str:
    if pred is None:
        return "unparsed"
    if ans.matches(pred):
        return "correct"
    if ans.kind == "int":
        return "off_by_one" if abs(float(pred) - float(ans.value)) <= 1 else "wrong"
    if ans.kind == "float":
        return "near_miss" if abs(float(pred) - float(ans.value)) <= 3 * max(ans.tol, 1e-9) else "wrong"
    return "wrong"


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def evaluate(ds: str | Path, model_spec: str, limit_pairs: int | None = None, budget_calls: int | None = None,
             workers: int = 4, families: list[str] | None = None, verbose: bool = True) -> Path:
    ds = Path(ds)
    tasks = load_tasks(ds)
    if families:
        tasks = [t for t in tasks if t.family in families]
    model = make_model(model_spec, tasks)
    if limit_pairs:
        keep, seen = set(), Counter()
        for t in tasks:
            k = (t.family, t.difficulty)
            if t.pair_id in keep or seen[k] < limit_pairs:
                if t.pair_id not in keep:
                    seen[k] += 1
                keep.add(t.pair_id)
        tasks = [t for t in tasks if t.pair_id in keep]
    (ds / "cache").mkdir(exist_ok=True)
    (ds / "results").mkdir(exist_ok=True)
    cache_file = ds / "cache" / f"{_safe(model.name)}.jsonl"
    cache = {}
    if cache_file.exists():
        for line in cache_file.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                cache[r["key"]] = r
    lock = threading.Lock()
    calls = Counter()

    def run(t):
        key = hashlib.sha256(f"{model.name}|{t.image_sha256}|{t.question}|{SYSTEM}".encode()).hexdigest()
        if key in cache:
            r = cache[key]
            cached = True
        else:
            with lock:
                if budget_calls is not None and calls["api"] >= budget_calls:
                    return None
                calls["api"] += 1
            img = (ds / t.image).read_bytes() if model.uses_image else None
            t0 = time.time()
            try:
                out = model.ask(img, t.question, t.answer_format, task=t)
                r = {"key": key, "text": out.get("text", ""), "tokens_in": out.get("tokens_in"),
                     "tokens_out": out.get("tokens_out"), "latency": round(time.time() - t0, 2), "error": None}
            except Exception as e:  # noqa: BLE001 — recorded, scored as unparsed
                r = {"key": key, "text": "", "error": str(e)[:300], "latency": round(time.time() - t0, 2)}
            if not r["error"]:
                with lock:
                    cache[key] = r
                    with open(cache_file, "a") as fh:
                        fh.write(json.dumps(r) + "\n")
            cached = False
        ans = t.ans()
        pred, strict = parse(r["text"], ans)
        kind = classify_error(pred, ans)
        return {"model": model.name, "id": t.id, "pair_id": t.pair_id, "role": t.role, "family": t.family, "qtype": t.qtype,
                "difficulty": t.difficulty, "truth": ans.value, "tol": ans.tol, "pred": pred, "strict": strict,
                "correct": kind == "correct", "kind": kind, "chance": t.chance, "error": r.get("error"),
                "cached": cached, "latency": r.get("latency"), "tokens_in": r.get("tokens_in"),
                "tokens_out": r.get("tokens_out"), "raw": (r["text"] or "")[-600:]}

    results = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for i, res in enumerate(ex.map(run, tasks)):
            if res is not None:
                results.append(res)
            if verbose and (i + 1) % 20 == 0:
                print(f"  {model.name}: {i + 1}/{len(tasks)} tasks", flush=True)
    out = ds / "results" / f"{_safe(model.name)}.jsonl"
    with open(out, "w") as fh:
        for r in results:
            fh.write(json.dumps(r) + "\n")
    if verbose:
        s = summarize(results)
        print(f"  {model.name}: acc={s['acc']:.1%} pair_acc={s['pair_acc']:.1%} api_calls={calls['api']} "
              f"errors={sum(1 for r in results if r['error'])}")
    return out


def load_results(path: str | Path) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def _pairs(results):
    by = defaultdict(dict)
    for r in results:
        by[r["pair_id"]][r["role"]] = r
    return {k: v for k, v in by.items() if "A" in v and "B" in v}


def summarize(results: list[dict]) -> dict:
    if not results:
        return dict(n=0, acc=0, pair_acc=0)
    pairs = _pairs(results)
    n = len(results)
    acc = sum(r["correct"] for r in results) / n
    pair_acc = sum(p["A"]["correct"] and p["B"]["correct"] for p in pairs.values()) / max(1, len(pairs))
    # Visual sensitivity: did the model change its answer when only the decisive visual detail changed?
    parsed = [p for p in pairs.values() if p["A"]["pred"] is not None and p["B"]["pred"] is not None]
    sens = sum(str(p["A"]["pred"]) != str(p["B"]["pred"]) for p in parsed) / max(1, len(parsed))
    chance = sum(r["chance"] for r in results) / n
    pair_chance = sum(p["A"]["chance"] * p["B"]["chance"] for p in pairs.values()) / max(1, len(pairs))
    kinds = Counter(r["kind"] for r in results)
    by_fam = defaultdict(list)
    by_fl = defaultdict(list)
    for r in results:
        by_fam[r["family"]].append(r)
        by_fl[(r["family"], r["difficulty"])].append(r)

    def block(rs):
        ps = _pairs(rs)
        return dict(n=len(rs), acc=sum(r["correct"] for r in rs) / len(rs),
                    pair_acc=sum(p["A"]["correct"] and p["B"]["correct"] for p in ps.values()) / max(1, len(ps)),
                    pairs=len(ps))

    fam = {f: block(rs) for f, rs in by_fam.items()}
    grid = {f"{f}|{lv}": block(rs) for (f, lv), rs in by_fl.items()}
    breaking = {}
    for f in by_fam:
        lv_acc = sorted((lv, grid[f"{f}|{lv}"]["pair_acc"]) for (ff, lv) in by_fl
                        if ff == f and grid[f"{f}|{lv}"]["pairs"] > 0)
        breaking[f] = next((lv for lv, a in lv_acc if a < 0.5), None)
    tok_in = sum(r.get("tokens_in") or 0 for r in results)
    tok_out = sum(r.get("tokens_out") or 0 for r in results)
    return dict(n=n, pairs=len(pairs), acc=acc, pair_acc=pair_acc, sensitivity=sens, chance=chance,
                pair_chance=pair_chance, kinds=dict(kinds), unparsed=kinds.get("unparsed", 0) / n,
                strict_format=sum(r["strict"] for r in results) / n, by_family=fam, grid=grid, breaking=breaking,
                tokens_in=tok_in, tokens_out=tok_out, errors=sum(1 for r in results if r.get("error")))
