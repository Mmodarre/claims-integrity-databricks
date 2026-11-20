"""Genie ("Ask the data") layer for the Claim Integrity Auditor.

The Genie conversation runs on behalf of the signed-in auditor when the app forwards a user
token (user authorization scope `dashboards.genie`), so the SQL Genie generates runs with
that user's UC grants. The space id comes from AUDITOR_APP_GENIE_SPACE_ID; when it is unset
the panel reports "not configured" instead of failing. Tokens are never logged.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from databricks.sdk import WorkspaceClient
from fastapi import HTTPException

from . import models
from .core._config import AppConfig, logger

# Genie messages normally complete in seconds; cap the server-side wait well under the
# SDK default (20 min) so a stuck message surfaces as an error instead of hanging the route.
_WAIT = timedelta(seconds=300)
_MAX_ROWS = 500


def ask(
    ws: WorkspaceClient,
    cfg: AppConfig,
    *,
    question: str,
    conversation_id: str | None,
) -> models.GenieAnswerOut:
    if not cfg.genie_space_id:
        raise HTTPException(
            status_code=503,
            detail="Ask the data is not configured yet (AUDITOR_APP_GENIE_SPACE_ID is unset).",
        )

    space_id = cfg.genie_space_id
    if conversation_id:
        msg = ws.genie.create_message_and_wait(space_id, conversation_id, question, timeout=_WAIT)
    else:
        msg = ws.genie.start_conversation_and_wait(space_id, question, timeout=_WAIT)

    conv_id = msg.conversation_id or (conversation_id or "")
    msg_id = msg.message_id or msg.id or ""

    texts: list[str] = []
    suggested: list[str] = []
    sql_text: str | None = None
    description: str | None = None
    result: models.GenieResultTable | None = None

    for att in msg.attachments or []:
        text = getattr(att, "text", None)
        content = getattr(text, "content", None) if text is not None else None
        if content:
            texts.append(content)

        sq = getattr(att, "suggested_questions", None)
        if sq is not None:
            suggested.extend(_extract_suggested(sq))

        query = getattr(att, "query", None)
        if query is not None:
            sql_text = getattr(query, "query", None) or sql_text
            description = getattr(query, "description", None) or description
            att_id = getattr(att, "attachment_id", None)
            if att_id and result is None:
                result = _fetch_result(ws, space_id, conv_id, msg_id, att_id)

    error = None
    msg_error = getattr(msg, "error", None)
    if msg_error is not None:
        error = getattr(msg_error, "error", None) or str(msg_error)

    return models.GenieAnswerOut(
        conversation_id=conv_id,
        message_id=msg_id,
        question=question,
        answer_text="\n\n".join(texts) if texts else None,
        sql=sql_text,
        query_description=description,
        result=result,
        suggested_questions=suggested,
        status=_status_str(getattr(msg, "status", None)),
        error=error,
    )


def _fetch_result(
    ws: WorkspaceClient, space_id: str, conv_id: str, msg_id: str, att_id: str
) -> models.GenieResultTable | None:
    """Fetch the rows behind a query attachment. Best-effort: a failure here (e.g. the
    statement was not retained) degrades to no table, not a failed answer."""
    try:
        resp = ws.genie.get_message_attachment_query_result(space_id, conv_id, msg_id, att_id)
    except Exception as exc:  # noqa: BLE001 — result table is optional context
        logger.warning("Genie query-result fetch failed: %s", exc)
        return None

    sr = getattr(resp, "statement_response", None)
    if sr is None:
        return None
    manifest = getattr(sr, "manifest", None)
    schema = getattr(manifest, "schema", None) if manifest is not None else None
    columns = [c.name for c in (getattr(schema, "columns", None) or [])] if schema is not None else []
    res = getattr(sr, "result", None)
    data: list[Any] = (getattr(res, "data_array", None) or []) if res is not None else []
    truncated = len(data) > _MAX_ROWS
    return models.GenieResultTable(
        columns=columns,
        rows=data[:_MAX_ROWS],
        row_count=len(data),
        truncated=truncated,
    )


def _extract_suggested(sq: Any) -> list[str]:
    """Pull plain-text follow-up questions from a suggested-questions attachment without
    hard-coding the nested SDK shape."""
    out: list[str] = []
    items = getattr(sq, "suggested_questions", None) or getattr(sq, "questions", None) or []
    for it in items:
        q = getattr(it, "question", None) or (it if isinstance(it, str) else None)
        if q:
            out.append(q)
    return out


def _status_str(status: Any) -> str:
    if status is None:
        return "UNKNOWN"
    return getattr(status, "value", None) or str(status)
