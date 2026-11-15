"""Document ingestion: text, PDF (text layer) and images or scanned PDFs (vision OCR).

The file type is decided from the file's own bytes, never from the name or the
type the browser claims, so a renamed executable cannot slip through.
"""
from __future__ import annotations

import io

from .llm import LLMError, gateway
from .security import MAX_UPLOAD, sniff

MAX_PDF_PAGES = 30


def to_text(data: bytes, filename: str, content_type: str | None) -> tuple[str, str]:
    """Returns (text, method)."""
    if not data:
        raise ValueError("The file is empty.")
    if len(data) > MAX_UPLOAD:
        raise ValueError("File too large (max 8 MB).")
    kind = sniff(data)
    if kind is None:
        raise ValueError("Unsupported file. Please upload a PDF, PNG, JPG, WEBP or plain text file.")
    if kind == "application/pdf":
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise ValueError("This PDF is password protected. Please upload an unlocked copy.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise ValueError(f"PDF has too many pages (max {MAX_PDF_PAGES}).")
            text = "\n".join((p.extract_text() or "") for p in reader.pages).strip()
        except ValueError:
            raise
        except Exception:
            raise ValueError("Could not read this PDF. It may be damaged.")
        if len(text) >= 40:
            return text, "pdf-text"
        return gateway().transcribe_document(data, "application/pdf"), "pdf-vision"
    if kind.startswith("image/"):
        return gateway().transcribe_document(data, kind), "image-vision"
    for enc in ("utf-8", "utf-16"):
        try:
            return data.decode(enc), "text"
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1"), "text"


__all__ = ["to_text", "LLMError"]
