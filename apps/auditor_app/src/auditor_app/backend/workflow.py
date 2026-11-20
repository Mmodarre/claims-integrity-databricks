"""Auditor writes to the app-owned Lakebase schema ({app}) and their read-back.

The auditor identity (decided_by / requested_by / auditor_id) is taken server-side from
the Databricks Apps forwarded identity headers, never from the request body.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from psycopg.rows import dict_row

from . import models, queries
from .core.lakebase import Db

_UPSERT_DECISION = """
INSERT INTO {app}.auditor_decision
  (decision_id, claim_id, finding_id, decision, confirmed_recovery_aud, decided_by, decided_at, note)
VALUES
  (%(decision_id)s, %(claim_id)s, %(finding_id)s, %(decision)s, %(confirmed_recovery_aud)s, %(decided_by)s, now(), %(note)s)
ON CONFLICT ON CONSTRAINT auditor_decision_claim_finding_uq DO UPDATE SET
  decision = EXCLUDED.decision,
  confirmed_recovery_aud = EXCLUDED.confirmed_recovery_aud,
  decided_by = EXCLUDED.decided_by,
  decided_at = EXCLUDED.decided_at,
  note = EXCLUDED.note
RETURNING decision_id, claim_id, finding_id, decision, confirmed_recovery_aud, decided_by, decided_at, note
"""


def _ensure_claim(db: Db, claim_id: str) -> None:
    if not db.one("SELECT 1 AS ok FROM {synced}.claim_detail WHERE claim_id = %(c)s", {"c": claim_id}):
        raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found.")


def record_finding_decision(
    db: Db, *, claim_id: str, finding_id: str, payload: models.DecisionIn, decided_by: str
) -> models.DecisionOut:
    finding = db.one(
        "SELECT finding_id, recovery_aud FROM {synced}.claim_finding WHERE finding_id = %(f)s AND claim_id = %(c)s",
        {"f": finding_id, "c": claim_id},
    )
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding {finding_id} does not belong to claim {claim_id}.")
    recovery = None
    if payload.decision == "confirmed":
        recovery = payload.confirmed_recovery_aud
        if recovery is None and finding.get("recovery_aud") is not None:
            recovery = float(finding["recovery_aud"])
    row = db.one(
        _UPSERT_DECISION,
        {
            "decision_id": str(uuid4()),
            "claim_id": claim_id,
            "finding_id": finding_id,
            "decision": payload.decision,
            "confirmed_recovery_aud": recovery,
            "decided_by": decided_by,
            "note": (payload.note or "").strip() or None,
        },
    )
    assert row is not None
    return models.DecisionOut.model_validate(row)


def clear_finding_decision(db: Db, *, claim_id: str, finding_id: str) -> None:
    db.all(
        "DELETE FROM {app}.auditor_decision WHERE claim_id = %(c)s AND finding_id = %(f)s RETURNING decision_id",
        {"c": claim_id, "f": finding_id},
    )


def submit_feedback(db: Db, *, claim_id: str, payload: models.FeedbackIn, auditor_id: str) -> models.FeedbackOut:
    """Feedback row + claim-level decision, in one transaction."""
    _ensure_claim(db, claim_id)
    note = (payload.note or "").strip() or None
    with db.connection() as conn, conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            db.sql(
                """
                INSERT INTO {app}.auditor_feedback (feedback_id, claim_id, reasoning_rating, decision, note, auditor_id, persona)
                VALUES (%(id)s, %(c)s, %(rating)s, %(decision)s, %(note)s, %(who)s, 'auditor')
                RETURNING feedback_id, claim_id, reasoning_rating, decision, note, auditor_id, persona, created_at
                """
            ),
            {"id": str(uuid4()), "c": claim_id, "rating": payload.reasoning_rating,
             "decision": payload.decision, "note": note, "who": auditor_id},
        )
        fb = cur.fetchone()
        cur.execute(
            db.sql(_UPSERT_DECISION),
            {"decision_id": str(uuid4()), "claim_id": claim_id, "finding_id": None, "decision": payload.decision,
             "confirmed_recovery_aud": None, "decided_by": auditor_id, "note": note},
        )
        dec = cur.fetchone()
    assert fb is not None and dec is not None
    return models.FeedbackOut(**fb, claim_decision=models.DecisionOut.model_validate(dec))


def record_document_request(
    db: Db, *, claim_id: str, payload: models.SendDocRequestIn, requested_by: str
) -> models.SendDocRequestOut:
    _ensure_claim(db, claim_id)
    row = db.one(
        """
        INSERT INTO {app}.document_request
          (request_id, claim_id, doc_type, recipient, subject, body, status, drafted_by_ai, draft_model, requested_by)
        VALUES (%(id)s, %(c)s, %(doc_type)s, %(to)s, %(subject)s, %(body)s, 'awaiting_document',
                %(ai)s, %(model)s, %(who)s)
        RETURNING request_id, claim_id, doc_type, recipient, status, requested_at
        """,
        {"id": f"DOCREQ-{uuid4().hex[:10].upper()}", "c": claim_id, "doc_type": payload.doc_type,
         "to": payload.to, "subject": payload.subject, "body": payload.body, "ai": payload.drafted_by_ai,
         "model": payload.draft_model, "who": requested_by},
    )
    assert row is not None
    doc = payload.doc_type.replace("_", " ")
    return models.SendDocRequestOut(
        request_id=row["request_id"], claim_id=claim_id, doc_type=row["doc_type"], to=row["recipient"],
        status=row["status"], recorded_at=row["requested_at"],
        message=f"Request for {doc} recorded for {row['recipient']}. Awaiting document.",
    )


def get_workflow(db: Db, claim_id: str) -> models.ClaimWorkflowOut:
    decisions = db.all(
        """
        SELECT decision_id, claim_id, finding_id, decision, confirmed_recovery_aud, decided_by, decided_at, note
        FROM {app}.auditor_decision WHERE claim_id = %(c)s ORDER BY decided_at DESC
        """,
        {"c": claim_id},
    )
    requests = db.all(
        """
        SELECT request_id, claim_id, doc_type, recipient, subject, status, drafted_by_ai, draft_model,
               requested_by, requested_at
        FROM {app}.document_request WHERE claim_id = %(c)s ORDER BY requested_at DESC
        """,
        {"c": claim_id},
    )
    fb = db.one("SELECT count(*) AS n FROM {app}.auditor_feedback WHERE claim_id = %(c)s", {"c": claim_id})
    st = queries.claim_status_row(db, claim_id)
    claim_dec = next((d for d in decisions if d["finding_id"] is None), None)
    return models.ClaimWorkflowOut(
        claim_id=claim_id,
        review_status=st["review_status"],
        actionable_findings=st["actionable_findings"],
        actionable_decided=st["actionable_decided"],
        confirmed_recovery_aud=st["confirmed_recovery_aud"],
        claim_decision=models.DecisionOut.model_validate(claim_dec) if claim_dec else None,
        finding_decisions=[models.DecisionOut.model_validate(d) for d in decisions if d["finding_id"] is not None],
        document_requests=[models.DocumentRequestOut.model_validate(r) for r in requests],
        feedback_count=int(fb["n"]) if fb else 0,
    )
