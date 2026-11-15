"""Core data model, rendering canvas and family registry for PixelProof."""
from __future__ import annotations

import hashlib
import io
import json
import math
import random
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

VERSION = "1.0.0"
LEVELS = 5  # difficulty levels 0..4

# ----------------------------------------------------------------------------
# Answers
# ----------------------------------------------------------------------------


@dataclass
class Answer:
    """Ground-truth answer.

    kind:  "int"   exact integer match
           "float" numeric match within +/- tol
           "label" normalised string match against `value` (with optional aliases)
    """

    kind: str
    value: Any
    tol: float = 0.0
    space: int | None = None  # size of the answer space (for chance rate), None = continuous
    aliases: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "Answer":
        return Answer(**d)

    def matches(self, pred: Any) -> bool:
        if pred is None:
            return False
        if self.kind == "int":
            try:
                return int(round(float(pred))) == int(self.value) and abs(float(pred) - round(float(pred))) < 1e-6
            except (TypeError, ValueError):
                return False
        if self.kind == "float":
            try:
                return abs(float(pred) - float(self.value)) <= self.tol + 1e-9
            except (TypeError, ValueError):
                return False
        norm = normalise_label(str(pred))
        return norm == normalise_label(str(self.value)) or norm in {normalise_label(a) for a in self.aliases}


_SYNONYMS = {"grey": "gray", "colour": "color", "squares": "square", "circles": "circle",
             "triangles": "triangle", "stars": "star", "diamonds": "diamond"}


def normalise_label(s: str) -> str:
    s = s.lower().strip().strip(".!\"'`*").replace("-", " ").replace("_", " ")
    for art in ("the ", "a ", "an "):
        if s.startswith(art):
            s = s[len(art):]
    words = [_SYNONYMS.get(w, w) for w in s.split()]
    return " ".join(words)


# ----------------------------------------------------------------------------
# Tasks
# ----------------------------------------------------------------------------


@dataclass
class Task:
    id: str
    pair_id: str
    role: str  # "A" or "B" (counterfactual twin)
    family: str
    qtype: str
    difficulty: int
    knobs: dict
    question: str
    answer_format: str
    answer: dict
    public: dict  # facts legible in the image, given to the independent verifier
    params: dict  # full hidden scene description (generator side)
    seed: int
    image: str = ""  # relative path
    image_sha256: str = ""
    checks: dict = field(default_factory=dict)
    chance: float = 0.0
    version: str = VERSION

    def ans(self) -> Answer:
        return Answer.from_dict(self.answer)

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True)

    @staticmethod
    def from_dict(d: dict) -> "Task":
        return Task(**d)


# ----------------------------------------------------------------------------
# Rendering
# ----------------------------------------------------------------------------

SS = 3  # supersampling factor for anti-aliased rendering

PALETTE = {
    "red": (220, 38, 38),
    "blue": (37, 99, 235),
    "green": (22, 163, 74),
    "orange": (234, 128, 12),
    "purple": (147, 51, 234),
    "teal": (13, 148, 136),
    "pink": (219, 39, 119),
    "brown": (133, 77, 14),
    "gray": (115, 115, 115),
    "black": (0, 0, 0),
}

_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int) -> ImageFont.FreeTypeFont:
    if size not in _font_cache:
        _font_cache[size] = ImageFont.load_default(size=size)
    return _font_cache[size]


class Canvas:
    """Draw in output-pixel coordinates; rendered at SS x resolution then downsampled."""

    def __init__(self, w: int, h: int, bg=(255, 255, 255)):
        self.w, self.h = w, h
        self.img = Image.new("RGB", (w * SS, h * SS), bg)
        self.d = ImageDraw.Draw(self.img)

    @staticmethod
    def _s(v):
        return v * SS

    def line(self, pts, fill, width=2.0):
        p = [(x * SS, y * SS) for x, y in pts]
        self.d.line(p, fill=fill, width=max(1, int(round(width * SS))), joint="curve")
        r = width * SS / 2
        for x, y in (p[0], p[-1]):
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def polyline_round(self, pts, fill, width=2.0):
        """Polyline with round joins at every vertex (good for curves)."""
        p = [(x * SS, y * SS) for x, y in pts]
        self.d.line(p, fill=fill, width=max(1, int(round(width * SS))), joint="curve")
        r = width * SS / 2
        for x, y in p[:: max(1, len(p) // 400) or 1]:
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def circle(self, cx, cy, r, fill=None, outline=None, width=1.0):
        self.d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=fill,
                       outline=outline, width=max(1, int(round(width * SS))))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1.0):
        self.d.rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=fill, outline=outline,
                         width=max(1, int(round(width * SS))))

    def polygon(self, pts, fill=None, outline=None, width=1.0):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=fill, outline=outline,
                       width=max(1, int(round(width * SS))))

    def text(self, x, y, s, size=14, fill=(40, 40, 48), anchor="mm"):
        self.d.text((x * SS, y * SS), s, font=font(size * SS), fill=fill, anchor=anchor)

    def finish(self) -> Image.Image:
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def color_mask(arr: np.ndarray, rgb, tol: float = 40.0) -> np.ndarray:
    d = arr[..., :3].astype(np.int32) - np.array(rgb, dtype=np.int32)
    return (d * d).sum(-1) <= tol * tol


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def ahash(img: Image.Image, n: int = 16) -> str:
    """Average perceptual hash (for near-duplicate detection)."""
    g = np.asarray(img.convert("L").resize((n, n), Image.BILINEAR), dtype=np.float32)
    bits = (g > g.mean()).flatten()
    return "".join("1" if b else "0" for b in bits)


def hamming(a: str, b: str) -> int:
    return sum(x != y for x, y in zip(a, b))


# ----------------------------------------------------------------------------
# Shapes shared by several families
# ----------------------------------------------------------------------------

SHAPES = ["circle", "square", "triangle", "star"]


def canon_rot(shape: str, rot: float) -> float:
    """Squares are only tilted up to +/-15 deg so they can never be read as 'diamonds' (avoids label ambiguity)."""
    if shape == "square":
        q = (rot % (math.pi / 2)) / (math.pi / 2)  # 0..1
        return (q - 0.5) * 2 * math.radians(15)
    return rot


def shape_points(shape: str, cx: float, cy: float, r: float, rot: float) -> list[tuple[float, float]]:
    rot = canon_rot(shape, rot)
    if shape == "square":
        return [(cx + r * math.cos(rot + math.pi / 4 + k * math.pi / 2),
                 cy + r * math.sin(rot + math.pi / 4 + k * math.pi / 2)) for k in range(4)]
    if shape == "triangle":
        return [(cx + r * math.cos(rot - math.pi / 2 + k * 2 * math.pi / 3),
                 cy + r * math.sin(rot - math.pi / 2 + k * 2 * math.pi / 3)) for k in range(3)]
    if shape == "star":
        pts = []
        for k in range(10):
            rr = r if k % 2 == 0 else r * 0.45
            a = rot - math.pi / 2 + k * math.pi / 5
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        return pts
    raise ValueError(shape)


def draw_shape(cv: Canvas, shape: str, cx, cy, r, rot, fill, outline=None):
    if shape == "circle":
        cv.circle(cx, cy, r, fill=fill, outline=outline, width=1.5)
    else:
        cv.polygon(shape_points(shape, cx, cy, r, rot), fill=fill, outline=outline, width=1.5)


def components(mask: np.ndarray, min_px: int = 20) -> list[np.ndarray]:
    """4-connected components; returns list of (N,2) arrays of (y,x) coords."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pts) >= min_px:
            out.append(np.array(pts))
    return out


def _hull_area(pts: np.ndarray) -> float:
    p = sorted(set(map(tuple, pts.tolist())))
    if len(p) < 3:
        return 0.0

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for q in p:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(p):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    hull = lower[:-1] + upper[:-1]
    a = 0.0
    for i in range(len(hull)):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % len(hull)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def classify_shape(comp: np.ndarray) -> str:
    """Classify a filled blob as circle/square/triangle/star from pixels only."""
    area = float(len(comp))
    c = comp.mean(0)
    rmax = float(np.sqrt(((comp - c) ** 2).sum(1)).max()) + 0.5
    circularity = area / (math.pi * rmax * rmax)
    solidity = area / max(_hull_area(comp + 0.5), 1.0)
    if solidity < 0.78:
        return "star"
    if circularity > 0.80:
        return "circle"
    if circularity > 0.52:
        return "square"
    return "triangle"


# ----------------------------------------------------------------------------
# Family registry
# ----------------------------------------------------------------------------


class Family:
    """Base class. A family is a parametric generator of verifiable visual tasks."""

    name = "base"
    title = "Base"
    application = ""
    skill = ""
    qtypes: list[str] = []
    knob_doc: dict[str, str] = {}

    # --- generator side -----------------------------------------------------
    def sample(self, rng: random.Random, level: int, qtype: str | None = None) -> dict:
        raise NotImplementedError

    def render(self, params: dict) -> Image.Image:
        raise NotImplementedError

    def question(self, params: dict) -> tuple[str, str]:
        """Return (question text, answer-format hint)."""
        raise NotImplementedError

    def answer(self, params: dict) -> Answer:
        raise NotImplementedError

    def public(self, params: dict) -> dict:
        """Facts a human can read off the image (axis labels, terminal names...)."""
        return {}

    def knobs(self, params: dict) -> dict:
        return {}

    def evidence(self, params: dict) -> list[str]:
        """Sufficiency checks: return a list of problems (empty == image carries enough evidence)."""
        return []

    def twin(self, params: dict, rng: random.Random) -> dict | None:
        """Minimal counterfactual edit: same question text, different correct answer."""
        raise NotImplementedError

    # --- independent verifier side ---------------------------------------------
    def verify(self, img: np.ndarray, public: dict, question_params: dict) -> Any:
        """Recompute the answer from pixels only (+ public, legible facts)."""
        raise NotImplementedError

    def chance(self, params: dict) -> float:
        a = self.answer(params)
        return 1.0 / a.space if a.space else 0.0


REGISTRY: dict[str, Family] = {}


def register(cls):
    REGISTRY[cls.name] = cls()
    return cls


def qparams(params: dict) -> dict:
    """The part of params that defines *what is asked* (same for both twins)."""
    return params.get("q", {})
