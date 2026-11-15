"""
ArthaNetra API (FastAPI application).

Run:  uvicorn app.main:app --reload   (from the backend/ folder)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .engine.rules import RULE_PACK_VERSION, RULES
from .explain import LANGUAGES, ask, narrate
from .i18n import LANGS, strings
from .ingest import to_text
from .llm import LLMError, gateway
from .pipeline import analyse, simulate
from .security import SecurityMiddleware, check_model, fingerprint, redact

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv():
    """Tiny .env loader (no extra dependency). Real environment variables take precedence."""
    for env_file in (ROOT.parent / ".env", ROOT / ".env"):
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if v.strip() and k.strip() not in os.environ:
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")


_load_dotenv()
SAMPLES = ROOT / "samples"
FRONTEND = Path(os.environ.get("ARTHANETRA_FRONTEND", ROOT.parent / "frontend"))

app = FastAPI(title="ArthaNetra API", version=__version__,
              description="Reads financial documents and computes their true cost. AI reads, code calculates.")
# Same-origin by default. Set ALLOWED_ORIGINS="https://a.com,https://b.com" to let other sites call the API.
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"])
app.add_middleware(SecurityMiddleware)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__, "rule_pack": RULE_PACK_VERSION, "engine": gateway().describe(),
            "languages": LANGUAGES}


@app.get("/api/samples")
def samples():
    return json.loads((SAMPLES / "index.json").read_text(encoding="utf-8"))


@app.get("/api/samples/{sample_id}")
def sample(sample_id: str):
    p = (SAMPLES / f"{sample_id}.txt").resolve()
    if p.parent != SAMPLES.resolve() or not p.exists():
        raise HTTPException(404, "Sample not found")
    return {"id": sample_id, "text": p.read_text(encoding="utf-8")}


@app.get("/api/i18n/{lang}")
def i18n(lang: str):
    if lang not in LANGS:
        raise HTTPException(404, "Unknown language")
    return strings(lang)


class ExplainRequest(BaseModel):
    analysis: dict
    document_text: str = ""
    language: str = "en"


@app.post("/api/explain")
def explain_ep(req: ExplainRequest):
    """Re-writes the plain-language explanation in another language, without re-reading the document."""
    a = req.analysis
    needed = ("product_type", "facts", "computed", "findings", "score")
    if not all(k in a for k in needed):
        raise HTTPException(400, "Incomplete analysis")
    lang = req.language if req.language in LANGUAGES else "en"
    result = {k: a[k] for k in needed}
    result["patterns"] = a.get("patterns") or []
    doc, _ = redact(req.document_text[:30000])
    return narrate(result, lang, doc)


@app.get("/api/rules")
def rules():
    return {"version": RULE_PACK_VERSION, "rules": [
        {"id": r.rule_id, "title": r.title, "severity": r.severity, "regulator": r.regulator,
         "citation": r.citation, "applies_to": list(r.applies_to)} for r in RULES]}


@app.post("/api/analyze")
async def analyze(text: Optional[str] = Form(None), language: str = Form("en"),
                  benchmark: float = Form(7.1), file: Optional[UploadFile] = File(None),
                  offline: bool = Form(False)):
    method = "text"
    if file is not None and file.filename:
        data = await file.read()
        try:
            text, method = to_text(data, file.filename, file.content_type)
        except (ValueError, LLMError) as e:
            raise HTTPException(400, str(e))
    if not text or len(text.strip()) < 20:
        raise HTTPException(400, "Please paste or upload a financial document (at least a few lines).")
    if language not in LANGUAGES:
        language = "en"
    benchmark = min(max(benchmark, 0.0), 20.0)
    # Personal identifiers are masked before the text reaches any AI provider.
    text, redactions = redact(text.strip()[:30000])
    result = analyse(text, language=language, use_llm=not offline, benchmark_rate=benchmark / 100)
    result["document_text"] = text
    result["ingest_method"] = method
    result["privacy"] = {"redactions": redactions, "stored": False}
    result["integrity"] = fingerprint(text, result, __version__, RULE_PACK_VERSION)
    return JSONResponse(result)


class SimRequest(BaseModel):
    model: dict
    facts: dict
    document_text: str = ""
    product_type: Optional[str] = None


@app.post("/api/simulate")
def simulate_ep(req: SimRequest):
    try:
        check_model(req.model)
        return simulate(req.model, req.facts, req.document_text[:30000], req.product_type)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, f"Invalid model: {e}")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    intent: Optional[str] = None
    analysis: dict
    document_text: str = ""
    language: str = "en"


@app.post("/api/ask")
def ask_ep(req: AskRequest):
    slim = {k: req.analysis.get(k) for k in ("product_type", "facts", "computed", "findings", "score")}
    if isinstance(slim.get("computed"), dict):
        slim["computed"] = {k: v for k, v in slim["computed"].items() if k != "flows"}
    doc, _ = redact(req.document_text[:30000])
    lang = req.language if req.language in LANGUAGES else "en"
    try:
        return ask(req.question, slim, doc, lang, req.intent)
    except LLMError as e:
        raise HTTPException(502, str(e))


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Form(None)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Audio too long (max 8 MB).")
    try:
        lang = language if language and len(language) == 2 else None
        return {"text": gateway().transcribe_audio(data, file.filename or "voice.webm", lang)}
    except LLMError as e:
        raise HTTPException(502, str(e))


if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND / "index.html")
