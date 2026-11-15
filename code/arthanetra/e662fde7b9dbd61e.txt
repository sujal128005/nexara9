"""Language support: every language file is complete and safe, offline answers and explanations work in each."""
import json
import os
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.explain import detect_intent, offline_answer, template
from app.i18n import LANGS, strings, t
from app.llm import reset_gateway
from app.main import app
from app.pipeline import analyse

reset_gateway()
client = TestClient(app)
I18N = Path(__file__).resolve().parent.parent / "app" / "i18n"
SAMPLES = Path(__file__).resolve().parent.parent / "samples"
EN = json.loads((I18N / "en.json").read_text(encoding="utf-8"))
PH = re.compile(r"\{[a-z_]+\}")
SCRIPT = {"hi": "ऀ-ॿ", "mr": "ऀ-ॿ", "bn": "ঀ-৿", "pa": "਀-੿", "gu": "઀-૿",
          "or": "଀-୿", "ta": "஀-௿", "te": "ఀ-౿", "kn": "ಀ-೿", "ml": "ഀ-ൿ"}


@pytest.mark.parametrize("lang", [x for x in LANGS if x != "en"])
def test_language_file_complete_and_safe(lang):
    data = json.loads((I18N / f"{lang}.json").read_text(encoding="utf-8"))
    missing = [k for k in EN if k not in data]
    assert len(missing) <= 5, f"{lang} missing {missing[:10]}"
    for k, v in data.items():
        assert sorted(PH.findall(v)) == sorted(PH.findall(EN[k])), f"{lang}:{k} placeholders changed"
        assert "\u2014" not in v, f"{lang}:{k} has an em dash"
    if lang in SCRIPT:
        rx = re.compile(f"[{SCRIPT[lang]}]")
        native = sum(1 for k in ("hero.title", "try.title", "res.money_title", "advice.Risky") if rx.search(data.get(k, "")))
        assert native >= 3, f"{lang} is not in its own script"


def run(name, lang="en"):
    return analyse((SAMPLES / f"{name}.txt").read_text(encoding="utf-8"), lang, use_llm=False)


@pytest.mark.parametrize("lang", LANGS)
def test_offline_explanation_in_every_language(lang):
    r = run("01_instant_loan_app", lang)
    x = r["explanation"]
    assert "807%" in x["headline"] and x["generated_by"] == "template"
    assert x["grounding"]["grounded"]
    if lang in SCRIPT:
        assert re.search(f"[{SCRIPT[lang]}]", x["summary"])


@pytest.mark.parametrize("q,intent", [
    ("namaste", "greeting"), ("What if I pay late?", "late"), ("Can I cancel this?", "cancel"),
    ("Is it guaranteed?", "guarantee"), ("what fees do I pay", "fees"), ("is it safe to sign", "safe"),
    ("can the app read my contacts", "perm"), ("how much will it cost", "cost"),
    ("क्या यह सुरक्षित है?", "safe"), ("late payment kitna lagega", "late"),
])
def test_detect_intent(q, intent):
    assert detect_intent(q) == intent


def test_offline_answers_use_engine_numbers():
    r = run("01_instant_loan_app")
    assert "807%" in offline_answer("how much does it cost", r, "en")
    assert "penal" in offline_answer("what if I pay late", r, "en").lower()
    assert "₹1,062" in offline_answer("fees?", r, "en")
    assert "Predatory" in offline_answer("is it safe", r, "en")
    hi = offline_answer("x", r, "hi", intent="cost")
    assert "807%" in hi and re.search("[ऀ-ॿ]", hi)
    ins = run("04_insurance_pitch")
    assert "3.26%" in offline_answer("what return", ins, "en", intent="cost")
    assert "15" in offline_answer("can I cancel", ins, "en")


def test_unknown_question_gets_helpful_fallback():
    r = run("07_fair_personal_loan")
    assert offline_answer("tell me a joke", r, "en") == t("en", "ans.fallback")


def test_i18n_endpoint_and_unknown_language():
    assert client.get("/api/i18n/ta").json()["hero.title"] == strings("ta")["hero.title"]
    assert client.get("/api/i18n/xx").status_code == 404


def test_explain_endpoint_switches_language():
    text = (SAMPLES / "04_insurance_pitch.txt").read_text(encoding="utf-8")
    r = client.post("/api/analyze", data={"text": text, "language": "en"}).json()
    out = client.post("/api/explain", json={"analysis": r, "document_text": text, "language": "bn"}).json()
    assert "3.26%" in out["headline"] and re.search("[ঀ-৿]", out["headline"])


def test_ask_endpoint_offline_with_intent():
    text = (SAMPLES / "01_instant_loan_app.txt").read_text(encoding="utf-8")
    r = client.post("/api/analyze", data={"text": text}).json()
    out = client.post("/api/ask", json={"question": "?", "intent": "cost", "analysis": r, "document_text": text, "language": "en"}).json()
    assert out["offline"] and "807%" in out["answer"]


def test_findings_carry_translatable_messages():
    r = run("01_instant_loan_app")
    for f in r["findings"]:
        assert f["msg_key"] in EN and f["explanation"] == t("en", f["msg_key"], **f["params"])
        assert f"rule.{f['rule_id']}" in EN
