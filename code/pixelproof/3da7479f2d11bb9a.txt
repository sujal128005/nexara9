"""Model adapters. Plain HTTP (urllib) so the factory has no SDK lock-in.

Model spec strings:
  openai:<model>           OpenAI-compatible chat API  (OPENAI_API_KEY, OPENAI_BASE_URL)
                           -> works with OpenAI, OpenRouter, Together, Groq, vLLM, LM Studio...
  groq:<model>             Groq (GROQ_API_KEY), e.g. groq:qwen/qwen3.8-27b
  ollama:<model>           local Ollama (http://localhost:11434/v1), e.g. ollama:qwen2.5vl:7b
  gemini:<model>           Google Gemini API, native endpoint (GEMINI_API_KEY)
  google:<model>           Gemini / Gemma via Google's OpenAI-compatible endpoint (Bearer GEMINI_API_KEY)
  anthropic:<model>        Anthropic Messages API (ANTHROPIC_API_KEY)
  blind:<spec>             same model, image withheld (text-only control)
  baseline:blind-prior     text-only attacker: most frequent answer for the question template
  baseline:constant        always answers the same thing (sanity check for the scorer)
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

MAX_OUT = 2048  # output-token cap (reasoning + answer); answers without an ANSWER line count as unparsed

SYSTEM = ("You are being evaluated on visual understanding. Look at the image carefully and answer the question. "
          "You may think step by step, but the LAST line of your reply must be exactly:\nANSWER: <answer>")


def user_prompt(question: str, fmt: str) -> str:
    return f"Question: {question}\nAnswer format: {fmt}."


def _dur(v: str | None) -> float | None:
    """Parse '1', '59.9s', '7m12s', '250ms' style durations."""
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        pass
    import re as _re
    total = 0.0
    for num, unit in _re.findall(r"([\d.]+)(ms|h|m|s)", v):
        total += float(num) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[unit]
    return total or None


def _retry_wait(headers, attempt: int) -> float:
    """Honour Retry-After and token-bucket reset headers (Groq/OpenAI style)."""
    cands = []
    if headers:
        ra = _dur(headers.get("retry-after"))
        if ra:
            cands.append(ra)
        if headers.get("x-ratelimit-remaining-tokens") in ("0",) or (
                headers.get("x-ratelimit-remaining-tokens") or "1").isdigit() and int(
                headers.get("x-ratelimit-remaining-tokens") or 1) < 2500:
            rt = _dur(headers.get("x-ratelimit-reset-tokens"))
            if rt:
                cands.append(rt)
    w = max(cands) if cands else min(60, 2 ** attempt * 2)
    return min(90.0, w + 0.5)


def _post(url: str, body: dict, headers: dict, timeout: int = 120) -> dict:
    data = json.dumps(body).encode()
    last = None
    for attempt in range(14):
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "pixelproof/1.0", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:300]!r}"
            if e.code in (429, 500, 502, 503, 504):
                w = _retry_wait(e.headers, attempt)
                if os.environ.get("PIXELPROOF_DEBUG"):
                    print(f"[retry] HTTP {e.code} wait {w:.1f}s headers="
                          f"{ {k: v for k, v in (e.headers or {}).items() if 'rate' in k.lower() or 'retry' in k.lower()} }",
                          flush=True)
                time.sleep(w)
                continue
            raise RuntimeError(last) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = str(e)
            if os.environ.get("PIXELPROOF_DEBUG"):
                print(f"[retry] network error {last[:120]}", flush=True)
            time.sleep(2 ** attempt)
    raise RuntimeError(last)


class Model:
    name = "model"
    uses_image = True

    def ask(self, image_png: bytes | None, question: str, fmt: str, task=None) -> dict:
        raise NotImplementedError


class OpenAICompat(Model):
    def __init__(self, model: str, base_url: str | None = None, key: str | None = None):
        self.model = model
        self.base = (base_url or os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.key = key if key is not None else os.environ.get("OPENAI_API_KEY", "")
        self.name = f"openai:{model}"

    def ask(self, image_png, question, fmt, task=None):
        content = user_prompt(question, fmt)
        if image_png is not None:
            b64 = base64.b64encode(image_png).decode()
            content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                       {"type": "text", "text": content}]
        body = {"model": self.model, "messages": [{"role": "system", "content": SYSTEM},
                                                  {"role": "user", "content": content}], "temperature": 0,
                "max_tokens": MAX_OUT}
        h = {"Authorization": f"Bearer {self.key}"} if self.key else {}
        r = _post(f"{self.base}/chat/completions", body, h)
        u = r.get("usage", {})
        return {"text": r["choices"][0]["message"]["content"] or "",
                "tokens_in": u.get("prompt_tokens"), "tokens_out": u.get("completion_tokens")}


class Gemini(Model):
    def __init__(self, model: str):
        self.model = model
        self.key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
        self.name = f"gemini:{model}"

    def ask(self, image_png, question, fmt, task=None):
        parts = [{"text": user_prompt(question, fmt)}]
        if image_png is not None:
            parts.insert(0, {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(image_png).decode()}})
        body = {"system_instruction": {"parts": [{"text": SYSTEM}]}, "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"temperature": 0, "maxOutputTokens": MAX_OUT}}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        r = _post(url, body, {"x-goog-api-key": self.key})
        cand = (r.get("candidates") or [{}])[0]
        text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []) if not p.get("thought"))
        u = r.get("usageMetadata", {})
        return {"text": text, "tokens_in": u.get("promptTokenCount"), "tokens_out": u.get("candidatesTokenCount")}


class Anthropic(Model):
    def __init__(self, model: str):
        self.model = model
        self.key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.name = f"anthropic:{model}"

    def ask(self, image_png, question, fmt, task=None):
        content = [{"type": "text", "text": user_prompt(question, fmt)}]
        if image_png is not None:
            content.insert(0, {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                                           "data": base64.b64encode(image_png).decode()}})
        body = {"model": self.model, "max_tokens": MAX_OUT, "system": SYSTEM, "temperature": 0,
                "messages": [{"role": "user", "content": content}]}
        r = _post("https://api.anthropic.com/v1/messages", body,
                  {"x-api-key": self.key, "anthropic-version": "2023-06-01"})
        text = "".join(b.get("text", "") for b in r.get("content", []) if b.get("type") == "text")
        u = r.get("usage", {})
        return {"text": text, "tokens_in": u.get("input_tokens"), "tokens_out": u.get("output_tokens")}


class BlindPrior(Model):
    """Text-only attacker. Sees every question+answer in the dataset (an *upper bound* on what any
    language prior could achieve) and always answers the most frequent answer for that question text."""
    uses_image = False

    def __init__(self, tasks):
        self.name = "baseline:blind-prior"
        by_q = defaultdict(Counter)
        by_tpl = defaultdict(Counter)
        for t in tasks:
            by_q[t.question][str(t.answer["value"])] += 1
            by_tpl[(t.family, t.qtype)][str(t.answer["value"])] += 1
        self.by_q, self.by_tpl = by_q, by_tpl

    def ask(self, image_png, question, fmt, task=None):
        c = self.by_q.get(question) or self.by_tpl[(task.family, task.qtype)]
        return {"text": f"ANSWER: {c.most_common(1)[0][0]}"}


class Constant(Model):
    uses_image = False
    name = "baseline:constant"

    def ask(self, image_png, question, fmt, task=None):
        return {"text": "ANSWER: 3"}


class Blind(Model):
    """Wraps a real LLM but never sends the image: measures how far language priors alone get."""
    uses_image = False

    def __init__(self, inner: Model):
        self.inner = inner
        self.name = f"blind:{inner.name}"

    def ask(self, image_png, question, fmt, task=None):
        return self.inner.ask(None, question, fmt, task)


def make_model(spec: str, tasks=None) -> Model:
    if spec.startswith("blind:"):
        return Blind(make_model(spec[len("blind:"):], tasks))
    kind, _, rest = spec.partition(":")
    if kind == "openai":
        return OpenAICompat(rest)
    if kind == "ollama":
        m = OpenAICompat(rest, base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1"), key="")
        m.name = spec
        return m
    if kind == "openrouter":
        m = OpenAICompat(rest, base_url="https://openrouter.ai/api/v1", key=os.environ.get("OPENROUTER_API_KEY", ""))
        m.name = spec
        return m
    if kind == "groq":  # Groq (OpenAI-compatible)
        m = OpenAICompat(rest, base_url="https://api.groq.com/openai/v1",
                         key=os.environ.get("GROQ_API_KEY", ""))
        m.name = spec
        return m
    if kind == "gemini":
        return Gemini(rest)
    if kind == "google":  # Gemini / Gemma via Google's OpenAI-compatible endpoint (Bearer key)
        m = OpenAICompat(rest, base_url="https://generativelanguage.googleapis.com/v1beta/openai",
                         key=os.environ.get("GEMINI_API_KEY", ""))
        m.name = spec
        return m
    if kind == "anthropic":
        return Anthropic(rest)
    if spec == "baseline:blind-prior":
        return BlindPrior(tasks or [])
    if spec == "baseline:constant":
        return Constant()
    raise ValueError(f"unknown model spec {spec!r}")
