from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .. import __version__

# Money columns are NUMERIC in Postgres (DECIMAL in UC); psycopg returns Decimal, which
# Pydantic coerces to float. JSONB arrays (e.g. evidence_bbox, key_signals) arrive as lists.

DecisionValue = Literal["confirmed", "rejected", "needs_information", "escalated"]
ReviewStatus = Literal["open", "in_review", "awaiting_information", "escalated", "closed"]
REVIEW_STATUSES: list[str] = ["open", "in_review", "awaiting_information", "escalated", "closed"]


class VersionOut(BaseModel):
    version: str

    @classmethod
    def from_metadata(cls):
        return cls(version=__version__)


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: str
    app_schema: str
    synced_schema: str
    detail: str | None = None


class CurrentUserOut(BaseModel):
    """Signed-in auditor from the Databricks Apps forwarded identity headers."""

    user_name: str
    display_name: str
    email: str | None = None
    initials: str
    can_view_pii: bool = False


# ── Queue ─────────────────────────────────────────────────────────────────────


class QueueRowOut(BaseModel):
    """One claim in the integrity worklist: ML-flagged claims plus claims whose scanned
    documents were reviewed (same population as gold.integrity_case_fact)."""

    claim_id: str
    claim_number: str | None = None
    member_full_name: str | None = None
    region: str | None = None
    hospital_name: str | None = None
    claim_status: str | None = None
    admission_date: date | None = None
    total_claim_amount_aud: float | None = None
    # ML flag (None when the claim entered review only because documents were received)
    is_flagged: bool = False
    ml_fraud_score: float | None = None
    ml_flag_reason: str | None = None
    # AI triage (claim data only)
    is_integrity_issue: bool | None = None
    discrepancy_type: str | None = None
    recommendation: str | None = None
    confidence: float | None = None
    est_impact_aud: float | None = None
    # AI document review (None when no scans on file)
    review_outcome: str | None = None
    identified_recovery_aud: float | None = None
    documents_received: int = 0
    # Auditor workflow (Lakebase app tables)
    review_status: ReviewStatus = "open"
    confirmed_recovery_aud: float | None = None
    actionable_findings: int = 0
    actionable_decided: int = 0


class QueuePageOut(BaseModel):
    items: list[QueueRowOut]
    total: int
    page: int
    page_size: int


class QueueFacetsOut(BaseModel):
    regions: list[str] = Field(default_factory=list)
    claim_statuses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    review_outcomes: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)


# ── Triage ────────────────────────────────────────────────────────────────────


class TriageOut(BaseModel):
    """gold.claim_triage — ai_query verdict on claim data only (before documents)."""

    claim_id: str
    claim_number: str | None = None
    ml_fraud_score: float | None = None
    ml_flag_reason: str | None = None
    is_integrity_issue: bool | None = None
    discrepancy_type: str | None = None
    confidence: float | None = None
    est_impact_aud: float | None = None
    doc_to_request: str | None = None
    recommendation: str | None = None
    key_signals: list[str] = Field(default_factory=list)
    reasoning: str | None = None
    triage_error: str | None = None
    triage_model: str | None = None
    triaged_at: datetime | None = None


# ── Claim detail ──────────────────────────────────────────────────────────────


class ClaimHeaderOut(BaseModel):
    claim_id: str
    claim_number: str | None = None
    claim_status: str | None = None
    service_date: date | None = None
    lodgement_date: date | None = None
    payment_date: date | None = None
    claim_channel: str | None = None
    total_claim_amount_aud: float | None = None
    benefit_paid_aud: float | None = None
    gap_aud: float | None = None
    accommodation_charge_aud: float | None = None
    theatre_charge_aud: float | None = None
    prosthesis_charge_aud: float | None = None


class MemberOut(BaseModel):
    member_id: str | None = None
    member_number: str | None = None
    member_full_name: str | None = None
    member_dob: date | None = None
    member_gender: str | None = None
    medicare_number: str | None = None
    member_state: str | None = None
    policy_number: str | None = None
    policy_type: str | None = None
    product_name: str | None = None


class AdmissionOut(BaseModel):
    admission_id: str | None = None
    admission_date: date | None = None
    discharge_date: date | None = None
    length_of_stay_days: int | None = None
    same_day_flag: bool | None = None
    admission_type: str | None = None
    accommodation_type: str | None = None
    care_type: str | None = None
    separation_mode: str | None = None
    drg_code: str | None = None
    principal_diagnosis_code: str | None = None
    principal_procedure_code: str | None = None
    theatre_minutes: int | None = None


class HospitalOut(BaseModel):
    hospital_id: int | None = None
    hospital_code: str | None = None
    hospital_name: str | None = None
    region: str | None = None
    is_contracted: bool | None = None
    # gold.hospital_risk_profile
    hospital_claims: int | None = None
    flagged_claims: int | None = None
    flag_rate: float | None = None
    flag_rate_peer_z: float | None = None
    claims_with_discrepancy: int | None = None
    identified_recovery_aud: float | None = None
    discrepancy_mix: str | None = None
    needs_attention: bool | None = None
    risk_narrative: str | None = None
    narrative_model: str | None = None


class SurgeonOut(BaseModel):
    provider_id: int | None = None
    surgeon_name: str | None = None
    # gold.provider_risk_profile
    provider_category: str | None = None
    episodes: int | None = None
    flagged_episodes: int | None = None
    flag_rate: float | None = None
    flag_rate_peer_z: float | None = None
    claims_with_discrepancy: int | None = None
    identified_recovery_aud: float | None = None
    discrepancy_types: list[str] = Field(default_factory=list)


class ClaimLineOut(BaseModel):
    claim_line_id: str
    line_number: int | None = None
    line_category: str | None = None
    item_code: str | None = None
    item_description: str | None = None
    service_date: date | None = None
    quantity: int | None = None
    charge_amount_aud: float | None = None
    schedule_fee_aud: float | None = None
    benefit_amount_aud: float | None = None
    medicare_benefit_aud: float | None = None
    gap_amount_aud: float | None = None
    line_status: str | None = None
    provider_name: str | None = None
    provider_category: str | None = None
    is_assistant_item: bool | None = None


class CodingOut(BaseModel):
    coding_id: str
    coding_type: str | None = None
    sequence_no: int | None = None
    code: str | None = None
    description: str | None = None
    is_principal: bool | None = None
    ccl: int | None = None


class ClaimDetailOut(BaseModel):
    claim: ClaimHeaderOut
    member: MemberOut | None = None
    admission: AdmissionOut | None = None
    hospital: HospitalOut | None = None
    surgeon: SurgeonOut | None = None
    lines: list[ClaimLineOut] = Field(default_factory=list)
    diagnoses: list[CodingOut] = Field(default_factory=list)
    procedures: list[CodingOut] = Field(default_factory=list)


# ── Document review (AI) ──────────────────────────────────────────────────────


class DocumentReviewSummaryOut(BaseModel):
    """gold.claim_document_review — deterministic roll-up of the document findings."""

    review_outcome: str | None = None
    documents_received: int | None = None
    document_types: list[str] = Field(default_factory=list)
    identified_recovery_aud: float | None = None
    primary_discrepancy_type: str | None = None
    discrepancy_types: list[str] = Field(default_factory=list)
    information_gaps: list[str] = Field(default_factory=list)
    discrepancy_count: int | None = None
    needs_information_count: int | None = None
    supported_count: int | None = None
    findings_narrative: str | None = None
    operative_note_assessment: str | None = None
    discharge_summary_assessment: str | None = None
    discharge_summary_ai_summary: str | None = None
    operative_note_ai_summary: str | None = None
    reviewed_at: datetime | None = None


class DocumentOut(BaseModel):
    """One scanned document (gold.document_ai_fact) with the URL of its rendered image."""

    document_id: str
    document_type: str | None = None
    image_url: str
    image_width: int
    image_height: int
    parsed_ok: bool | None = None
    element_count: int | None = None
    avg_element_confidence: float | None = None
    has_signature: bool | None = None
    classified_document_type: str | None = None
    type_check_passed: bool | None = None
    avg_field_confidence: float | None = None
    discrepancies_found: int | None = None
    information_gaps: int | None = None
    clinical_summary: str | None = None


class FindingOut(BaseModel):
    """gold.claim_finding — one AI finding per claim / check / billed line."""

    finding_id: str
    discrepancy_type: str | None = None
    discrepancy_title: str | None = None
    audit_type: str | None = None
    detection_method: str | None = None
    verdict: str | None = None
    outcome: str | None = None
    claim_line_id: str | None = None
    line_number: int | None = None
    billed_item_code: str | None = None
    billed_item_description: str | None = None
    billed_quantity: int | None = None
    billed_charge_aud: float | None = None
    billed_benefit_aud: float | None = None
    supported_fraction: float | None = None
    supported_item_code: str | None = None
    supported_quantity: int | None = None
    recovery_aud: float | None = None
    recovery_basis: str | None = None
    documented_detail: str | None = None
    reasoning: str | None = None
    confidence: float | None = None
    evidence_quote: str | None = None
    evidence_bbox: list[int] | None = None
    evidence_page: int | None = None
    source_document_type: str | None = None
    document_id: str | None = None


class ClaimReviewOut(BaseModel):
    claim_id: str
    status: Literal["none", "received"]
    summary: DocumentReviewSummaryOut | None = None
    documents: list[DocumentOut] = Field(default_factory=list)
    findings: list[FindingOut] = Field(default_factory=list)


class DocumentElementOut(BaseModel):
    """gold.document_element — parsed layout element (ai_parse_document) with bbox."""

    element_key: str
    element_id: int | None = None
    element_type: str | None = None
    content: str | None = None
    confidence: float | None = None
    page_id: int | None = None
    bbox: list[int] | None = None


# ── Auditor workflow (Lakebase app tables) ────────────────────────────────────


class DecisionIn(BaseModel):
    decision: DecisionValue
    # Only kept for decision='confirmed' (defaults to the finding's identified recovery).
    confirmed_recovery_aud: float | None = Field(default=None, ge=0, le=10_000_000)
    note: str | None = Field(default=None, max_length=4000)


class DecisionOut(BaseModel):
    decision_id: str
    claim_id: str
    finding_id: str | None = None
    decision: DecisionValue
    confirmed_recovery_aud: float | None = None
    decided_by: str | None = None
    decided_at: datetime
    note: str | None = None


class DocumentRequestOut(BaseModel):
    request_id: str
    claim_id: str
    doc_type: str
    recipient: str
    subject: str
    status: str
    drafted_by_ai: bool | None = None
    draft_model: str | None = None
    requested_by: str | None = None
    requested_at: datetime


class ClaimWorkflowOut(BaseModel):
    """Everything the auditor has recorded for a claim (read back from Lakebase)."""

    claim_id: str
    review_status: ReviewStatus
    actionable_findings: int = 0
    actionable_decided: int = 0
    confirmed_recovery_aud: float | None = None
    claim_decision: DecisionOut | None = None
    finding_decisions: list[DecisionOut] = Field(default_factory=list)
    document_requests: list[DocumentRequestOut] = Field(default_factory=list)
    feedback_count: int = 0


class FeedbackIn(BaseModel):
    """Rating of the AI's reasoning plus the auditor's claim-level decision. The decision
    is also upserted into auditor_decision (finding_id NULL)."""

    reasoning_rating: int = Field(ge=1, le=5)
    decision: DecisionValue
    note: str | None = Field(default=None, max_length=4000)


class FeedbackOut(BaseModel):
    feedback_id: str
    claim_id: str
    reasoning_rating: int
    decision: DecisionValue
    note: str | None = None
    auditor_id: str | None = None
    persona: str
    created_at: datetime
    claim_decision: DecisionOut


# ── Document request (draft email via FMAPI, then record in Lakebase) ─────────


class DraftDocRequestIn(BaseModel):
    doc_type: str = Field(min_length=1, max_length=64)
    claim_number: str | None = None
    member_full_name: str | None = None
    hospital_name: str | None = None
    admission_date: str | None = None
    discrepancy_type: str | None = None
    reason: str | None = Field(default=None, max_length=4000)


class DraftDocRequestOut(BaseModel):
    to: str
    subject: str
    body: str
    model: str
    drafted_by_ai: bool = True


class SendDocRequestIn(BaseModel):
    to: str = Field(min_length=1, max_length=320)
    subject: str = Field(min_length=1, max_length=400)
    body: str = Field(min_length=1, max_length=20000)
    doc_type: str = Field(min_length=1, max_length=64)
    drafted_by_ai: bool | None = None
    draft_model: str | None = Field(default=None, max_length=200)


class SendDocRequestOut(BaseModel):
    request_id: str
    claim_id: str
    doc_type: str
    to: str
    status: str
    recorded_at: datetime
    message: str


# ── Genie (Ask the data) ──────────────────────────────────────────────────────


class GenieStatusOut(BaseModel):
    configured: bool
    space_id: str | None = None


class GenieAskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None


class GenieResultTable(BaseModel):
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str | None]] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False


class GenieAnswerOut(BaseModel):
    conversation_id: str
    message_id: str
    question: str
    answer_text: str | None = None
    sql: str | None = None
    query_description: str | None = None
    result: GenieResultTable | None = None
    suggested_questions: list[str] = Field(default_factory=list)
    status: str
    error: str | None = None
