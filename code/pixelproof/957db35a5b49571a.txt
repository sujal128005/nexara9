"""Analog instrument reading (pressure / temperature / flow gauges)."""
from __future__ import annotations

import math
import random

import numpy as np

from ..core import Answer, Canvas, Family, register

W = H = 512
CX, CY, R = 256, 270, 200
START, SWEEP = 225.0, 270.0  # degrees; value 0 at 225deg, max at -45deg (clockwise)
TICK = (90, 90, 100)
NEEDLE = (0, 0, 0)
SETPOINT = (210, 40, 40)
HUB_R = 11

UNITS = [("pressure", "bar"), ("pressure", "psi"), ("temperature", "°C"), ("flow", "m3/h"), ("pressure", "kPa")]


def _angle(f: float) -> float:
    return math.radians(START - SWEEP * f)


def _pt(theta: float, r: float):
    return CX + r * math.cos(theta), CY - r * math.sin(theta)


@register
class Gauge(Family):
    name = "gauge"
    title = "Analog gauge reading"
    application = "Reading plant instruments from site photos / CCTV (pressure, temperature, flow)."
    skill = "Fine angular estimation + interpolation between tick marks + scale arithmetic"
    qtypes = ["read"]
    knob_doc = {
        "n_major": "number of labelled major intervals",
        "minor": "minor ticks per major interval (1 = none)",
        "half_steps": "value may sit half-way between minor ticks",
        "setpoint": "red set-point needle as distractor",
        "sparse_labels": "label only every other major tick",
        "offset_zero": "scale starts below zero",
        "noise": "sensor noise sigma",
        "needle_w": "needle width (px)",
    }

    LEVELS = [
        dict(n_major=[5], minor=[1], half_steps=False, setpoint=False, sparse=False, offset=False, noise=0, needle_w=7),
        dict(n_major=[5], minor=[2, 5], half_steps=False, setpoint=False, sparse=False, offset=False, noise=0, needle_w=6),
        dict(n_major=[8, 10], minor=[5], half_steps=False, setpoint=False, sparse=False, offset=False, noise=0, needle_w=5),
        dict(n_major=[8, 10], minor=[4, 5], half_steps=False, setpoint=True, sparse=True, offset=True, noise=4, needle_w=4.5),
        dict(n_major=[8, 12], minor=[4, 5], half_steps=True, setpoint=True, sparse=True, offset=True, noise=7, needle_w=3.5),
    ]

    def sample(self, rng: random.Random, level: int, qtype=None) -> dict:
        L = self.LEVELS[level]
        n_major = rng.choice(L["n_major"])
        minor = rng.choice(L["minor"])
        major_step = rng.choice([1, 2, 5, 10, 20, 25, 50])
        if minor == 4 and major_step in (1, 5, 25):
            major_step = rng.choice([2, 10, 20])
        vmin = 0
        if L["offset"] and rng.random() < 0.6:
            vmin = -major_step * rng.randint(1, max(1, n_major // 3))
        quantity, unit = rng.choice(UNITS)
        steps = n_major * minor * (2 if L["half_steps"] else 1)
        lo, hi = int(0.04 * steps) + 1, int(0.96 * steps) - 1
        idx = rng.randint(lo, hi)
        if level == 0:
            idx = rng.randint(1, n_major - 1)
        p = dict(level=level, n_major=n_major, minor=minor, major_step=major_step, vmin=vmin,
                 steps=steps if level else n_major, idx=idx, quantity=quantity, unit=unit,
                 setpoint=L["setpoint"], sparse=L["sparse"], noise=L["noise"], needle_w=L["needle_w"],
                 noise_seed=rng.randint(0, 2**31 - 1), q={"unit": unit, "quantity": quantity, "setpoint": L["setpoint"]})
        if p["setpoint"]:
            p["sp_f"] = self._far_setpoint(rng, self._frac(p))
        return p

    @staticmethod
    def _far_setpoint(rng, f):
        while True:
            s = rng.uniform(0.05, 0.95)
            if abs(s - f) * SWEEP >= 14:
                return s

    @staticmethod
    def _span(p):
        return p["n_major"] * p["major_step"]

    def _frac(self, p):
        return p["idx"] / p["steps"]

    def _value(self, p):
        return p["vmin"] + self._frac(p) * self._span(p)

    def _res(self, p):
        return self._span(p) / p["steps"]

    def render(self, p):
        cv = Canvas(W, H)
        cv.circle(CX, CY, R + 14, fill=(236, 238, 242), outline=TICK, width=3)
        cv.circle(CX, CY, R + 4, fill=(255, 255, 255))
        n_major, minor = p["n_major"], p["minor"]
        for i in range(n_major * minor + 1):
            f = i / (n_major * minor)
            th = _angle(f)
            major = i % minor == 0
            r0 = R - (24 if major else 12)
            cv.line([_pt(th, r0), _pt(th, R - 2)], TICK, width=3 if major else 1.6)
            if major:
                k = i // minor
                if p["sparse"] and k % 2 == 1:
                    continue
                v = p["vmin"] + k * p["major_step"]
                x, y = _pt(th, R - 46)
                cv.text(x, y, f"{v:g}", size=19, fill=TICK)
        cv.text(CX, CY + 70, p["unit"], size=24, fill=TICK)
        cv.text(CX, CY + 100, p["quantity"].upper(), size=13, fill=(140, 140, 150))
        if p["setpoint"]:
            th = _angle(p["sp_f"])
            cv.line([_pt(th, R * 0.55), _pt(th, R - 4)], SETPOINT, width=4)
            cv.polygon([_pt(th, R - 2), _pt(th + 0.04, R - 18), _pt(th - 0.04, R - 18)], fill=SETPOINT)
        th = _angle(self._frac(p))
        cv.line([(CX, CY), _pt(th, R * 0.84)], NEEDLE, width=p["needle_w"])
        cv.circle(CX, CY, HUB_R, fill=NEEDLE)
        img = cv.finish()
        if p["noise"]:
            nrng = np.random.default_rng(p["noise_seed"])
            a = np.asarray(img).astype(np.float32) + nrng.normal(0, p["noise"], (H, W, 1))
            from PIL import Image
            img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        return img

    def question(self, p):
        extra = " Ignore the red set-point marker." if p["q"]["setpoint"] else ""
        return (f"What value does the black pointer on this {p['q']['quantity']} gauge indicate, "
                f"in {p['q']['unit']}?{extra}", "a single number (decimals allowed), without units")

    def answer(self, p):
        res = self._res(p)
        return Answer("float", round(self._value(p), 6), tol=round(0.45 * res, 6), space=None)

    def chance(self, p):
        a = self.answer(p)
        return min(1.0, 2 * a.tol / self._span(p))

    def knobs(self, p):
        return dict(n_major=p["n_major"], minor=p["minor"], half_steps=p["steps"] > p["n_major"] * p["minor"],
                    setpoint=p["setpoint"], sparse_labels=p["sparse"], offset_zero=p["vmin"] < 0,
                    noise=p["noise"], needle_w=p["needle_w"])

    def public(self, p):
        # Everything here is printed on the dial face (scale end labels, geometry of the dial).
        return dict(center=[CX, CY], vmin=p["vmin"], vmax=p["vmin"] + self._span(p), start=START, sweep=SWEEP,
                    hub_r=HUB_R)

    def evidence(self, p):
        issues = []
        f = self._frac(p)
        if not 0.02 <= f <= 0.98:
            issues.append("pointer too close to scale end")
        if p["setpoint"] and abs(p["sp_f"] - f) * SWEEP < 12:
            issues.append("set-point marker overlaps pointer")
        arc_px = math.radians(SWEEP) * (R - 12) / (p["n_major"] * p["minor"])
        if arc_px < 9:
            issues.append(f"minor ticks only {arc_px:.1f}px apart")
        return issues

    def twin(self, p, rng):
        q = dict(p)
        res_needed = 3  # move by at least 3 resolution steps (>> tolerance)
        lo, hi = int(0.04 * p["steps"]) + 1, int(0.96 * p["steps"]) - 1
        if p["level"] == 0:
            lo, hi, res_needed = 1, p["n_major"] - 1, 1
        cands = [i for i in range(lo, hi + 1) if abs(i - p["idx"]) >= res_needed]
        if not cands:
            return None
        q["idx"] = rng.choice(cands)
        q["noise_seed"] = rng.randint(0, 2**31 - 1)
        if q["setpoint"] and abs(q["sp_f"] - self._frac(q)) * SWEEP < 14:
            q["sp_f"] = self._far_setpoint(rng, self._frac(q))
        return q

    # ------------------------------------------------------------------ verifier
    def verify(self, img, public, q):
        from ..core import color_mask
        cx, cy = public["center"]
        m = color_mask(img, NEEDLE, 60)
        ys, xs = np.nonzero(m)
        dx, dy = xs - cx, cy - ys
        r = np.hypot(dx, dy)
        keep = r > public["hub_r"] + 6
        dx, dy, r = dx[keep], dy[keep], r[keep]
        if len(r) < 20:
            return None
        # use the outer half of the needle pixels (robust to hub blobs)
        sel = r > np.percentile(r, 40)
        theta = math.degrees(math.atan2(dy[sel].sum(), dx[sel].sum()))
        deg = (public["start"] - theta) % 360
        if deg > public["sweep"] + 20:
            deg -= 360
        f = deg / public["sweep"]
        return public["vmin"] + f * (public["vmax"] - public["vmin"])
