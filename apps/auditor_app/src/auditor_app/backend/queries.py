"""Read queries over Lakebase: synced gold tables ({synced}) joined with the app-owned
workflow tables ({app}). All values are bound parameters; sort columns come from an
allow-list. No SQL warehouse is involved.
"""

from __future__ import annotations

from typing import Any

from . import models
from .core.lakebase import Db

# Claims in the integrity process: ML-flagged OR documents reviewed. Same population as
# gold.integrity_case_fact so app counts line up with the metric views.
_POPULATION = """
pop AS (
  SELECT claim_id FROM {synced}.flagged_claim_queue
  UNION
  SELECT claim_id FROM {synced}.claim_document_review
)"""

_SINGLE = "pop AS (SELECT %(claim_id)s::text AS claim_id)"

# Workflow status per claim, derived from the auditor's decisions and document requests.
# "Actionable" findings are the ones the AI did not mark supported.
_STATUS = """
fc AS (
  SELECT claim_id, count(*) FILTER (WHERE outcome IN ('discrepancy', 'needs_information')) AS actionable
  FROM {synced}.claim_finding
  WHERE claim_id IN (SELECT claim_id FROM pop)
  GROUP BY claim_id
),
dec AS (
  SELECT d.claim_id,
         count(*) AS decisions,
         count(*) FILTER (WHERE d.finding_id IS NOT NULL AND f.outcome IN ('discrepancy', 'needs_information'))
           AS actionable_decided,
         bool_or(d.decision = 'escalated') AS any_escalated,
         bool_or(d.decision = 'needs_information') AS any_needs_info,
         max(d.decision) FILTER (WHERE d.finding_id IS NULL) AS claim_decision,
         sum(d.confirmed_recovery_aud) AS confirmed_recovery_aud
  FROM {app}.auditor_decision d
  LEFT JOIN {synced}.claim_finding f ON f.finding_id = d.finding_id
  WHERE d.claim_id IN (SELECT claim_id FROM pop)
  GROUP BY d.claim_id
),
req AS (
  SELECT claim_id, count(*) FILTER (WHERE status = 'awaiting_document') AS open_requests
  FROM {app}.document_request
  WHERE claim_id IN (SELECT claim_id FROM pop)
  GROUP BY claim_id
),
st AS (
  SELECT p.claim_id,
         coalesce(fc.actionable, 0) AS actionable_findings,
         coalesce(dec.actionable_decided, 0) AS actionable_decided,
         dec.confirmed_recovery_aud,
         CASE
           WHEN dec.any_escalated THEN 'escalated'
           WHEN dec.claim_decision IN ('confirmed', 'rejected') THEN 'closed'
           WHEN coalesce(fc.actionable, 0) > 0 AND dec.actionable_decided >= fc.actionable
                AND NOT dec.any_needs_info THEN 'closed'
           WHEN dec.any_needs_info OR coalesce(req.open_requests, 0) > 0 THEN 'awaiting_information'
           WHEN coalesce(dec.decisions, 0) > 0 THEN 'in_review'
           ELSE 'open'
         END AS review_status
  FROM pop p
  LEFT JOIN fc USING (claim_id)
  LEFT JOIN dec USING (claim_id)
  LEFT JOIN req USING (claim_id)
)"""

_QUEUE_SORT = {
    "score": "q.ml_fraud_score",
    "est_impact": "t.est_impact_aud",
    "recovery": "r.identified_recovery_aud",
    "total": "d.total_claim_amount_aud",
    "admission_date": "d.admission_date",
    "claim_number": "d.claim_number",
    "member": "d.member_full_name",
    "region": "d.region",
    "recommendation": "t.recommendation",
    "status": "st.review_status",
}
_DIRS = {"asc": "ASC", "desc": "DESC"}
# Every flagged claim scores >= 0.70; at the slider floor the score filter is off so
# claims that entered review only via documents (no score) stay visible.
_SCORE_FLOOR = 0.70


def list_queue(
    db: Db,
    *,
    min_score: float,
    region: str | None,
    claim_status: str | None,
    recommendation: str | None,
    review_outcome: str | None,
    status: str | None,
    search: str | None,
    search_member: bool,
    sort_by: str,
    sort_dir: str,
    page: int,
    page_size: int,
) -> models.QueuePageOut:
    where: list[str] = []
    params: dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}
    if min_score > _SCORE_FLOOR:
        where.append("q.ml_fraud_score >= %(min_score)s")
        params["min_score"] = min_score
    if region:
        where.append("d.region = %(region)s")
        params["region"] = region
    if claim_status:
        where.append("d.claim_status = %(claim_status)s")
        params["claim_status"] = claim_status
    if recommendation:
        where.append("t.recommendation = %(recommendation)s")
        params["recommendation"] = recommendation
    if review_outcome == "no_documents":
        where.append("r.claim_id IS NULL")
    elif review_outcome:
        where.append("r.review_outcome = %(review_outcome)s")
        params["review_outcome"] = review_outcome
    if status:
        where.append("st.review_status = %(status)s")
        params["status"] = status
    if search:
        # Member-name search only for users allowed to see member PII.
        where.append("(d.claim_number ILIKE %(search)s OR d.member_full_name ILIKE %(search)s)"
                     if search_member else "d.claim_number ILIKE %(search)s")
        params["search"] = f"%{search.strip()}%"

    order_col = _QUEUE_SORT.get(sort_by, _QUEUE_SORT["score"])
    direction = _DIRS.get((sort_dir or "desc").lower(), "DESC")

    rows = db.all(
        f"""
        WITH {_POPULATION}, {_STATUS}
        SELECT d.claim_id, d.claim_number, d.member_full_name, d.region, d.hospital_name, d.claim_status,
               d.admission_date, d.total_claim_amount_aud,
               (q.claim_id IS NOT NULL) AS is_flagged, q.ml_fraud_score, q.ml_flag_reason,
               t.is_integrity_issue, t.discrepancy_type, t.recommendation, t.confidence, t.est_impact_aud,
               r.review_outcome, r.identified_recovery_aud, coalesce(r.documents_received, 0) AS documents_received,
               st.review_status, st.confirmed_recovery_aud, st.actionable_findings, st.actionable_decided,
               count(*) OVER () AS total_count
        FROM st
        JOIN {{synced}}.claim_detail d ON d.claim_id = st.claim_id
        LEFT JOIN {{synced}}.flagged_claim_queue q ON q.claim_id = st.claim_id
        LEFT JOIN {{synced}}.claim_triage t ON t.claim_id = st.claim_id
        LEFT JOIN {{synced}}.claim_document_review r ON r.claim_id = st.claim_id
        {"WHERE " + " AND ".join(where) if where else ""}
        ORDER BY {order_col} {direction} NULLS LAST, r.identified_recovery_aud DESC NULLS LAST, d.claim_number
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    )
    total = int(rows[0]["total_count"]) if rows else 0
    items = [models.QueueRowOut.model_validate({k: v for k, v in r.items() if k != "total_count"}) for r in rows]
    return models.QueuePageOut(items=items, total=total, page=page, page_size=page_size)


def queue_facets(db: Db) -> models.QueueFacetsOut:
    def distinct(sql: str) -> list[str]:
        return [str(r["v"]) for r in db.all(sql) if r["v"] is not None]

    base = "WITH " + _POPULATION + " SELECT DISTINCT d.<col> AS v FROM pop JOIN {synced}.claim_detail d USING (claim_id) ORDER BY 1"
    regions = distinct(base.replace("<col>", "region"))
    claim_statuses = distinct(base.replace("<col>", "claim_status"))
    recommendations = distinct("SELECT DISTINCT recommendation AS v FROM {synced}.claim_triage ORDER BY 1")
    outcomes = distinct("SELECT DISTINCT review_outcome AS v FROM {synced}.claim_document_review ORDER BY 1")
    return models.QueueFacetsOut(
        regions=regions,
        claim_statuses=claim_statuses,
        recommendations=recommendations,
        review_outcomes=[*outcomes, "no_documents"],
        statuses=list(models.REVIEW_STATUSES),
    )


# ── Triage ────────────────────────────────────────────────────────────────────


def get_triage(db: Db, claim_id: str) -> models.TriageOut | None:
    row = db.one(
        """
        SELECT claim_id, claim_number, ml_fraud_score, ml_flag_reason, is_integrity_issue, discrepancy_type,
               confidence, est_impact_aud, doc_to_request, recommendation, key_signals, reasoning,
               NULLIF(triage_error, '') AS triage_error, triage_model, triaged_at
        FROM {synced}.claim_triage WHERE claim_id = %(claim_id)s
        """,
        {"claim_id": claim_id},
    )
    if not row:
        return None
    row["key_signals"] = row.get("key_signals") or []
    return models.TriageOut.model_validate(row)


# ── Claim detail ──────────────────────────────────────────────────────────────


def get_claim_detail(db: Db, claim_id: str) -> models.ClaimDetailOut | None:
    d = db.one("SELECT * FROM {synced}.claim_detail WHERE claim_id = %(claim_id)s", {"claim_id": claim_id})
    if not d:
        return None

    hospital = None
    if d.get("hospital_id") is not None:
        h = db.one(
            """
            SELECT hospital_claims, flagged_claims, flag_rate, flag_rate_peer_z, claims_with_discrepancy,
                   identified_recovery_aud, discrepancy_mix, needs_attention, risk_narrative, narrative_model
            FROM {synced}.hospital_risk_profile WHERE hospital_id = %(id)s
            """,
            {"id": d["hospital_id"]},
        ) or {}
        hospital = models.HospitalOut(
            hospital_id=d["hospital_id"], hospital_code=d.get("hospital_code"), hospital_name=d.get("hospital_name"),
            region=d.get("region"), is_contracted=d.get("hospital_is_contracted"), **h,
        )

    surgeon = None
    if d.get("surgeon_provider_id") is not None:
        p = db.one(
            """
            SELECT provider_category, episodes, flagged_episodes, flag_rate, flag_rate_peer_z,
                   claims_with_discrepancy, identified_recovery_aud, discrepancy_types
            FROM {synced}.provider_risk_profile WHERE provider_id = %(id)s
            """,
            {"id": d["surgeon_provider_id"]},
        ) or {}
        p["discrepancy_types"] = p.get("discrepancy_types") or []
        surgeon = models.SurgeonOut(provider_id=d["surgeon_provider_id"], surgeon_name=d.get("surgeon_name"), **p)

    lines = db.all(
        """
        SELECT claim_line_id, line_number, line_category, item_code, item_description, service_date, quantity,
               charge_amount AS charge_amount_aud, schedule_fee AS schedule_fee_aud,
               benefit_amount AS benefit_amount_aud, medicare_benefit AS medicare_benefit_aud,
               gap_amount AS gap_amount_aud, line_status, provider_name, provider_category, is_assistant_item
        FROM {synced}.claim_line_detail WHERE claim_id = %(claim_id)s
        ORDER BY line_number
        """,
        {"claim_id": claim_id},
    )
    coding: list[dict[str, Any]] = []
    if d.get("admission_id"):
        coding = db.all(
            """
            SELECT coding_id, coding_type, sequence_no, code, description, is_principal, ccl
            FROM {synced}.admission_coding WHERE admission_id = %(admission_id)s
            ORDER BY coding_type, is_principal DESC NULLS LAST, sequence_no
            """,
            {"admission_id": d["admission_id"]},
        )

    return models.ClaimDetailOut(
        claim=models.ClaimHeaderOut.model_validate(d),
        member=models.MemberOut.model_validate(d),
        admission=models.AdmissionOut.model_validate(d) if d.get("admission_id") else None,
        hospital=hospital,
        surgeon=surgeon,
        lines=[models.ClaimLineOut.model_validate(r) for r in lines],
        diagnoses=[models.CodingOut.model_validate(r) for r in coding if r["coding_type"] == "diagnosis"],
        procedures=[models.CodingOut.model_validate(r) for r in coding if r["coding_type"] == "procedure"],
    )


# ── Document review ───────────────────────────────────────────────────────────

_OUTCOME_ORDER = "CASE outcome WHEN 'discrepancy' THEN 0 WHEN 'needs_information' THEN 1 ELSE 2 END"


def get_review(db: Db, claim_id: str, *, scan_w: int, scan_h: int) -> models.ClaimReviewOut:
    summary = db.one(
        """
        SELECT review_outcome, documents_received, document_types, identified_recovery_aud,
               primary_discrepancy_type, discrepancy_types, information_gaps, discrepancy_count,
               needs_information_count, supported_count, findings_narrative,
               NULLIF(operative_note_assessment, '') AS operative_note_assessment,
               NULLIF(discharge_summary_assessment, '') AS discharge_summary_assessment,
               discharge_summary_ai_summary, operative_note_ai_summary, reviewed_at
        FROM {synced}.claim_document_review WHERE claim_id = %(claim_id)s
        """,
        {"claim_id": claim_id},
    )
    docs = db.all(
        """
        SELECT f.document_id, f.document_type, f.parsed_ok, f.element_count, f.avg_element_confidence,
               f.has_signature, f.classified_document_type, f.type_check_passed, f.avg_field_confidence,
               f.discrepancies_found, f.information_gaps, f.clinical_summary,
               e.image_width, e.image_height
        FROM {synced}.document_ai_fact f
        LEFT JOIN LATERAL (
          SELECT max(image_width) AS image_width, max(image_height) AS image_height
          FROM {synced}.document_element el WHERE el.document_id = f.document_id
        ) e ON true
        WHERE f.claim_id = %(claim_id)s
        ORDER BY CASE f.document_type WHEN 'operative_note' THEN 0 ELSE 1 END, f.document_type
        """,
        {"claim_id": claim_id},
    )
    findings = db.all(
        f"""
        SELECT finding_id, discrepancy_type, discrepancy_title, audit_type, detection_method, verdict, outcome,
               claim_line_id, line_number, billed_item_code, billed_item_description, billed_quantity,
               billed_charge_aud, billed_benefit_aud, supported_fraction, NULLIF(supported_item_code, '') AS supported_item_code,
               supported_quantity, recovery_aud, recovery_basis, documented_detail, reasoning, confidence,
               NULLIF(evidence_quote, '') AS evidence_quote, evidence_bbox, evidence_page, source_document_type, document_id
        FROM {{synced}}.claim_finding WHERE claim_id = %(claim_id)s
        ORDER BY {_OUTCOME_ORDER}, recovery_aud DESC NULLS LAST, line_number NULLS LAST, discrepancy_type
        """,
        {"claim_id": claim_id},
    )

    if summary:
        for k in ("document_types", "discrepancy_types", "information_gaps"):
            summary[k] = summary.get(k) or []
    documents = [
        models.DocumentOut(
            **{k: v for k, v in r.items() if k not in ("image_width", "image_height")},
            image_url=f"/api/documents/{r['document_id']}/image",
            image_width=int(r.get("image_width") or scan_w),
            image_height=int(r.get("image_height") or scan_h),
        )
        for r in docs
    ]
    for f in findings:
        bbox = f.get("evidence_bbox")
        f["evidence_bbox"] = [int(x) for x in bbox] if isinstance(bbox, list) and len(bbox) == 4 else None
    return models.ClaimReviewOut(
        claim_id=claim_id,
        status="received" if (summary or documents) else "none",
        summary=models.DocumentReviewSummaryOut.model_validate(summary) if summary else None,
        documents=documents,
        findings=[models.FindingOut.model_validate(f) for f in findings],
    )


def get_document_volume_path(db: Db, document_id: str) -> str | None:
    row = db.one(
        "SELECT volume_path FROM {synced}.document_ai_fact WHERE document_id = %(id)s", {"id": document_id}
    )
    return row["volume_path"] if row else None


def list_document_elements(db: Db, document_id: str) -> list[models.DocumentElementOut]:
    rows = db.all(
        """
        SELECT element_key, element_id, element_type, left(content, 400) AS content, confidence, page_id, bbox
        FROM {synced}.document_element WHERE document_id = %(id)s
        ORDER BY element_index
        """,
        {"id": document_id},
    )
    out = []
    for r in rows:
        bbox = r.get("bbox")
        r["bbox"] = [int(x) for x in bbox] if isinstance(bbox, list) and len(bbox) == 4 else None
        out.append(models.DocumentElementOut.model_validate(r))
    return out


# ── Workflow status (shared with workflow.get_workflow) ───────────────────────


def claim_status_row(db: Db, claim_id: str) -> dict[str, Any]:
    row = db.one(
        f"WITH {_SINGLE}, {_STATUS} SELECT review_status, actionable_findings, actionable_decided, "
        "confirmed_recovery_aud FROM st",
        {"claim_id": claim_id},
    )
    return row or {"review_status": "open", "actionable_findings": 0, "actionable_decided": 0,
                   "confirmed_recovery_aud": None}
