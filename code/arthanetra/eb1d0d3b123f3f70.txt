"""
Financial Dark-Pattern Lexicon (English + Hinglish).

Detects persuasion tricks used in loan apps, EMI offers and insurance pitches.
Deterministic, explainable, and extensible. Each pattern carries a category
and a plain-language reason that is shown to the user.
"""
from __future__ import annotations

import re

PATTERNS = [
    # (category, regex, why it matters, weight)
    ("False urgency", r"(offer|deal)?\s*valid (only )?(for|till|until) (the )?(next|today|\d+\s*(min|minutes|hours|hrs))[^.\n]*|"
                      r"(last|final) (date|day|chance)[^.\n]*|limited[\s-]time[^.\n]*|hurry[^.\n]*|closes? (today|tonight|on)[^.\n]*|"
                      r"sirf aaj|aaj hi|jaldi karein",
     "Artificial deadlines push you to sign before reading or comparing.", 1.0),
    ("Too-good-to-be-true", r"guarantee[d]?[^.\n]{0,60}|assured returns?[^.\n]{0,40}|double (your )?money[^.\n]{0,40}|"
                             r"risk[\s-]?free[^.\n]{0,40}|paisa double",
     "Guaranteed or 'double money' claims are the most common mis-selling hook.", 1.2),
    ("'Free' that isn't", r"no[\s-]?cost emi|0\s*%\s*(interest|emi)|zero (interest|cost)|free (life )?(cover|insurance)|"
                          r"interest[\s-]free",
     "'Free' features are usually paid for through fees, discounts you lose, or a lower return.", 1.0),
    ("Minimised cost framing", r"(only|just|sirf)\s*(₹|rs\.?|inr)?\s*\d[\d,.]*\s*%?\s*(per|a|/)\s*(day|week|din)",
     "Quoting a tiny per-day rate hides an enormous yearly cost.", 1.0),
    ("Reassurance smoke-screen", r"no hidden (charges|fees|costs)|100\s*%\s*transparent|zero paperwork",
     "Claims of 'no hidden charges' next to undisclosed fees are a warning sign.", 0.8),
    ("Fine-print escape hatch", r"\*\s*t\s*&\s*c|terms (and|&) conditions apply|conditions apply|subject to change",
     "Key conditions are pushed into fine print you are unlikely to read.", 0.5),
    ("Approval bait", r"pre[\s-]?approved|instant approval|approved in \d+\s*(sec|second|min)|no credit check|without cibil",
     "'Instant / no credit check' lenders compensate for risk with very high charges.", 0.8),
    ("Coercion / shaming", r"(contacts?|relatives?|friends?|family|employer)\s+(will|may|shall)\s+be\s+(informed|contacted|notified)|"
                           r"legal action[^.\n]{0,40}immediately|police (complaint|case)|defaulter list",
     "Threats of social shaming or police action are illegal recovery tactics.", 1.5),
    ("Tax-saving pressure", r"tax[\s-]?sav(ing|e)[^.\n]{0,50}(last|deadline|before|march)",
     "Tax deadlines are used to rush people into long lock-in products.", 0.7),
]


CAT_KEY = {
    "False urgency": "urgency", "Too-good-to-be-true": "too_good", "'Free' that isn't": "free",
    "Minimised cost framing": "minimised", "Reassurance smoke-screen": "smoke", "Fine-print escape hatch": "fineprint",
    "Approval bait": "approval", "Coercion / shaming": "coercion", "Tax-saving pressure": "tax",
}


def detect(text: str) -> list[dict]:
    found = []
    seen = set()
    for category, rx, why, weight in PATTERNS:
        for m in re.finditer(rx, text, re.I):
            phrase = m.group(0).strip(" .,:;-*")
            if len(phrase) < 3:
                continue
            key = (category, phrase.lower()[:40])
            if key in seen:
                continue
            seen.add(key)
            found.append({"category": category, "key": CAT_KEY.get(category, ""), "phrase": phrase[:120], "why": why, "weight": weight,
                          "start": m.start(), "end": m.end()})
    return found
