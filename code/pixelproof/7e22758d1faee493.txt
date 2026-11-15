"""Route reasoning on grid mazes (warehouse / floor-plan navigation)."""
from __future__ import annotations

import copy
import random
from collections import deque

import numpy as np

from ..core import Answer, Canvas, Family, color_mask, register

W = H = 560
M = 26
START_C = (22, 163, 74)
END_C = (220, 38, 38)
WALL = (30, 32, 40)


def bfs(n, hw, vw, s, e):
    dist = {s: 0}
    dq = deque([s])
    while dq:
        r, c = dq.popleft()
        if (r, c) == e:
            return dist[(r, c)]
        nb = []
        if r > 0 and not hw[r - 1][c]:
            nb.append((r - 1, c))
        if r < n - 1 and not hw[r][c]:
            nb.append((r + 1, c))
        if c > 0 and not vw[r][c - 1]:
            nb.append((r, c - 1))
        if c < n - 1 and not vw[r][c]:
            nb.append((r, c + 1))
        for x in nb:
            if x not in dist:
                dist[x] = dist[(r, c)] + 1
                dq.append(x)
    return None


@register
class Maze(Family):
    name = "maze"
    title = "Route planning"
    application = "Floor-plan / warehouse navigation: shortest route between two marked locations."
    skill = "Multi-step spatial planning with global constraints (walls), path length counting"
    qtypes = ["shortest"]
    knob_doc = {"grid": "maze size n x n", "loops": "fraction of extra openings (multiple routes)",
                "min_dist": "minimum shortest-path length"}

    LEVELS = [dict(n=4, loops=0.0, mind=3), dict(n=5, loops=0.0, mind=5), dict(n=7, loops=0.08, mind=7),
              dict(n=9, loops=0.10, mind=10), dict(n=12, loops=0.12, mind=14)]

    def sample(self, rng: random.Random, level: int, qtype=None):
        L = self.LEVELS[level]
        n = L["n"]
        hw = [[True] * n for _ in range(n - 1)]
        vw = [[True] * (n - 1) for _ in range(n)]
        seen = {(0, 0)}
        stack = [(0, 0)]
        while stack:
            r, c = stack[-1]
            nb = [(r + dr, c + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))
                  if 0 <= r + dr < n and 0 <= c + dc < n and (r + dr, c + dc) not in seen]
            if not nb:
                stack.pop()
                continue
            rr, cc = rng.choice(nb)
            if rr != r:
                hw[min(r, rr)][c] = False
            else:
                vw[r][min(c, cc)] = False
            seen.add((rr, cc))
            stack.append((rr, cc))
        walls = [("h", r, c) for r in range(n - 1) for c in range(n) if hw[r][c]] + \
                [("v", r, c) for r in range(n) for c in range(n - 1) if vw[r][c]]
        for kind, r, c in rng.sample(walls, int(len(walls) * L["loops"])):
            (hw if kind == "h" else vw)[r][c] = False
        cells = [(r, c) for r in range(n) for c in range(n)]
        for _ in range(200):
            s, e = rng.sample(cells, 2)
            if bfs(n, hw, vw, s, e) >= L["mind"]:
                break
        return dict(level=level, n=n, hw=hw, vw=vw, s=list(s), e=list(e), loops=L["loops"], mind=L["mind"], q={})

    def _cell(self, n):
        return (W - 2 * M) / n

    def render(self, p):
        n = p["n"]
        cs = self._cell(n)
        cv = Canvas(W, H, bg=(255, 255, 255))
        for r in range(n):
            for c in range(n):
                cv.circle(M + (c + 0.5) * cs, M + (r + 0.5) * cs, 1.2, fill=(215, 215, 220))
        for (r, c), col in ((p["s"], START_C), (p["e"], END_C)):
            cv.rect(M + c * cs + 4, M + r * cs + 4, M + (c + 1) * cs - 4, M + (r + 1) * cs - 4, fill=col)
        lw = 3.2
        for r in range(n - 1):
            for c in range(n):
                if p["hw"][r][c]:
                    y = M + (r + 1) * cs
                    cv.line([(M + c * cs, y), (M + (c + 1) * cs, y)], WALL, width=lw)
        for r in range(n):
            for c in range(n - 1):
                if p["vw"][r][c]:
                    x = M + (c + 1) * cs
                    cv.line([(x, M + r * cs), (x, M + (r + 1) * cs)], WALL, width=lw)
        cv.rect(M, M, W - M, H - M, outline=WALL, width=lw + 1)
        return cv.finish()

    def question(self, p):
        return ("Moving one cell at a time (up, down, left or right) and never crossing a wall, what is the minimum "
                "number of moves needed to get from the green cell to the red cell?", "a whole number")

    def _dist(self, p):
        return bfs(p["n"], p["hw"], p["vw"], tuple(p["s"]), tuple(p["e"]))

    def answer(self, p):
        return Answer("int", self._dist(p), space=p["n"] * p["n"])

    def knobs(self, p):
        return dict(grid=p["n"], loops=p["loops"], path_len=self._dist(p))

    def public(self, p):
        return dict(n=p["n"], origin=[M, M], cell=self._cell(p["n"]))  # grid geometry is visible

    def evidence(self, p):
        d = self._dist(p)
        issues = []
        if d is None:
            issues.append("unreachable")
        elif d < p["mind"]:
            issues.append("route too short")
        if self._cell(p["n"]) < 30:
            issues.append("cells too small")
        return issues

    def twin(self, p, rng):
        """Toggle exactly ONE wall segment so that the shortest route changes."""
        d0 = self._dist(p)
        n = p["n"]
        cands = [("h", r, c) for r in range(n - 1) for c in range(n)] + [("v", r, c) for r in range(n) for c in range(n - 1)]
        rng.shuffle(cands)
        for kind, r, c in cands:
            t = copy.deepcopy(p)
            arr = t["hw"] if kind == "h" else t["vw"]
            arr[r][c] = not arr[r][c]
            d = self._dist(t)
            if d is not None and d != d0 and d >= p["mind"] - 2 and abs(d - d0) >= 2:
                t["toggled"] = [kind, r, c]
                return t
        return None

    def verify(self, img, public, q):
        n, (ox, oy), cs = public["n"], public["origin"], public["cell"]
        dark = (img[..., :3].astype(int).sum(-1) < 3 * 110)

        def wall_at(x, y):
            xi, yi = int(round(x)), int(round(y))
            return dark[yi - 2:yi + 3, xi - 2:xi + 3].mean() > 0.2

        hw = [[wall_at(ox + (c + 0.5) * cs, oy + (r + 1) * cs) for c in range(n)] for r in range(n - 1)]
        vw = [[wall_at(ox + (c + 1) * cs, oy + (r + 0.5) * cs) for c in range(n - 1)] for r in range(n)]

        def cell_of(rgb):
            ys, xs = np.nonzero(color_mask(img, rgb, 45))
            if len(xs) == 0:
                return None
            return int((ys.mean() - oy) // cs), int((xs.mean() - ox) // cs)

        s, e = cell_of(START_C), cell_of(END_C)
        if s is None or e is None:
            return None
        return bfs(n, hw, vw, s, e)
