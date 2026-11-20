"""Scanned documents and document-request drafting.

1. Scan images: the rendered JPGs live in the landing UC volume (bundle variable
   scans_volume) under rendered_docs/<claim_number>/*.jpg (~9 MB, 3584x4800); each scan's
   exact path is gold.document_ai_fact.volume_path. They are read with the Files API as the
   app service principal (READ VOLUME via the app's `scans-volume` resource), downscaled
   for the browser and cached in memory. Only paths registered in document_ai_fact can be
   served (looked up by document_id), so the endpoint cannot read arbitrary volume files.
2. Document-request email: the body is drafted by a Foundation Model API endpoint (app
   service principal), with a templated fallback if the endpoint is unavailable.
"""

from __future__ import annotations

import io
import logging
import re
import threading
from collections import OrderedDict

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
from PIL import Image

from . import models
from .core._config import AppConfig, logger

ALLOWED_WIDTHS = (800, 1600, 2400)  # 0 = original bytes

# The SDK's optional file-endpoint discovery returns 403 for app service principals and
# falls back to the default endpoint; keep that expected fallback out of the app logs.
logging.getLogger("databricks.sdk.mixins.files").setLevel(logging.ERROR)


class ImageCache:
    """Small thread-safe LRU of encoded image bytes keyed by (document_id, width)."""

    def __init__(self, max_entries: int) -> None:
        self._max = max_entries
        self._data: OrderedDict[tuple[str, int], bytes] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple[str, int]) -> bytes | None:
        with self._lock:
            val = self._data.get(key)
            if val is not None:
                self._data.move_to_end(key)
            return val

    def put(self, key: tuple[str, int], val: bytes) -> None:
        with self._lock:
            self._data[key] = val
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)


def _download(ws: WorkspaceClient, volume_path: str) -> bytes:
    resp = ws.files.download(volume_path)
    if resp.contents is None:
        raise FileNotFoundError(volume_path)
    with resp.contents as stream:
        return stream.read()


def _resize(raw: bytes, width: int) -> bytes:
    img = Image.open(io.BytesIO(raw))
    if img.width <= width:
        return raw
    height = round(img.height * width / img.width)
    img.draft("RGB", (width, height))  # fast JPEG DCT downscale before the precise resize
    img = img.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=84, optimize=True, progressive=True)
    return out.getvalue()


def document_image(ws: WorkspaceClient, cache: ImageCache, *, document_id: str, volume_path: str, width: int) -> bytes:
    width = width if width in ALLOWED_WIDTHS else 0
    key = (document_id, width)
    hit = cache.get(key)
    if hit is not None:
        return hit
    raw = cache.get((document_id, 0)) if width else None
    if raw is None:
        raw = _download(ws, volume_path)
        if not width:
            cache.put((document_id, 0), raw)
    data = _resize(raw, width) if width else raw
    cache.put(key, data)
    return data


# ── Document-request email drafting ───────────────────────────────────────────


def _humanize_doc(doc_type: str) -> str:
    return doc_type.replace("_", " ").strip() or "clinical document"


def _recipient(hospital_name: str | None) -> str:
    slug = re.sub(r"[^a-z0-9]+", "", (hospital_name or "provider").lower()) or "provider"
    return f"medical.records@{slug}.health.org.au"


def _subject(claim_number: str | None, doc_type: str) -> str:
    return f"Document request — {claim_number or 'claim'} ({_humanize_doc(doc_type)})"


def _template_body(payload: models.DraftDocRequestIn) -> str:
    doc = _humanize_doc(payload.doc_type)
    member = payload.member_full_name or "the insured member"
    claim = payload.claim_number or "the claim under review"
    admit = f" (admission {payload.admission_date})" if payload.admission_date else ""
    reason = payload.reason or "a documentation check as part of routine claims integrity review"
    return (
        "Dear Medical Records Team,\n\n"
        f"As part of a claims integrity review, we are requesting a copy of the {doc} for the "
        f"following hospital episode:\n\n"
        f"  • Claim: {claim}\n"
        f"  • Member: {member}{admit}\n"
        f"  • Hospital: {payload.hospital_name or 'your facility'}\n\n"
        f"The document is needed to verify the clinical details supporting the claim. Context for the "
        f"request: {reason}.\n\n"
        "Please return the requested document securely within 14 days. If the episode spans multiple "
        "encounters, kindly include all relevant pages. Thank you for your assistance.\n\n"
        "Kind regards,\n"
        "Claims Integrity Team"
    )


def _content_text(content: object) -> str:
    """Chat content is either a string or (for reasoning models) a list of typed blocks;
    keep only the `text` blocks, dropping reasoning summaries."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return ""


def _ai_body(ws: WorkspaceClient, cfg: AppConfig, payload: models.DraftDocRequestIn) -> str:
    system = (
        "You are an assistant to an Australian private health insurer's claims integrity team. "
        "Draft a concise, courteous, professional email to a hospital's medical records department "
        "requesting a specific clinical document needed to verify a flagged claim. Reference the claim "
        "and member, name the document requested, give a brief non-accusatory reason, and request secure "
        "return within 14 days. Sign off as 'Claims Integrity Team'. Never use placeholders or square "
        "brackets (e.g. [Insurer Name]); refer to the sender only as 'our Claims Integrity Team'. "
        "Output ONLY the email body text — no subject line, no commentary."
    )
    ctx = (
        f"Document requested: {_humanize_doc(payload.doc_type)}\n"
        f"Claim number: {payload.claim_number or 'N/A'}\n"
        f"Member: {payload.member_full_name or 'N/A'}\n"
        f"Hospital: {payload.hospital_name or 'N/A'}\n"
        f"Admission date: {payload.admission_date or 'N/A'}\n"
        f"Discrepancy type: {payload.discrepancy_type or 'N/A'}\n"
        f"Triage reasoning: {payload.reason or 'N/A'}"
    )
    resp = ws.serving_endpoints.query(
        name=cfg.draft_model,
        messages=[
            ChatMessage(role=ChatMessageRole.SYSTEM, content=system),
            ChatMessage(role=ChatMessageRole.USER, content=ctx),
        ],
        max_tokens=700,
    )
    content = resp.choices[0].message.content if resp.choices and resp.choices[0].message else None
    text = _content_text(content).strip()
    if not text:
        raise ValueError("empty completion from serving endpoint")
    return text


def draft_email(ws: WorkspaceClient, cfg: AppConfig, payload: models.DraftDocRequestIn) -> models.DraftDocRequestOut:
    to = _recipient(payload.hospital_name)
    subject = _subject(payload.claim_number, payload.doc_type)
    try:
        body = _ai_body(ws, cfg, payload)
        return models.DraftDocRequestOut(to=to, subject=subject, body=body, model=cfg.draft_model, drafted_by_ai=True)
    except Exception as exc:  # noqa: BLE001 — never break the flow on a serving hiccup
        logger.warning("FMAPI draft via %s failed (%s); using templated fallback.", cfg.draft_model, exc)
    return models.DraftDocRequestOut(
        to=to, subject=subject, body=_template_body(payload), model="templated-fallback", drafted_by_ai=False
    )
