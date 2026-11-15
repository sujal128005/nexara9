"""Business-report bar charts: read, rank and compare values without data labels."""
from __future__ import annotations

import random

import numpy as np

from ..core import Answer, Canvas, Family, color_mask, register

W, H = 680, 480
X0, X1, YT, YB = 84, 650, 56, 392
SERIES_COL = [(37, 99, 235), (234, 128, 12)]
SERIES_NAMES = [["2024", "2025"], ["Plan", "Actual"], ["Plant A", "Plant B"]]
CATSETS = [
    ["North", "South", "East", "West", "Central", "Coast", "Hills", "Metro"],
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    ["Pumps", "Valves", "Motors", "Seals", "Filters", "Gears", "Belts", "Fans"],
    ["Q1", "Q2", "Q3", "Q4"],
]
METRICS = [("Revenue", "INR lakh"), ("Units shipped", "units"), ("Downtime", "hours"), ("Defect count", "count"),
           ("Energy use", "MWh")]
ORD = {1: "highest", 2: "second-highest", 3: "third-highest"}


@register
class BarChart(Family):
    name = "chart"
    title = "Report chart reading"
    application = "Extracting numbers from charts in PDFs, dashboards and scanned reports."
    skill = "Reading values against axis gridlines, ranking near-equal bars, arithmetic over read values"
    qtypes = ["read", "rank", "diff"]
    knob_doc = {"n_cats": "number of categories", "series": "1 = simple, 2 = grouped bars with legend",
                "sub": "value resolution relative to gridline step (1, 1/2, 1/4)",
                "label_every": "label every k-th gridline", "min_gap_px": "smallest gap between ranked bars"}

    LEVELS = [
        dict(n=[3, 4], series=1, sub=[1], label_every=1, gap_steps=2.0),
        dict(n=[5, 6], series=1, sub=[1, 2], label_every=1, gap_steps=1.0),
        dict(n=[7, 8], series=1, sub=[2], label_every=2, gap_steps=1.0),
        dict(n=[4, 5], series=2, sub=[2], label_every=2, gap_steps=1.0),
        dict(n=[6, 8], series=2, sub=[4], label_every=2, gap_steps=0.5),
    ]

    def sample(self, rng: random.Random, level: int, qtype=None):
        L = self.LEVELS[level]
        n = rng.choice(L["n"])
        cats = rng.choice([c for c in CATSETS if len(c) >= n])
        start = rng.randint(0, len(cats) - n)
        cats = cats[start:start + n]
        step = rng.choice([5, 10, 20, 25, 50, 100])
        n_grid = rng.randint(5, 8)
        sub = rng.choice(L["sub"])
        res = step / sub
        n_res = n_grid * sub
        series = L["series"]
        snames = rng.choice(SERIES_NAMES)[:series] if series > 1 else ["value"]
        vals = [[rng.randint(1, n_res - 1) for _ in range(n)] for _ in range(series)]
        qtype = qtype or rng.choice(self.qtypes)
        s = rng.randrange(series)
        metric, unit = rng.choice(METRICS)
        q = {"qtype": qtype, "series": s, "metric": metric, "unit": unit}
        if qtype == "read":
            q["cat"] = rng.randrange(n)
        elif qtype == "rank":
            q["k"] = rng.choice([1, 2] if n <= 4 else [1, 2, 3])
        else:
            a, b = rng.sample(range(n), 2)
            q["a"], q["b"] = a, b
        p = dict(level=level, cats=cats, step=step, n_grid=n_grid, sub=sub, res=res, n_res=n_res, series=series,
                 snames=snames, vals=vals, label_every=L["label_every"], gap_steps=L["gap_steps"], q=q)
        if qtype == "diff":
            self._fix_diff(p, rng)
        return p

    @staticmethod
    def _fix_diff(p, rng):
        q, v = p["q"], p["vals"][p["q"]["series"]]
        if v[q["a"]] <= v[q["b"]]:
            q["a"], q["b"] = q["b"], q["a"]
        if v[q["a"]] == v[q["b"]]:
            v[q["a"]] = min(p["n_res"] - 1, v[q["a"]] + 2) if v[q["a"]] < p["n_res"] - 2 else v[q["a"]]
            v[q["b"]] = max(1, v[q["b"]] - 2)

    # ---------------------------------------------------------------- geometry
    def _geom(self, p):
        n, s = len(p["cats"]), p["series"]
        slot = (X1 - X0) / n
        bw = slot * (0.56 if s == 1 else 0.36)
        bars = []
        for i in range(n):
            cx = X0 + slot * (i + 0.5)
            row = []
            for j in range(s):
                off = 0 if s == 1 else (-0.5 if j == 0 else 0.5) * bw
                row.append((cx + off - bw / 2, cx + off + bw / 2))
            bars.append(row)
        ppu = (YB - YT) / (p["n_grid"] * p["step"])
        return bars, ppu, slot

    def _value(self, p, j, i):
        return p["vals"][j][i] * p["res"]

    def render(self, p):
        cv = Canvas(W, H)
        bars, ppu, slot = self._geom(p)
        q = p["q"]
        cv.text(W / 2, 24, f"{q['metric']} by category ({q['unit']})", size=18, fill=(30, 30, 40))
        for g in range(p["n_grid"] + 1):
            y = YB - g * p["step"] * ppu
            cv.line([(X0, y), (X1, y)], (222, 224, 230) if g else (90, 90, 100), width=1.2 if g else 2)
            if g % p["label_every"] == 0:
                cv.text(X0 - 10, y, f"{g * p['step']:g}", size=14, fill=(70, 70, 80), anchor="rm")
            else:
                cv.line([(X0 - 5, y), (X0, y)], (90, 90, 100), width=1.2)
        cv.line([(X0, YT - 6), (X0, YB)], (90, 90, 100), width=2)
        for i, row in enumerate(bars):
            for j, (a, b) in enumerate(row):
                v = self._value(p, j, i)
                cv.rect(a, YB - v * ppu, b, YB - 1, fill=SERIES_COL[j])
            cv.text(X0 + slot * (i + 0.5), YB + 18, p["cats"][i], size=14, fill=(50, 50, 60))
        if p["series"] > 1:
            lx = X1 - 190
            for j, nm in enumerate(p["snames"]):
                cv.rect(lx + j * 95, H - 34, lx + j * 95 + 16, H - 18, fill=SERIES_COL[j])
                cv.text(lx + j * 95 + 22, H - 26, nm, size=14, fill=(50, 50, 60), anchor="lm")
        return cv.finish()

    def _ser(self, p):
        return f" for {p['snames'][p['q']['series']]}" if p["series"] > 1 else ""

    def question(self, p):
        q = p["q"]
        if q["qtype"] == "read":
            return (f"In this bar chart, what is the {q['metric'].lower()} of {p['cats'][q['cat']]}{self._ser(p)}?",
                    "a single number read from the chart (decimals allowed), without units")
        if q["qtype"] == "rank":
            return (f"Which category has the {ORD[q['k']]} {q['metric'].lower()}{self._ser(p)}?",
                    "the category name exactly as written on the x-axis")
        return (f"By how much does the {q['metric'].lower()} of {p['cats'][q['a']]} exceed that of "
                f"{p['cats'][q['b']]}{self._ser(p)}?", "a single number (decimals allowed), without units")

    def _solve(self, vals: list[float], q: dict, cats):
        if q["qtype"] == "read":
            return vals[q["cat"]]
        if q["qtype"] == "rank":
            order = sorted(range(len(vals)), key=lambda i: -vals[i])
            return cats[order[q["k"] - 1]]
        return vals[q["a"]] - vals[q["b"]]

    def answer(self, p):
        q = p["q"]
        vals = [self._value(p, q["series"], i) for i in range(len(p["cats"]))]
        sol = self._solve(vals, q, p["cats"])
        if q["qtype"] == "rank":
            return Answer("label", sol, space=len(p["cats"]))
        return Answer("float", round(sol, 6), tol=round(0.45 * p["res"], 6))

    def chance(self, p):
        a = self.answer(p)
        if a.kind == "label":
            return 1 / a.space
        return min(1.0, 2 * a.tol / (p["n_grid"] * p["step"]))

    def knobs(self, p):
        _, ppu, _ = self._geom(p)
        return dict(n_cats=len(p["cats"]), series=p["series"], sub=p["sub"], label_every=p["label_every"],
                    min_gap_px=round(self._min_gap(p) * ppu, 1))

    def _min_gap(self, p):
        q = p["q"]
        v = sorted(self._value(p, q["series"], i) for i in range(len(p["cats"])))
        if q["qtype"] == "rank":
            k = q["k"]
            desc = v[::-1]
            gaps = [desc[k - 2] - desc[k - 1]] if k >= 2 else []
            if k < len(desc):
                gaps.append(desc[k - 1] - desc[k])
            return min(gaps)
        return p["res"]

    def public(self, p):
        bars, ppu, _ = self._geom(p)
        # Bar positions, category names, legend colours and the y-axis scale are all legible in the chart.
        return dict(baseline_y=YB, ppu=ppu, bars=bars, cats=p["cats"], colors=SERIES_COL[: p["series"]])

    def evidence(self, p):
        issues = []
        _, ppu, _ = self._geom(p)
        q = p["q"]
        if q["qtype"] == "rank":
            g = self._min_gap(p)
            if g <= 0:
                issues.append("tie in ranking")
            elif g < p["gap_steps"] * p["step"] or g * ppu < 6:
                issues.append("ranked bars too close to separate")
        if q["qtype"] == "diff":
            v = p["vals"][q["series"]]
            if v[q["a"]] <= v[q["b"]]:
                issues.append("diff not positive")
        if p["res"] * ppu < 3:
            issues.append("value resolution below 3px")
        return issues

    def twin(self, p, rng):
        import copy
        t = copy.deepcopy(p)
        q, v = t["q"], t["vals"][t["q"]["series"]]
        if q["qtype"] == "read":
            c = [x for x in range(1, t["n_res"]) if abs(x - v[q["cat"]]) >= 2] or \
                [x for x in range(1, t["n_res"]) if x != v[q["cat"]]]
            v[q["cat"]] = rng.choice(c)
        elif q["qtype"] == "rank":
            order = sorted(range(len(v)), key=lambda i: -v[i])
            target = order[q["k"] - 1]
            other = rng.choice([i for i in range(len(v)) if i != target])
            v[target], v[other] = v[other], v[target]
        else:
            d0 = v[q["a"]] - v[q["b"]]
            opts = [(a, b) for a in range(2, t["n_res"]) for b in range(1, a) if abs((a - b) - d0) >= 1]
            v[q["a"]], v[q["b"]] = rng.choice(opts)
        return t

    def verify(self, img, public, q):
        base, ppu = public["baseline_y"], public["ppu"]
        col = public["colors"][q["series"]]
        m = color_mask(img, col, 45)
        vals = []
        for row in public["bars"]:
            a, b = row[q["series"]]
            xs = range(int(a + 3), int(b - 2))
            hs = []
            for x in xs:
                colm = m[: int(base) + 1, x]
                ys = np.nonzero(colm)[0]
                hs.append(base - ys.min() if len(ys) else 0)
            vals.append(float(np.median(hs)) / ppu)
        return self._solve(vals, q, public["cats"])
