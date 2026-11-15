"""Failure-Frontier Search: an adaptive staircase that finds where a model breaks, per family,
with a small, fixed API budget, and harvests the verified failures as a 'hard set'."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from .core import LEVELS
from .pipeline import generate, load_tasks
from .scoring import evaluate, load_results, summarize


def frontier(model_spec: str, out: str | Path, families: list[str], rounds: int = 6, pairs: int = 3,
             start: int = 2, seed: int = 101, workers: int = 4, verbose: bool = True) -> dict:
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    hard = out / "hardset"
    (hard / "images").mkdir(parents=True, exist_ok=True)
    report = {"model": model_spec, "families": {}}
    calls = 0
    with open(hard / "tasks.jsonl", "w") as hard_fh:
        for fam in families:
            level, hist = start, []
            for r in range(rounds):
                ds = out / fam / f"round{r}-L{level}"
                if not (ds / "tasks.jsonl").exists():
                    generate(ds, families=[fam], levels=[level], pairs_per_level=pairs, seed=seed * 1000 + r,
                             verbose=False)
                res_path = evaluate(ds, model_spec, workers=workers, verbose=False)
                rs = load_results(res_path)
                calls += sum(not x["cached"] for x in rs)
                s = summarize(rs)
                hist.append({"round": r, "level": level, "pair_acc": s["pair_acc"], "acc": s["acc"], "pairs": s["pairs"]})
                if verbose:
                    print(f"  {fam:8s} round {r}: L{level} pair_acc={s['pair_acc']:.0%}", flush=True)
                tasks = {t.id: t for t in load_tasks(ds)}
                for x in rs:
                    if not x["correct"] and x["id"] in tasks:
                        t = tasks[x["id"]]
                        dst = hard / "images" / f"{fam}-r{r}-{Path(t.image).name}"
                        shutil.copy(ds / t.image, dst)
                        d = json.loads(t.to_json())
                        d["image"] = f"images/{dst.name}"
                        d["id"] = f"{fam}-r{r}-{t.id}"
                        d["model_pred"] = x["pred"]
                        hard_fh.write(json.dumps(d) + "\n")
                level = min(LEVELS - 1, level + 1) if s["pair_acc"] >= 0.5 else max(0, level - 1)
            # threshold estimate: mean level of the last half of the staircase (classic up/down estimator)
            tail = hist[len(hist) // 2:]
            est = sum(h["level"] for h in tail) / len(tail)
            report["families"][fam] = {"history": hist, "threshold_level": round(est, 2)}
    report["api_calls"] = calls
    (out / "frontier.json").write_text(json.dumps(report, indent=2))
    return report
