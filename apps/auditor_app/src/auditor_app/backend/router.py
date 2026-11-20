from __future__ import annotations

from functools import lru_cache

from databricks.sdk import WorkspaceClient
from fastapi import HTTPException, Request, Response

from . import documents, genie, models, pii, queries, workflow
from .core import Dependencies, create_router
from .core._config import logger
from .core._headers import DatabricksAppsHeaders

router = create_router()


@lru_cache(maxsize=1)
def _local_identity(host: str | None) -> str:
    """Identity used only when no forwarded-user headers exist (local dev)."""
    try:
        return WorkspaceClient().current_user.me().user_name or "local.auditor"
    except Exception:  # noqa: BLE001
        return "local.auditor"


def _auditor(headers: DatabricksAppsHeaders) -> str:
    """Signed-in auditor from the Databricks Apps proxy headers (server-side, not client-trusted)."""
    return headers.user_email or headers.user_name or _local_identity(None)


_image_cache: documents.ImageCache | None = None


def _cache(size: int) -> documents.ImageCache:
    global _image_cache
    if _image_cache is None:
        _image_cache = documents.ImageCache(size)
    return _image_cache


# ── Health / identity ─────────────────────────────────────────────────────────


@router.get("/version", response_model=models.VersionOut, operation_id="version")
async def version():
    return models.VersionOut.from_metadata()


@router.get("/health", response_model=models.HealthOut, operation_id="health")
def health(request: Request, db: Dependencies.Db, cfg: Dependencies.Config):
    detail = getattr(request.app.state, "db_error", None)
    try:
        db.one("SELECT 1 AS ok FROM {app}.auditor_decision LIMIT 1")
        db.one("SELECT 1 AS ok FROM {synced}.flagged_claim_queue LIMIT 1")
        status = "ok" if not detail else "degraded"
    except Exception as exc:  # noqa: BLE001
        status, detail = "degraded", f"{type(exc).__name__}: {exc}"
    return models.HealthOut(
        status=status, database=cfg.lakebase_database, app_schema=cfg.app_schema,
        synced_schema=cfg.synced_schema, detail=detail,
    )


@router.get("/current-user", response_model=models.CurrentUserOut, operation_id="currentUser")
def me(headers: Dependencies.Headers, ws: Dependencies.Client, cfg: Dependencies.Config):
    user_name = _auditor(headers)
    display = headers.user_name or user_name
    if "@" in display:
        display = display.split("@")[0].replace(".", " ").title()
    parts = [p for p in display.replace(".", " ").split() if p]
    initials = ((parts[0][0] + parts[-1][0]) if len(parts) >= 2 else (parts[0][:2] if parts else "AU")).upper()
    email = headers.user_email or (user_name if "@" in user_name else None)
    return models.CurrentUserOut(
        user_name=user_name, display_name=display, email=email, initials=initials,
        can_view_pii=pii.can_view_pii(headers, ws, cfg),
    )


# ── Queue ─────────────────────────────────────────────────────────────────────


@router.get("/queue", response_model=models.QueuePageOut, operation_id="listQueue")
def list_queue(
    db: Dependencies.Db,
    headers: Dependencies.Headers,
    ws: Dependencies.Client,
    cfg: Dependencies.Config,
    min_score: float = 0.70,
    region: str | None = None,
    claim_status: str | None = None,
    recommendation: str | None = None,
    review_outcome: str | None = None,
    status: str | None = None,
    search: str | None = None,
    sort_by: str = "score",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    show_pii = pii.can_view_pii(headers, ws, cfg)
    out = queries.list_queue(
        db,
        min_score=min_score, region=region, claim_status=claim_status, recommendation=recommendation,
        review_outcome=review_outcome, status=status, search=search, search_member=show_pii,
        sort_by=sort_by, sort_dir=sort_dir, page=max(page, 1), page_size=min(max(page_size, 1), 100),
    )
    if not show_pii:
        for item in out.items:
            item.member_full_name = pii.MASKED if item.member_full_name else None
    return out


@router.get("/queue/facets", response_model=models.QueueFacetsOut, operation_id="queueFacets")
def queue_facets(db: Dependencies.Db):
    return queries.queue_facets(db)


# ── Claim ─────────────────────────────────────────────────────────────────────


@router.get("/claims/{claim_id}", response_model=models.ClaimDetailOut, operation_id="getClaimDetail")
def get_claim_detail(
    claim_id: str, db: Dependencies.Db, headers: Dependencies.Headers, ws: Dependencies.Client, cfg: Dependencies.Config
):
    detail = queries.get_claim_detail(db, claim_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found.")
    if detail.member and not pii.can_view_pii(headers, ws, cfg):
        detail.member.member_full_name = pii.MASKED if detail.member.member_full_name else None
        detail.member.medicare_number = pii.MASKED if detail.member.medicare_number else None
        detail.member.member_dob = None
    return detail


@router.get("/claims/{claim_id}/triage", response_model=models.TriageOut | None, operation_id="getTriage")
def get_triage(claim_id: str, db: Dependencies.Db):
    """AI triage verdict; null when the claim was not ML-flagged (documents-only review)."""
    return queries.get_triage(db, claim_id)


@router.get("/claims/{claim_id}/review", response_model=models.ClaimReviewOut, operation_id="getClaimReview")
def get_claim_review(claim_id: str, db: Dependencies.Db, cfg: Dependencies.Config):
    """AI document review: roll-up, scanned documents and per-finding evidence."""
    return queries.get_review(db, claim_id, scan_w=cfg.scan_width_px, scan_h=cfg.scan_height_px)


@router.get("/claims/{claim_id}/workflow", response_model=models.ClaimWorkflowOut, operation_id="getClaimWorkflow")
def get_claim_workflow(claim_id: str, db: Dependencies.Db):
    """Auditor decisions, document requests and status for the claim (Lakebase app tables)."""
    return workflow.get_workflow(db, claim_id)


@router.put(
    "/claims/{claim_id}/findings/{finding_id}/decision",
    response_model=models.DecisionOut,
    operation_id="recordFindingDecision",
)
def record_finding_decision(
    claim_id: str, finding_id: str, payload: models.DecisionIn, db: Dependencies.Db, headers: Dependencies.Headers
):
    out = workflow.record_finding_decision(
        db, claim_id=claim_id, finding_id=finding_id, payload=payload, decided_by=_auditor(headers)
    )
    logger.info("Decision recorded: claim=%s finding=%s decision=%s", claim_id, finding_id, out.decision)
    return out


@router.delete(
    "/claims/{claim_id}/findings/{finding_id}/decision",
    response_model=models.ClaimWorkflowOut,
    operation_id="clearFindingDecision",
)
def clear_finding_decision(claim_id: str, finding_id: str, db: Dependencies.Db):
    workflow.clear_finding_decision(db, claim_id=claim_id, finding_id=finding_id)
    return workflow.get_workflow(db, claim_id)


@router.post("/claims/{claim_id}/feedback", response_model=models.FeedbackOut, operation_id="submitFeedback")
def submit_feedback(claim_id: str, payload: models.FeedbackIn, db: Dependencies.Db, headers: Dependencies.Headers):
    return workflow.submit_feedback(db, claim_id=claim_id, payload=payload, auditor_id=_auditor(headers))


# ── Documents ─────────────────────────────────────────────────────────────────


@router.get("/documents/{document_id}/image", include_in_schema=False)
def document_image(
    document_id: str, db: Dependencies.Db, ws: Dependencies.Client, cfg: Dependencies.Config, width: int = 1600
):
    """Rendered scan from the UC volume (app service principal, Files API), downscaled."""
    path = queries.get_document_volume_path(db, document_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found.")
    try:
        data = documents.document_image(
            ws, _cache(cfg.image_cache_entries), document_id=document_id, volume_path=path, width=width
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not read %s from the volume: %s", path, exc)
        raise HTTPException(status_code=502, detail=f"Could not read the scan from the volume: {exc}") from exc
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.get(
    "/documents/{document_id}/elements",
    response_model=list[models.DocumentElementOut],
    operation_id="listDocumentElements",
)
def list_document_elements(document_id: str, db: Dependencies.Db):
    """Parsed layout elements (ai_parse_document) with bounding boxes, for the overlay."""
    return queries.list_document_elements(db, document_id)


# ── Document request (FMAPI draft) ────────────────────────────────────────────


@router.post(
    "/claims/{claim_id}/request-document/draft",
    response_model=models.DraftDocRequestOut,
    operation_id="draftDocumentRequest",
)
def draft_document_request(
    claim_id: str, payload: models.DraftDocRequestIn, ws: Dependencies.Client, cfg: Dependencies.Config
):
    """Draft a document-request email (Foundation Model API via the app service principal)."""
    return documents.draft_email(ws, cfg, payload)


@router.post(
    "/claims/{claim_id}/request-document/send",
    response_model=models.SendDocRequestOut,
    operation_id="sendDocumentRequest",
)
def send_document_request(
    claim_id: str, payload: models.SendDocRequestIn, db: Dependencies.Db, headers: Dependencies.Headers
):
    """Record the reviewed request in Lakebase (auditor.document_request); status awaiting_document."""
    return workflow.record_document_request(db, claim_id=claim_id, payload=payload, requested_by=_auditor(headers))


# ── Genie (Ask the data) ──────────────────────────────────────────────────────


@router.get("/genie/status", response_model=models.GenieStatusOut, operation_id="genieStatus")
def genie_status(cfg: Dependencies.Config):
    return models.GenieStatusOut(configured=bool(cfg.genie_space_id), space_id=cfg.genie_space_id or None)


@router.post("/genie/ask", response_model=models.GenieAnswerOut, operation_id="askGenie")
def ask_genie(
    payload: models.GenieAskIn, headers: Dependencies.Headers, cfg: Dependencies.Config, ws: Dependencies.Client
):
    """Ask Genie as the signed-in user (OBO) when a user token is forwarded; otherwise as
    the app identity (local dev)."""
    client = WorkspaceClient(token=headers.token.get_secret_value(), auth_type="pat") if headers.token else ws
    try:
        return genie.ask(client, cfg, question=payload.question, conversation_id=payload.conversation_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("Genie ask failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Genie request failed: {exc}") from exc
