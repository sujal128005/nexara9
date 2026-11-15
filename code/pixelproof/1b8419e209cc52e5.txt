"""Spatial-relation reasoning over a layout (site plans, shelf/planogram, floor layouts)."""
from __future__ import annotations

import copy
import math
import random

import numpy as np

from ..core import PALETTE, SHAPES, Answer, Canvas, Family, classify_shape, color_mask, components, draw_shape, register

W = H = 560
M = 26
COLORS = ["red", "blue", "green", "orange", "purple", "pink", "teal", "brown"]
DIRS = {"above": (1, -1), "below": (1, 1), "left of": (0, -1), "right of": (0, 1)}
ORDINAL = {1: "first", 2: "second", 3: "third", 4: "fourth"}


@register
class Spatial(Family):
    name = "spatial"
    title = "Spatial relations"
    application = "Layout checks: planogram compliance, site-plan / floor-plan questions, robot pick targets."
    skill = "Metric distance comparison, relational counting and ordering by position"
    qtypes = ["nearest", "count_rel", "order"]
    knob_doc = {"n_objects": "objects in scene", "ratio": "2nd-nearest / nearest distance ratio",
                "margin_px": "min clearance from decision boundaries", "radius": "object size"}

    LEVELS = [
        dict(n=4, r=(26, 30), ratio=1.8, margin=40, conj=False),
        dict(n=6, r=(22, 27), ratio=1.5, margin=28, conj=False),
        dict(n=8, r=(18, 24), ratio=1.35, margin=20, conj=True),
        dict(n=11, r=(15, 21), ratio=1.22, margin=14, conj=True),
        dict(n=14, r=(13, 19), ratio=1.12, margin=10, conj=True),
    ]

    def _ids(self, rng, n, conj):
        if not conj:
            cols = rng.sample(COLORS, n)
            return [(c, rng.choice(SHAPES)) for c in cols]
        pool = [(c, s) for c in COLORS for s in SHAPES]
        return rng.sample(pool, n)

    def _free(self, rng, objs, r, skip=None, tries=500, near=None):
        for _ in range(tries):
            if near:
                ang, d = rng.uniform(0, 2 * math.pi), near[2]
                x, y = near[0] + d * math.cos(ang), near[1] + d * math.sin(ang)
                if not (M + r < x < W - M - r and M + r < y < H - M - r):
                    continue
            else:
                x, y = rng.uniform(M + r, W - M - r), rng.uniform(M + r, H - M - r)
            if all(math.hypot(x - o["x"], y - o["y"]) > r + o["r"] + 8 for i, o in enumerate(objs) if i != skip):
                return x, y
        return None

    def sample(self, rng: random.Random, level: int, qtype=None):
        L = self.LEVELS[level]
        objs = []
        for c, s in self._ids(rng, L["n"], L["conj"]):
            r = rng.uniform(*L["r"])
            xy = self._free(rng, objs, r)
            if xy is None:
                return self.sample(rng, level, qtype)
            objs.append(dict(color=c, shape=s, x=xy[0], y=xy[1], r=r, rot=rng.uniform(0, 2 * math.pi)))
        qtype = qtype or rng.choice(self.qtypes)
        q = {"qtype": qtype, "ref": [objs[0]["color"], objs[0]["shape"]]}
        rng.shuffle(objs)
        if qtype == "count_rel":
            q["dir"] = rng.choice(list(DIRS))
        if qtype == "order":
            q["k"] = rng.randint(1, min(4, L["n"]))
            q["from"] = rng.choice(["left", "top"])
            q.pop("ref")
        return dict(level=level, objs=objs, ratio=L["ratio"], margin=L["margin"], q=q)

    def render(self, p):
        cv = Canvas(W, H, bg=(250, 250, 248))
        for o in p["objs"]:
            draw_shape(cv, o["shape"], o["x"], o["y"], o["r"], o["rot"], PALETTE[o["color"]])
        return cv.finish()

    @staticmethod
    def _name(cs):
        return f"{cs[0]} {cs[1]}"

    def question(self, p):
        q = p["q"]
        if q["qtype"] == "nearest":
            return (f"Which object's centre is closest to the centre of the {self._name(q['ref'])}?",
                    "colour and shape of the object, e.g. 'blue square'")
        if q["qtype"] == "count_rel":
            return (f"How many objects have their centre {q['dir']} the centre of the {self._name(q['ref'])}?",
                    "a whole number")
        side = "left" if q["from"] == "left" else "top"
        return (f"Ordering all objects by the position of their centres from the {side} edge, which object is "
                f"{ORDINAL[q['k']]}?", "colour and shape of the object, e.g. 'blue square'")

    # Solve from a list of (color, shape, x, y) — shared by generator and verifier.
    @staticmethod
    def _solve(items, q):
        if q["qtype"] == "order":
            key = 2 if q["from"] == "left" else 3
            srt = sorted(items, key=lambda t: t[key])
            return f"{srt[q['k'] - 1][0]} {srt[q['k'] - 1][1]}"
        ref = [t for t in items if [t[0], t[1]] == list(q["ref"])]
        if len(ref) != 1:
            return None
        ref = ref[0]
        others = [t for t in items if t is not ref]
        if q["qtype"] == "nearest":
            b = min(others, key=lambda t: math.hypot(t[2] - ref[2], t[3] - ref[3]))
            return f"{b[0]} {b[1]}"
        axis, sign = DIRS[q["dir"]]
        idx = 3 if axis == 1 else 2
        return sum((t[idx] - ref[idx]) * sign > 0 for t in others)

    def _items(self, p):
        return [(o["color"], o["shape"], o["x"], o["y"]) for o in p["objs"]]

    def answer(self, p):
        sol = self._solve(self._items(p), p["q"])
        if isinstance(sol, str):
            return Answer("label", sol, space=len(p["objs"]) - (0 if p["q"]["qtype"] == "order" else 1))
        return Answer("int", sol, space=len(p["objs"]))

    def knobs(self, p):
        return dict(n_objects=len(p["objs"]), ratio=p["ratio"], margin_px=p["margin"],
                    radius=round(min(o["r"] for o in p["objs"]), 1), qtype=p["q"]["qtype"])

    def public(self, p):
        return dict(palette={k: PALETTE[k] for k in COLORS})

    def evidence(self, p):
        q, items = p["q"], self._items(p)
        issues = []
        if q["qtype"] == "order":
            key = 2 if q["from"] == "left" else 3
            v = sorted(t[key] for t in items)
            k = q["k"] - 1
            gaps = [v[k] - v[k - 1]] if k > 0 else []
            if k + 1 < len(v):
                gaps.append(v[k + 1] - v[k])
            if min(gaps) < p["margin"]:
                issues.append("ordering ambiguous (centres too close)")
            return issues
        ref = [t for t in items if [t[0], t[1]] == list(q["ref"])][0]
        others = [t for t in items if t is not ref]
        if q["qtype"] == "nearest":
            d = sorted(math.hypot(t[2] - ref[2], t[3] - ref[3]) for t in others)
            if d[1] / d[0] < p["ratio"] or d[1] - d[0] < p["margin"] * 0.6:
                issues.append("nearest neighbour not clearly nearest")
            if d[1] / d[0] > p["ratio"] * 2.2:
                issues.append("too easy: nearest is trivially close")
        else:
            axis, _ = DIRS[q["dir"]]
            idx = 3 if axis == 1 else 2
            if any(abs(t[idx] - ref[idx]) < p["margin"] for t in others):
                issues.append("object straddles the reference line")
        return issues

    def twin(self, p, rng):
        t = copy.deepcopy(p)
        q, objs = t["q"], t["objs"]
        old = self.answer(p).value
        for _ in range(60):
            t = copy.deepcopy(p)
            objs = t["objs"]
            if q["qtype"] == "order":
                i, j = rng.sample(range(len(objs)), 2)
                a, b = objs[i], objs[j]
                a["x"], b["x"], a["y"], b["y"] = b["x"], a["x"], b["y"], a["y"]
            else:
                ri = [k for k, o in enumerate(objs) if [o["color"], o["shape"]] == list(q["ref"])][0]
                k = rng.choice([k for k in range(len(objs)) if k != ri])
                ref = objs[ri]
                if q["qtype"] == "nearest":
                    d0 = min(math.hypot(o["x"] - ref["x"], o["y"] - ref["y"]) for kk, o in enumerate(objs) if kk != ri)
                    xy = self._free(rng, objs, objs[k]["r"], skip=k,
                                    near=(ref["x"], ref["y"], d0 / (p["ratio"] * rng.uniform(1.05, 1.3))))
                else:
                    xy = self._free(rng, objs, objs[k]["r"], skip=k)
                if xy is None:
                    continue
                objs[k]["x"], objs[k]["y"] = xy
            if not self.evidence(t) and self.answer(t).value != old and self._no_overlap(t):
                return t
        return None

    @staticmethod
    def _no_overlap(p):
        o = p["objs"]
        return all(math.hypot(a["x"] - b["x"], a["y"] - b["y"]) > a["r"] + b["r"] + 6
                   for i, a in enumerate(o) for b in o[i + 1:])

    def verify(self, img, public, q):
        items = []
        for name, rgb in public["palette"].items():
            for c in components(color_mask(img, rgb, 45), min_px=40):
                cy, cx = c.mean(0)
                items.append((name, classify_shape(c), float(cx), float(cy)))
        return self._solve(items, q)
