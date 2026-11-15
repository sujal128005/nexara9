"""Wire / pipe tracing on wiring diagrams and patch panels."""
from __future__ import annotations

import copy
import math
import random

import numpy as np

from ..core import Answer, Canvas, Family, color_mask, register

W, H = 640, 480
XL, XR = 64, 576
TOP, BOT = 52, 440
WIRE_COLS = [(220, 38, 38), (37, 99, 235), (22, 163, 74), (234, 128, 12), (147, 51, 234),
             (13, 148, 136), (219, 39, 119), (133, 77, 14), (100, 100, 110), (202, 138, 4)]
MONO = (70, 74, 90)
TERM = (40, 40, 48)


def hermite(points, n_per=120):
    """Cubic Hermite through points with horizontal end tangents, Catmull-Rom inside."""
    P = [np.array(p, dtype=float) for p in points]
    T = []
    for i in range(len(P)):
        if i == 0 or i == len(P) - 1:
            T.append(np.array([1.0, 0.0]) * (P[-1][0] - P[0][0]) / max(1, len(P) - 1) * 0.9)
        else:
            T.append((P[i + 1] - P[i - 1]) * 0.5)
    out = []
    for i in range(len(P) - 1):
        for s in np.linspace(0, 1, n_per, endpoint=(i == len(P) - 2)):
            h00, h10 = 2 * s**3 - 3 * s**2 + 1, s**3 - 2 * s**2 + s
            h01, h11 = -2 * s**3 + 3 * s**2, s**3 - s**2
            out.append(h00 * P[i] + h10 * T[i] + h01 * P[i + 1] + h11 * T[i + 1])
    return np.array(out)


@register
class Wires(Family):
    name = "wires"
    title = "Wire tracing"
    application = "Verifying wiring / piping diagrams, patch panels and control-cabinet photos."
    skill = "Continuous contour following through crossings (a known weak spot of patch-based vision)"
    qtypes = ["trace"]
    knob_doc = {"n_wires": "number of wires", "waypoints": "bends per wire", "coloring": "distinct / paired / mono",
                "width": "wire thickness (px)"}

    LEVELS = [
        dict(n=3, way=0, coloring="distinct", width=5),
        dict(n=4, way=1, coloring="distinct", width=4.5),
        dict(n=6, way=1, coloring="paired", width=4),
        dict(n=7, way=1, coloring="mono", width=3.5),
        dict(n=9, way=2, coloring="mono", width=3.2),
    ]

    def sample(self, rng: random.Random, level: int, qtype=None):
        L = self.LEVELS[level]
        n = L["n"]
        perm = list(range(n))
        while n > 1 and perm == list(range(n)):
            rng.shuffle(perm)
        ways = [[(XL + (XR - XL) * (k + 1) / (L["way"] + 1) + rng.uniform(-30, 30), rng.uniform(TOP, BOT))
                 for k in range(L["way"])] for _ in range(n)]
        if L["coloring"] == "distinct":
            cols = rng.sample(range(len(WIRE_COLS)), n)
        elif L["coloring"] == "paired":
            base = rng.sample(range(len(WIRE_COLS)), (n + 1) // 2)
            cols = [base[i // 2] for i in range(n)]
            rng.shuffle(cols)
        else:
            cols = [-1] * n
        return dict(level=level, n=n, perm=perm, ways=ways, cols=cols, width=L["width"], coloring=L["coloring"],
                    q={"start": rng.randrange(n)})

    @staticmethod
    def _ys(n):
        return [TOP + (BOT - TOP) * (i + 0.5) / n for i in range(n)]

    def _curves(self, p):
        ys = self._ys(p["n"])
        return [hermite([(XL + 14, ys[i])] + [tuple(w) for w in p["ways"][i]] + [(XR - 14, ys[p["perm"][i]])])
                for i in range(p["n"])]

    def _col(self, p, i):
        return MONO if p["cols"][i] < 0 else WIRE_COLS[p["cols"][i]]

    def render(self, p):
        cv = Canvas(W, H, bg=(250, 250, 247))
        ys = self._ys(p["n"])
        cv.rect(XL - 34, TOP - 20, XL - 4, BOT + 20, fill=(226, 228, 233), outline=(160, 160, 170))
        cv.rect(XR + 4, TOP - 20, XR + 34, BOT + 20, fill=(226, 228, 233), outline=(160, 160, 170))
        for i, c in enumerate(self._curves(p)):
            cv.polyline_round([tuple(pt) for pt in c], self._col(p, i), width=p["width"])
        for i, y in enumerate(ys):
            cv.circle(XL + 6, y, 7, fill=TERM)
            cv.circle(XR - 6, y, 7, fill=TERM)
            cv.text(XL - 19, y, chr(65 + i), size=16, fill=(30, 30, 40))
            cv.text(XR + 19, y, str(i + 1), size=16, fill=(30, 30, 40))
        return cv.finish()

    def question(self, p):
        return (f"Follow the wire that starts at terminal {chr(65 + p['q']['start'])} on the left. "
                f"Which numbered terminal on the right does it end at?", "the terminal number only")

    def answer(self, p):
        return Answer("int", p["perm"][p["q"]["start"]] + 1, space=p["n"])

    def knobs(self, p):
        return dict(n_wires=p["n"], waypoints=len(p["ways"][0]), coloring=p["coloring"], width=p["width"],
                    crossings=self._crossings(p))

    def _crossings(self, p):
        c = self._curves(p)
        s = p["q"]["start"]
        n = 0
        for j in range(p["n"]):
            if j == s:
                continue
            d = c[s][::3, None, :] - c[j][None, ::3, :]
            n += int((np.hypot(d[..., 0], d[..., 1]) < p["width"] * 1.2).any())
        return n

    def public(self, p):
        # Terminal positions and labels are printed on the terminal strips.
        return dict(left=[[XL + 14, y] for y in self._ys(p["n"])], right=[[XR - 14, y] for y in self._ys(p["n"])])

    def evidence(self, p):
        issues = []
        curves = self._curves(p)
        w = p["width"]
        for i, c in enumerate(curves):
            if (np.diff(c[:, 0]) <= 0).any():
                issues.append(f"wire {i} doubles back")
            if c[:, 1].min() < TOP - 30 or c[:, 1].max() > BOT + 30:
                issues.append(f"wire {i} leaves the board")
        # Only the queried wire must be unambiguous: every contact with another wire has to be a
        # clear crossing (> 32 deg), never a stretch where the two run together.
        i = p["q"]["start"]
        ti = np.gradient(curves[i], axis=0)
        for j in range(len(curves)):
            if j == i:
                continue
            tj = np.gradient(curves[j], axis=0)
            d = curves[i][::2, None, :] - curves[j][None, ::2, :]
            close = np.argwhere(np.hypot(d[..., 0], d[..., 1]) < w * 2.6)
            for a, b in close:
                u, v = ti[a * 2], tj[b * 2]
                cosang = abs(u @ v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-9)
                if cosang > math.cos(math.radians(32)):
                    issues.append(f"queried wire runs together with wire {j} (ambiguous crossing)")
                    break
        return issues

    def twin(self, p, rng):
        t = copy.deepcopy(p)
        s = t["q"]["start"]
        other = rng.choice([i for i in range(t["n"]) if i != s])
        t["perm"][s], t["perm"][other] = t["perm"][other], t["perm"][s]
        return t

    # ------------------------------------------------------------------ verifier
    def verify(self, img, public, q):
        return self.trace(img, public, q)[0]

    def trace(self, img, public, q):
        """Pixel-level contour follower: tracks the wire from the start terminal, preferring the
        straightest continuation at crossings (good continuation), until it reaches the right strip.
        Uses only the image and the printed terminal positions."""
        sx, sy = public["left"][q["start"]]
        col = img[int(round(sy)), int(sx) + 3, :3].astype(int)
        m = color_mask(img, col, 70)
        h, w = m.shape

        def on(x, y):
            xi, yi = int(round(x)), int(round(y))
            return 0 <= xi < w and 0 <= yi < h and bool(m[yi, xi])

        mp = np.pad(m, 20)  # padded mask so vectorised look-ups never go out of bounds

        def score(x, y, ang, L):
            k = np.arange(1, L + 1)
            xs = np.rint(x + k * math.cos(ang)).astype(int) + 20
            ys = np.rint(y + k * math.sin(ang)).astype(int) + 20
            return float(mp[np.clip(ys, 0, h + 39), np.clip(xs, 0, w + 39)].mean())

        DD = np.radians(np.arange(-30, 31, 2))
        K = np.arange(1, 17)

        def best_dir(x, y, ang):
            a = ang + DD
            ok = np.cos(a) > 0.05
            xs = np.rint(x + K[None, :] * np.cos(a)[:, None]).astype(int) + 20
            ys = np.rint(y + K[None, :] * np.sin(a)[:, None]).astype(int) + 20
            sc = mp[np.clip(ys, 0, h + 39), np.clip(xs, 0, w + 39)].mean(1) - 0.45 * np.abs(DD)
            sc[~ok] = -9
            i = int(np.argmax(sc))
            return float(sc[i]), float(a[i])

        x, y, ang = sx + 3, sy, 0.0
        xr = public["right"][0][0]
        path = [(x, y)]
        for _ in range(3000):
            if x >= xr - 16:
                break
            best, best_a = best_dir(x, y, ang)
            if best < 0.45:  # gap (another wire drawn on top): jump ahead along the heading
                jumped = False
                for jump in (5, 8, 11, 14):
                    for dd in np.radians(np.arange(-24, 25, 3)):
                        a = ang + dd
                        jx, jy = x + jump * math.cos(a), y + jump * math.sin(a)
                        if score(jx, jy, a, 8) > 0.7:
                            x, y, ang, jumped = jx, jy, a, True
                            break
                    if jumped:
                        break
                if not jumped:
                    return None, path
                path.append((x, y))
                continue
            nx, ny = x + 2.0 * math.cos(best_a), y + 2.0 * math.sin(best_a)
            px, py = -math.sin(best_a), math.cos(best_a)
            offs = [o for o in np.arange(-4, 4.5, 0.5) if on(nx + o * px, ny + o * py)]
            # re-centre on the stroke only where it is a single clean stroke (not at a crossing)
            if offs and (max(offs) - min(offs)) <= 6 and len(offs) * 0.5 >= (max(offs) - min(offs)):
                o = (max(offs) + min(offs)) / 2
                nx, ny = nx + 0.5 * o * px, ny + 0.5 * o * py
            ang = 0.7 * best_a + 0.3 * ang
            x, y = nx, ny
            path.append((x, y))
        ys = [r[1] for r in public["right"]]
        return int(np.argmin([abs(y - yy) for yy in ys])) + 1, path
