"""Counting parts by colour+shape conjunction among distractors (inventory / QC counting)."""
from __future__ import annotations

import copy
import math
import random

import numpy as np

from ..core import PALETTE, SHAPES, Answer, Canvas, Family, classify_shape, color_mask, components, draw_shape, register

W = H = 560
M = 24  # margin
COLORS = ["red", "blue", "green", "orange", "purple", "pink", "teal"]
PLURAL = {"circle": "circles", "square": "squares", "triangle": "triangles", "star": "stars"}


def _overlap(a, b, pad):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"]) < a["r"] + b["r"] + pad


@register
class Count(Family):
    name = "count"
    title = "Conjunction counting"
    application = "Counting parts on trays, items on shelves, defects on boards (inventory & QC)."
    skill = "Exact enumeration under clutter; binding colour+shape (conjunction search)"
    qtypes = ["count"]
    knob_doc = {"targets": "number of target objects", "distractors": "number of distractors",
                "conjunction": "distractors share colour OR shape with target", "size": "object radius range",
                "overlap": "background distractors may overlap", "grid": "background clutter grid"}

    LEVELS = [
        dict(t=(2, 4), d=(0, 3), conj=False, r=(24, 28), overlap=False, grid=False),
        dict(t=(3, 6), d=(4, 8), conj=True, r=(20, 25), overlap=False, grid=False),
        dict(t=(5, 9), d=(8, 14), conj=True, r=(16, 23), overlap=False, grid=False),
        dict(t=(7, 12), d=(12, 20), conj=True, r=(13, 21), overlap=True, grid=False),
        dict(t=(10, 16), d=(18, 28), conj=True, r=(11, 19), overlap=True, grid=True),
    ]

    def _place(self, rng, objs, r, avoid_same_color=None, pad=4, overlap_ok=False, tries=400):
        for _ in range(tries):
            o = dict(x=rng.uniform(M + r, W - M - r), y=rng.uniform(M + r, H - M - r), r=r, rot=rng.uniform(0, 2 * math.pi))
            clash = False
            for b in objs:
                same_layer = (avoid_same_color is not None and (b["color"] == avoid_same_color or b.get("top")))
                if (not overlap_ok or same_layer) and _overlap(o, b, pad if not overlap_ok else 6):
                    clash = True
                    break
            if not clash:
                return o
        return None

    def sample(self, rng: random.Random, level: int, qtype=None):
        L = self.LEVELS[level]
        tc, ts = rng.choice(COLORS), rng.choice(SHAPES)
        nt, nd = rng.randint(*L["t"]), rng.randint(*L["d"])
        objs = []
        # top layer: every object with the target colour (targets + same-colour decoys), never overlapping
        decoy_same_color = 0
        dist = []
        for _ in range(nd):
            if L["conj"]:
                if rng.random() < 0.5:
                    c, s = tc, rng.choice([x for x in SHAPES if x != ts])
                else:
                    c, s = rng.choice([x for x in COLORS if x != tc]), ts if rng.random() < 0.7 else rng.choice(SHAPES)
            else:
                c, s = rng.choice([x for x in COLORS if x != tc]), rng.choice([x for x in SHAPES if x != ts])
            dist.append((c, s))
        for c, s in [(tc, ts)] * nt + [d for d in dist if d[0] == tc]:
            o = self._place(rng, objs, rng.uniform(*L["r"]), avoid_same_color=tc, pad=5)
            if o is None:
                return self.sample(rng, level, qtype)
            o.update(color=c, shape=s, top=True)
            objs.append(o)
            decoy_same_color += c == tc and s != ts
        bottom = []
        for c, s in [d for d in dist if d[0] != tc]:
            o = self._place(rng, objs + bottom, rng.uniform(*L["r"]), avoid_same_color=tc, pad=5,
                            overlap_ok=L["overlap"])
            if o is None:
                continue
            o.update(color=c, shape=s, top=False)
            bottom.append(o)
        return dict(level=level, objs=bottom + objs, grid=L["grid"], q={"color": tc, "shape": ts},
                    max_t=L["t"][1] + 1)

    def render(self, p):
        cv = Canvas(W, H, bg=(252, 252, 250))
        if p["grid"]:
            for k in range(0, W, 28):
                cv.line([(k, 0), (k, H)], (226, 226, 222), width=1)
                cv.line([(0, k), (W, k)], (226, 226, 222), width=1)
        for o in p["objs"]:  # bottom layer first, then the target-colour layer
            draw_shape(cv, o["shape"], o["x"], o["y"], o["r"], o["rot"], PALETTE[o["color"]])
        return cv.finish()

    def _n(self, p):
        q = p["q"]
        return sum(o["color"] == q["color"] and o["shape"] == q["shape"] for o in p["objs"])

    def question(self, p):
        q = p["q"]
        return f"How many {q['color']} {PLURAL[q['shape']]} are in the image?", "a whole number"

    def answer(self, p):
        return Answer("int", self._n(p), space=p["max_t"])

    def knobs(self, p):
        q = p["q"]
        rs = [o["r"] for o in p["objs"]]
        return dict(targets=self._n(p), distractors=len(p["objs"]) - self._n(p),
                    same_color_decoys=sum(o["color"] == q["color"] and o["shape"] != q["shape"] for o in p["objs"]),
                    same_shape_decoys=sum(o["color"] != q["color"] and o["shape"] == q["shape"] for o in p["objs"]),
                    min_radius=round(min(rs), 1), overlap=self.LEVELS[p["level"]]["overlap"], grid=p["grid"])

    def public(self, p):
        return dict(palette={k: PALETTE[k] for k in COLORS})  # colour names are standard, shapes are geometric

    def evidence(self, p):
        issues = []
        q = p["q"]
        top = [o for o in p["objs"] if o["color"] == q["color"]]
        for i in range(len(top)):
            for j in range(i + 1, len(top)):
                if _overlap(top[i], top[j], 3):
                    issues.append("target-coloured objects touch")
        if self._n(p) < 1:
            issues.append("no targets")
        if min(o["r"] for o in top) < 10:
            issues.append("target too small")
        return issues

    def twin(self, p, rng):
        t = copy.deepcopy(p)
        q = t["q"]
        tgt = [i for i, o in enumerate(t["objs"]) if o["color"] == q["color"] and o["shape"] == q["shape"]]
        if len(tgt) >= 3 and rng.random() < 0.5:
            for i in sorted(rng.sample(tgt, rng.randint(1, 2)), reverse=True):
                t["objs"].pop(i)
        else:
            L = self.LEVELS[t["level"]]
            for _ in range(rng.randint(1, 2)):
                o = self._place(rng, t["objs"], rng.uniform(*L["r"]), avoid_same_color=q["color"], pad=5)
                if o is None:
                    return None
                o.update(color=q["color"], shape=q["shape"], top=True)
                t["objs"].append(o)
        return t

    def verify(self, img, public, q):
        m = color_mask(img, public["palette"][q["color"]], 48)
        comps = components(m, min_px=25)
        return sum(classify_shape(c) == q["shape"] for c in comps)
