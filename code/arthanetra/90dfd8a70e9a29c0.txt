"""
Provider-agnostic LLM gateway.

ArthaNetra runs with:
  * Groq   (GROQ_API_KEY):   default, gpt-oss-120b for reading, Whisper for voice
  * Gemini (GEMINI_API_KEY): also reads screenshots / scanned PDFs (vision)
  * Offline:                 no key at all, deterministic heuristic extractor + templates

The LLM is used ONLY for language tasks (reading, explaining, translating,
answering). It never does arithmetic that reaches the user.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from typing import Optional

import httpx

GROQ_URL = "https://api.groq.com/openai/v1"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = httpx.Timeout(90.0, connect=15.0)


class LLMError(RuntimeError):
    pass


def _client() -> httpx.Client:
    verify = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE") or True
    return httpx.Client(timeout=TIMEOUT, verify=verify)


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).rstrip("`").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise


class Gateway:
    def __init__(self):
        self.groq_key = os.environ.get("GROQ_API_KEY", "").strip()
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self.groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
        self.groq_fast_model = os.environ.get("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
        self.whisper_model = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")
        self.gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self.last_model = None
        pref = os.environ.get("ARTHANETRA_PROVIDER", "auto").lower()
        if pref == "offline":
            self.provider = "offline"
        elif pref == "gemini" and self.gemini_key:
            self.provider = "gemini"
        elif pref == "groq" and self.groq_key:
            self.provider = "groq"
        elif self.groq_key:
            self.provider = "groq"
        elif self.gemini_key:
            self.provider = "gemini"
        else:
            self.provider = "offline"

    # ------------------------------------------------------------------ info
    @property
    def online(self) -> bool:
        return self.provider != "offline"

    @property
    def can_see_images(self) -> bool:
        return bool(self.gemini_key)

    @property
    def can_hear(self) -> bool:
        return bool(self.groq_key)

    def describe(self) -> dict:
        return {
            "provider": self.provider,
            "model": {"groq": self.groq_model, "gemini": self.gemini_model}.get(self.provider, "heuristic-v1"),
            "vision": self.can_see_images,
            "voice": self.can_hear,
        }

    # ------------------------------------------------------------------ chat
    def chat(self, system: str, user: str, *, json_mode: bool = False, fast: bool = False,
             temperature: float = 0.1, max_tokens: int = 4096) -> str:
        if self.provider == "groq":
            return self._groq_chat(system, user, json_mode, fast, temperature, max_tokens)
        if self.provider == "gemini":
            return self._gemini(system, [{"text": user}], json_mode, temperature, max_tokens)
        raise LLMError("No LLM provider configured (offline mode)")

    def chat_json(self, system: str, user: str, **kw) -> dict:
        last = None
        for _ in range(2):
            try:
                return _parse_json(self.chat(system, user, json_mode=True, **kw))
            except (json.JSONDecodeError, LLMError) as e:  # one retry
                last = e
        raise LLMError(f"Model did not return valid JSON: {last}")

    def _groq_chat(self, system, user, json_mode, fast, temperature, max_tokens) -> str:
        """Rate-limit aware: retries 429s with back-off, then falls back to the fast model (separate quota)."""
        models = [self.groq_fast_model] if fast else [self.groq_model, self.groq_fast_model]
        last_err = "unknown"
        for model in models:
            body = {
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": temperature,
                "max_completion_tokens": max_tokens,
            }
            if "gpt-oss" in model:
                body["reasoning_effort"] = "low" if (fast or model == self.groq_fast_model) else "medium"
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            for attempt in range(3):
                try:
                    with _client() as c:
                        r = c.post(f"{GROQ_URL}/chat/completions", json=body,
                                   headers={"Authorization": f"Bearer {self.groq_key}"})
                except httpx.HTTPError as e:
                    last_err = f"network error: {e.__class__.__name__}"
                    time.sleep(1.0)
                    continue
                if r.status_code == 429 and attempt < 2:
                    try:
                        wait = float(r.headers.get("retry-after", "2"))
                    except ValueError:
                        wait = 2.0
                    time.sleep(min(max(wait, 1.0), 6.0))
                    continue
                if r.status_code >= 400:
                    last_err = f"Groq error {r.status_code}: {r.text[:200]}"
                    break
                self.last_model = model
                return r.json()["choices"][0]["message"]["content"] or ""
        raise LLMError(last_err)

    def _gemini(self, system, parts, json_mode, temperature, max_tokens) -> str:
        cfg = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if json_mode:
            cfg["responseMimeType"] = "application/json"
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": parts}], "generationConfig": cfg}
        try:
            with _client() as c:
                r = c.post(f"{GEMINI_URL}/{self.gemini_model}:generateContent", json=body,
                           headers={"x-goog-api-key": self.gemini_key})
        except httpx.HTTPError as e:
            raise LLMError(f"Gemini network error: {e.__class__.__name__}")
        if r.status_code >= 400:
            raise LLMError(f"Gemini error {r.status_code}: {r.text[:300]}")
        data = r.json()
        try:
            return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
        except (KeyError, IndexError):
            raise LLMError(f"Gemini returned no content: {str(data)[:300]}")

    # ------------------------------------------------------------------ vision / OCR
    def transcribe_document(self, data: bytes, mime: str) -> str:
        """Faithful transcription of a screenshot / scanned PDF (Gemini vision)."""
        if not self.gemini_key:
            raise LLMError("Reading images needs GEMINI_API_KEY. Paste the text instead, or upload a text PDF.")
        parts = [
            {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
            {"text": "Transcribe ALL text in this financial document exactly as written, preserving numbers, "
                     "currency symbols, line order and fine print. Output plain text only."},
        ]
        return self._gemini("You are a meticulous OCR engine for Indian financial documents.", parts, False, 0.0, 8192)

    # ------------------------------------------------------------------ speech
    def transcribe_audio(self, data: bytes, filename: str, language: Optional[str] = None) -> str:
        if not self.groq_key:
            raise LLMError("Voice questions need GROQ_API_KEY.")
        files = {"file": (filename or "audio.webm", data)}
        form = {"model": self.whisper_model, "response_format": "json", "temperature": "0"}
        if language:
            form["language"] = language
        try:
            with _client() as c:
                r = c.post(f"{GROQ_URL}/audio/transcriptions", data=form, files=files,
                           headers={"Authorization": f"Bearer {self.groq_key}"})
        except httpx.HTTPError as e:
            raise LLMError(f"Transcription network error: {e.__class__.__name__}")
        if r.status_code >= 400:
            raise LLMError(f"Transcription error {r.status_code}: {r.text[:300]}")
        return r.json().get("text", "").strip()


_gateway: Optional[Gateway] = None


def gateway() -> Gateway:
    global _gateway
    if _gateway is None:
        _gateway = Gateway()
    return _gateway


def reset_gateway():
    global _gateway
    _gateway = None
