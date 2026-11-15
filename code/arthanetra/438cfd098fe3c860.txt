"""
Security layer for ArthaNetra.

Money documents carry personal data, so before any text leaves this server for an
AI provider we mask identifiers, and every request passes through basic abuse
controls. Nothing a user uploads is written to disk or kept in memory after the
response is sent.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# ---------------------------------------------------------------------------------------------
# 1. Personal data masking (runs before any AI call)
# ---------------------------------------------------------------------------------------------


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def _card(m: re.Match) -> str:
    digits = re.sub(r"\D", "", m.group(0))
    if 13 <= len(digits) <= 19 and _luhn_ok(digits):
        return "[CARD XXXX " + digits[-4:] + "]"
    return m.group(0)


# Order matters: most specific first.
PII_RULES: list[tuple[str, re.Pattern, object]] = [
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),
    ("upi_id", re.compile(r"\b[\w.-]{2,}@(?:ok\w+|ybl|ibl|axl|upi|paytm|apl|yapl|icici|sbi|hdfcbank|axisbank|kotak|barodampay)\b", re.I), "[UPI ID]"),
    ("card", re.compile(r"\b(?:\d[ -]?){13,19}\b"), _card),
    ("aadhaar", re.compile(r"\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b"), "[AADHAAR XXXX]"),
    ("pan", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN]"),
    ("ifsc", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"), "[IFSC]"),
    ("account", re.compile(r"(?i)((?:a/?c|account|acct)\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*)(\d[\d -]{7,20}\d)"),
     lambda m: m.group(1) + "[ACCOUNT XXXX" + re.sub(r"\D", "", m.group(2))[-4:] + "]"),
    ("phone", re.compile(r"(?<![\d₹,.])(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d|,\d)"), "[PHONE]"),
]


def redact(text: str) -> tuple[str, dict]:
    """Mask Indian personal identifiers. Returns (masked_text, counts_by_type)."""
    counts: dict[str, int] = {}
    for name, rx, repl in PII_RULES:
        def sub(m, _repl=repl, _name=name):
            new = _repl(m) if callable(_repl) else _repl
            if new != m.group(0):
                counts[_name] = counts.get(_name, 0) + 1
            return new
        text = rx.sub(sub, text)
    return text, counts


# ---------------------------------------------------------------------------------------------
# 2. Upload validation by file signature (not by the file name the client claims)
# ---------------------------------------------------------------------------------------------

MAX_UPLOAD = 8 * 1024 * 1024
SIGNATURES = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],
}


def sniff(data: bytes) -> str | None:
    """Return the real media type of an upload, or 'text/plain' for readable text, or None."""
    for mime, sigs in SIGNATURES.items():
        if any(data.startswith(s) for s in sigs):
            if mime == "image/webp" and data[8:12] != b"WEBP":
                continue
            return mime
    head = data[:4096]
    if b"\x00" in head and not (head.startswith(b"\xff\xfe") or head.startswith(b"\xfe\xff")):
        return None  # binary we do not accept (executables, archives, office files...)
    return "text/plain"


# ---------------------------------------------------------------------------------------------
# 3. Bounds for simulator input (stops resource-exhaustion through absurd values)
# ---------------------------------------------------------------------------------------------

LIMITS = {
    "principal": (0, 1e10), "tenure_days": (1, 365 * 40), "rate_annual": (0, 100), "n_installments": (1, 600),
    "installment": (0, 1e10), "bullet_repayment": (0, 1e11), "disbursed": (0, 1e10), "prepay_month": (0, 600),
    "foreclosure_pct": (0, 1), "outstanding": (0, 1e9), "monthly_rate": (0, 1), "min_due_pct": (0.001, 1),
    "min_due_floor": (0, 1e7), "fixed_payment": (0, 1e9), "premium": (0, 1e9), "paying_term_years": (0, 60),
    "policy_term_years": (0, 100), "maturity_benefit": (0, 1e11), "benchmark_rate": (0, 1),
}


def check_model(model: dict) -> None:
    if not isinstance(model, dict) or model.get("model_type") not in ("LoanModel", "CardModel", "InvestmentModel"):
        raise ValueError("unknown model type")
    for k, (lo, hi) in LIMITS.items():
        v = model.get(k)
        if v is None:
            continue
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not (lo <= v <= hi):
            raise ValueError(f"{k} out of range")
    fees = model.get("fees", [])
    if not isinstance(fees, list) or len(fees) > 30:
        raise ValueError("too many fees")
    for f in fees:
        if not isinstance(f, dict) or not isinstance(f.get("amount"), (int, float)) or not (0 <= f["amount"] <= 1e10):
            raise ValueError("invalid fee")


# ---------------------------------------------------------------------------------------------
# 4. Tamper-evident report fingerprint
# ---------------------------------------------------------------------------------------------


def fingerprint(document: str, result: dict, version: str, rule_pack: str) -> dict:
    """Same document + same engine version = same fingerprint. Lets anyone check a shared report was not edited."""
    doc_hash = hashlib.sha256(document.encode("utf-8")).hexdigest()
    core = {
        "apr": round(result["computed"].get("apr") or 0, 6),
        "irr": round(result["computed"].get("irr") or 0, 6),
        "score": result["score"]["score"],
        "rules": sorted(f["rule_id"] for f in result["findings"]),
    }
    res_hash = hashlib.sha256(json.dumps(core, sort_keys=True).encode()).hexdigest()
    report_id = hashlib.sha256(f"{doc_hash}:{res_hash}:{version}:{rule_pack}".encode()).hexdigest()
    return {"document_sha256": doc_hash, "result_sha256": res_hash, "report_id": report_id[:16].upper(),
            "engine_version": version, "rule_pack": rule_pack}


# ---------------------------------------------------------------------------------------------
# 5. Middleware: rate limiting + security headers
# ---------------------------------------------------------------------------------------------

RATE = {  # path prefix: (requests, per seconds)
    "/api/analyze": (int(os.environ.get("RATE_ANALYZE_PER_MIN", "12")), 60),
    "/api/ask": (int(os.environ.get("RATE_ASK_PER_MIN", "20")), 60),
    "/api/transcribe": (int(os.environ.get("RATE_ASK_PER_MIN", "20")), 60),
    "/api/simulate": (int(os.environ.get("RATE_SIM_PER_MIN", "240")), 60),
    "/api/explain": (int(os.environ.get("RATE_ASK_PER_MIN", "20")), 60),
}

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; "
       "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def _client(self, request: Request) -> str:
        if os.environ.get("TRUST_PROXY", "0") == "1":
            fwd = request.headers.get("x-forwarded-for")
            if fwd:
                return fwd.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _limited(self, request: Request) -> int | None:
        for prefix, (limit, window) in RATE.items():
            if request.url.path.startswith(prefix) and request.method == "POST":
                key = (self._client(request), prefix)
                now = time.monotonic()
                with self.lock:
                    q = self.hits[key]
                    while q and now - q[0] > window:
                        q.popleft()
                    if len(q) >= limit:
                        return int(window - (now - q[0])) + 1
                    q.append(now)
        return None

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_UPLOAD + 512 * 1024:
            return JSONResponse({"detail": "Request too large (max 8 MB)."}, status_code=413)
        wait = self._limited(request)
        if wait is not None:
            return JSONResponse({"detail": f"Too many requests. Please try again in {wait} seconds."},
                                status_code=429, headers={"Retry-After": str(wait)})
        response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "no-referrer"
        h["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(self), payment=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi")):
            h["Content-Security-Policy"] = CSP
        if request.url.path.startswith("/api/"):
            h["Cache-Control"] = "no-store"
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
