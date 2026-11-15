"""
Translations for every piece of text ArthaNetra shows.

`en.json` is the source. Other languages were translated once and are bundled, so the whole app, including
offline explanations and offline answers, works in 12 languages with no AI key. Any key missing in a language
falls back to English.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ["en", "hi", "hinglish", "ta", "te", "bn", "mr", "kn", "gu", "ml", "pa", "or"]
_PH = re.compile(r"\{([a-z_]+)\}")


@lru_cache(maxsize=None)
def strings(lang: str) -> dict:
    with open(os.path.join(HERE, "en.json"), encoding="utf-8") as f:
        base = json.load(f)
    if lang != "en" and lang in LANGS:
        path = os.path.join(HERE, f"{lang}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                base.update({k: v for k, v in json.load(f).items() if k in base and isinstance(v, str) and v.strip()})
    return base


def _join(lang: str, items: list) -> str:
    names = [strings(lang).get("perm." + str(x), str(x)) for x in items]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " " + strings(lang).get("list.and", "and") + " " + names[-1]


def t(lang: str, key: str, **params) -> str:
    s = strings(lang if lang in LANGS else "en").get(key) or strings("en").get(key) or key

    def rep(m):
        v = params.get(m.group(1))
        if v is None:
            return m.group(0)
        if isinstance(v, (list, tuple)):
            return _join(lang, list(v))
        return str(v)

    return _PH.sub(rep, s)


def inr(x) -> str:
    """Indian digit grouping: 4000000 -> ₹40,00,000."""
    if x is None:
        return "-"
    neg, n = x < 0, abs(round(float(x)))
    s = str(int(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = head + "," + tail
    return ("-" if neg else "") + "₹" + s


def pct(x, digits: int | None = None) -> str:
    if x is None:
        return "-"
    v = x * 100
    if digits is None:
        digits = 0 if abs(v) >= 100 else 1
    return f"{v:,.{digits}f}%"
