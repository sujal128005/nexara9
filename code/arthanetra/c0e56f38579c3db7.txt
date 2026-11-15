"""
Builds app/i18n/<lang>.json from app/i18n/en.json using the configured AI model.

Run from backend/:  GROQ_API_KEY=... python tools/translate.py [lang ...]
Resumable: keys already translated (with matching placeholders) are kept.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.llm import Gateway, LLMError  # noqa: E402

HERE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "i18n")
LANGS = {
    "hi": "Hindi (Devanagari script)", "hinglish": "Hinglish: Hindi sentences written in Roman (Latin) letters, the way Indians text on WhatsApp, for example 'Aapko kitna dena padega?' or 'Yeh loan bahut mehenga hai.' The grammar and most words must be Hindi; only common finance words like loan, EMI, fee, interest may stay English. Never return a plain English sentence",
    "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "mr": "Marathi", "kn": "Kannada", "gu": "Gujarati",
    "ml": "Malayalam", "pa": "Punjabi (Gurmukhi script)", "or": "Odia",
}
PH = re.compile(r"\{[a-z_]+\}")

SYSTEM = """You translate the user interface of ArthaNetra, an Indian app that explains loans, EMI offers, credit cards
and insurance plans to ordinary people. Translate every JSON value into {LANG}.

Rules:
- Return a JSON object with exactly the same keys. Translate values only.
- Keep every placeholder like {apr} or {n} exactly as it is, unchanged and untranslated.
- Do not translate: ArthaNetra, APR, EMI, KFS, RBI, IRDAI, NBFC, GST, PAN, Aadhaar, UPI, IFSC, PPF, SMS, KYC, PDF, PNG, JPG,
  WhatsApp, IRR, Trap Score, the rupee sign and numbers.
- Use simple, warm, everyday language that a first-time borrower in a small town understands. Avoid heavy formal or
  Sanskritised words where a common word exists. Common English finance words people use in daily speech (loan, EMI,
  fee, interest, bank) may stay in English if that is how people normally say them.
- Never use em dashes or en dashes. Use commas and full stops.
- Keep short labels short. Keep sentence-ending full stops where the English has them.
- Keys starting with "kw." are search keywords: return a comma-separated list of words and short phrases that people
  would actually type in {LANG} for that idea (in its script, plus common Roman-script spellings), 6 to 15 items."""


BATCH = int(os.environ.get("TRANSLATE_BATCH", "20"))
SAME_OK = ("share.score", "share.check", "engine.ai", "verdict.score")


def ok(src: str, dst: str, key: str = "") -> bool:
    if not (isinstance(dst, str) and dst.strip() != "" and sorted(PH.findall(src)) == sorted(PH.findall(dst))):
        return False
    # a long sentence returned unchanged was not translated
    if dst.strip() == src.strip() and len(src) > 25 and not key.startswith(("kw.", "field.")) and key not in SAME_OK:
        return False
    return True


def translate(lang: str, g: Gateway, en: dict):
    path = os.path.join(HERE, f"{lang}.json")
    out = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    todo = [k for k in en if not (k in out and ok(en[k], out[k], k))]
    print(f"[{lang}] {len(todo)} to translate", flush=True)
    for i in range(0, len(todo), BATCH):
        batch = {k: en[k] for k in todo[i:i + BATCH]}
        for attempt in range(6):
            try:
                res = g.chat_json(SYSTEM.replace("{LANG}", LANGS[lang]), json.dumps(batch, ensure_ascii=False, indent=0),
                                  temperature=0.2, max_tokens=8000)
                good = 0
                for k, v in res.items():
                    if k in batch and ok(batch[k], v, k):
                        out[k] = v.replace("\u2014", ", ").replace("\u2013", "-").strip()
                        good += 1
                print(f"[{lang}] batch {i // BATCH + 1}: {good}/{len(batch)}", flush=True)
                json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                if good >= len(batch) * 0.9:
                    break
                batch = {k: v for k, v in batch.items() if not (k in out and ok(v, out[k], k))}
            except (LLMError, ValueError) as e:
                wait = 15 * (attempt + 1)
                print(f"[{lang}] retry in {wait}s: {str(e)[:100]}", flush=True)
                time.sleep(wait)
    missing = [k for k in en if not (k in out and ok(en[k], out[k], k))]
    print(f"[{lang}] done, missing {len(missing)}", flush=True)


if __name__ == "__main__":
    en = json.load(open(os.path.join(HERE, "en.json"), encoding="utf-8"))
    g = Gateway()
    for lang in (sys.argv[1:] or list(LANGS)):
        translate(lang, g, en)
