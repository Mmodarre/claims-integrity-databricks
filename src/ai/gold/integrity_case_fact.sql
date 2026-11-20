-- Integrity funnel fact: one row per claim that entered the integrity process (ML-flagged and/or
-- documents received). Joins model flag -> AI triage -> document review -> auditor decision.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.integrity_case_fact (
  CONSTRAINT claim_id_present EXPECT (claim_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Integrity funnel per claim: flag, AI triage, document review, identified/confirmed recovery, auditor decision. Source for mv_integrity_funnel.'
TBLPROPERTIES ('quality' = 'gold')
AS
WITH decisions AS (
  SELECT claim_id,
         max_by(decision, decided_at)                  AS auditor_decision,
         max(decided_at)                               AS auditor_decided_at,
         sum(coalesce(confirmed_recovery_aud, 0))      AS confirmed_recovery_aud
  FROM ${gold_schema}.auditor_decision
  GROUP BY claim_id
),
population AS (
  SELECT claim_id FROM ${gold_schema}.flagged_claim_queue
  UNION
  SELECT claim_id FROM ${gold_schema}.claim_document_review
)
SELECT
  p.claim_id,
  ce.claim_number,
  ce.service_date,
  CAST(date_trunc('MONTH', ce.service_date) AS DATE)                  AS service_month,
  ce.hospital_id,
  ce.hospital_name,
  ce.region,
  ce.surgeon_provider_id,
  sp.display_name                                                     AS surgeon_name,
  ce.drg_code,
  ce.accommodation_type,
  ce.benefit_paid_aud,
  ce.total_claim_amount_aud,
  q.claim_id IS NOT NULL                                              AS is_flagged,
  rs.ml_fraud_score,
  rs.ml_flag_reason,
  t.claim_id IS NOT NULL                                              AS is_triaged,
  t.recommendation                                                    AS triage_recommendation,
  t.discrepancy_type                                                  AS triage_discrepancy_type,
  t.confidence                                                        AS triage_confidence,
  t.est_impact_aud                                                    AS triage_est_impact_aud,
  t.doc_to_request,
  coalesce(t.recommendation IN ('investigate', 'escalate'), false)    AS audit_recommended,
  r.claim_id IS NOT NULL                                              AS documents_reviewed,
  r.documents_received,
  coalesce(r.review_outcome, 'documents_not_received')              AS review_outcome,
  r.primary_discrepancy_type,
  r.discrepancy_count,
  r.needs_information_count,
  coalesce(r.identified_recovery_aud, 0)                              AS identified_recovery_aud,
  d.auditor_decision,
  d.auditor_decided_at,
  coalesce(d.confirmed_recovery_aud, 0)                               AS confirmed_recovery_aud,
  CASE
    WHEN d.auditor_decision IS NULL OR r.claim_id IS NULL THEN NULL
    WHEN r.review_outcome = 'discrepancy_confirmed'  AND d.auditor_decision IN ('confirmed', 'escalated') THEN true
    WHEN r.review_outcome = 'documents_support_claim' AND d.auditor_decision = 'rejected'                THEN true
    WHEN r.review_outcome = 'needs_more_information'  AND d.auditor_decision = 'needs_information'       THEN true
    ELSE false
  END                                                                 AS ai_auditor_agree
FROM population p
JOIN ${silver_schema}.claim_episode ce        ON ce.claim_id = p.claim_id
LEFT JOIN ${gold_schema}.flagged_claim_queue q ON q.claim_id = p.claim_id
LEFT JOIN ${gold_schema}.claim_risk_score rs   ON rs.claim_id = p.claim_id
LEFT JOIN ${gold_schema}.claim_triage t        ON t.claim_id = p.claim_id
LEFT JOIN ${gold_schema}.claim_document_review r ON r.claim_id = p.claim_id
LEFT JOIN decisions d                          ON d.claim_id = p.claim_id
LEFT JOIN ${silver_schema}.provider sp         ON sp.provider_id = ce.surgeon_provider_id;
