"""Generation pipeline: sample -> validity gauntlet -> counterfactual twin -> dataset on disk."""
from __future__ import annotations

import hashlib
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from .core import LEVELS, REGISTRY, VERSION, Task, ahash, hamming, png_bytes, sha256

# Gauntlet stages (in order). A candidate pair must pass all of them to enter the dataset.
STAGES = [
    ("G1_evidence", "Image carries sufficient evidence (sizes, margins, no ambiguous overlaps)"),
    ("G2_verifier", "Independent pixel-level verifier recomputes the same answer from the rendered image"),
    ("G3_twin", "A minimal counterfactual twin exists: same question, different answer, also verified"),
    ("G4_dedup", "Not a near-duplicate of an accepted image (perceptual hash)"),
]


def _seed(*parts) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12], 16)


def build_pair(fam, rng: random.Random, level: int, qtype: str | None, funnel: Counter, hashes: list[str],
               max_tries: int = 600):
    """Try candidates until one pair passes the gauntlet. Returns (params_a, img_a, params_b, img_b, checks)."""
    for _ in range(max_tries):
        funnel["candidates"] += 1
        p = fam.sample(rng, level, qtype)
        issues = fam.evidence(p)
        if issues:
            funnel["G1_evidence"] += 1
            continue
        img = fam.render(p)
        ans = fam.answer(p)
        v = fam.verify(np.asarray(img), fam.public(p), p["q"])
        if not ans.matches(v):
            funnel["G2_verifier"] += 1
            continue
        t = None
        for _k in range(4):
            t = fam.twin(p, rng)
            if t is not None and not fam.evidence(t):
                break
            t = None
        if t is None:
            funnel["G3_twin"] += 1
            continue
        tans = fam.answer(t)
        if fam.question(t) != fam.question(p) or tans.matches(ans.value) or ans.matches(tans.value):
            funnel["G3_twin"] += 1
            continue
        timg = fam.render(t)
        tv = fam.verify(np.asarray(timg), fam.public(t), t["q"])
        if not tans.matches(tv):
            funnel["G3_twin"] += 1
            continue
        ha, hb = ahash(img), ahash(timg)
        if any(hamming(ha, h) <= 3 for h in hashes):
            funnel["G4_dedup"] += 1
            continue
        hashes += [ha, hb]
        funnel["accepted_pairs"] += 1
        checks = {"G1_evidence": "pass", "G2_verifier": {"A": _jsonable(v), "B": _jsonable(tv)},
                  "G3_twin": "pass: same question text, different answer", "G4_dedup": "pass",
                  "blind_safe": "pair shares identical question text with different answers"}
        return p, img, t, timg, checks
    return None


def _jsonable(v):
    if isinstance(v, (np.floating, np.integer)):
        return v.item()
    if isinstance(v, float):
        return round(v, 4)
    return v


def generate(out: str | Path, families: list[str] | None = None, levels: list[int] | None = None,
             pairs_per_level: int = 4, seed: int = 7, qtypes: dict | None = None, verbose: bool = True) -> dict:
    out = Path(out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    families = families or sorted(REGISTRY)
    levels = list(range(LEVELS)) if levels is None else levels
    funnel_by_fam: dict[str, Counter] = defaultdict(Counter)
    t0 = time.time()
    hashes: list[str] = []
    n = 0
    with open(out / "tasks.jsonl", "w") as fh:
        for fname in families:
            fam = REGISTRY[fname]
            for level in levels:
                for i in range(pairs_per_level):
                    qt = None
                    if len(fam.qtypes) > 1:
                        qt = fam.qtypes[i % len(fam.qtypes)]
                    if qtypes and fname in qtypes:
                        qt = qtypes[fname]
                    s = _seed(seed, fname, level, i)
                    rng = random.Random(s)
                    res = build_pair(fam, rng, level, qt, funnel_by_fam[fname], hashes)
                    if res is None:
                        continue
                    pa, ia, pb, ib, checks = res
                    pid = f"{fname}-L{level}-{i:04d}"
                    for role, p, img in (("A", pa, ia), ("B", pb, ib)):
                        b = png_bytes(img)
                        rel = f"images/{pid}-{role}.png"
                        (out / rel).write_bytes(b)
                        q, fmt = fam.question(p)
                        task = Task(id=f"{pid}-{role}", pair_id=pid, role=role, family=fname,
                                    qtype=p["q"].get("qtype", fam.qtypes[0]), difficulty=level, knobs=fam.knobs(p),
                                    question=q, answer_format=fmt, answer=fam.answer(p).to_dict(), public=fam.public(p),
                                    params=p, seed=s, image=rel, image_sha256=sha256(b), checks=checks,
                                    chance=fam.chance(p))
                        fh.write(task.to_json() + "\n")
                        n += 1
                if verbose:
                    print(f"  {fname:8s} L{level}: {funnel_by_fam[fname]['accepted_pairs']} pairs so far", flush=True)
    funnel_total = Counter()
    for c in funnel_by_fam.values():
        funnel_total.update(c)
    manifest = dict(version=VERSION, seed=seed, families=families, levels=levels, pairs_per_level=pairs_per_level,
                    tasks=n, seconds=round(time.time() - t0, 1), stages=STAGES,
                    funnel={k: dict(v) for k, v in funnel_by_fam.items()}, funnel_total=dict(funnel_total),
                    family_info={f: dict(title=REGISTRY[f].title, application=REGISTRY[f].application,
                                         skill=REGISTRY[f].skill, qtypes=REGISTRY[f].qtypes,
                                         knobs=REGISTRY[f].knob_doc) for f in families})
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def load_tasks(ds: str | Path) -> list[Task]:
    with open(Path(ds) / "tasks.jsonl") as fh:
        return [Task.from_dict(json.loads(line)) for line in fh if line.strip()]


def revalidate(ds: str | Path) -> dict:
    """Re-run the independent verifier + integrity checks on a dataset on disk (anyone can audit it)."""
    from PIL import Image
    ds = Path(ds)
    ok = bad = 0
    problems = []
    for t in load_tasks(ds):
        b = (ds / t.image).read_bytes()
        if sha256(b) != t.image_sha256:
            problems.append((t.id, "image hash mismatch"))
            bad += 1
            continue
        fam = REGISTRY[t.family]
        v = fam.verify(np.asarray(Image.open(ds / t.image).convert("RGB")), t.public, t.params["q"])
        if t.ans().matches(v):
            ok += 1
        else:
            bad += 1
            problems.append((t.id, f"verifier={v} truth={t.answer['value']}"))
    return dict(ok=ok, bad=bad, problems=problems[:20])
