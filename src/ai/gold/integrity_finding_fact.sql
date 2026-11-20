-- Recovery fact: one row per integrity finding with the auditor's decision (when made).
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.integrity_finding_fact (
  CONSTRAINT finding_id_present EXPECT (finding_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Integrity findings with auditor decisions and confirmed recovery. Source for mv_recovery.'
TBLPROPERTIES ('quality' = 'gold')
AS
WITH finding_decision AS (
  SELECT finding_id, max_by(decision, decided_at) AS decision, max(decided_at) AS decided_at,
         max_by(confirmed_recovery_aud, decided_at) AS confirmed_recovery_aud
  FROM ${gold_schema}.auditor_decision
  WHERE finding_id IS NOT NULL
  GROUP BY finding_id
)
SELECT
  f.finding_id,
  f.claim_id,
  f.claim_number,
  f.discrepancy_type,
  f.discrepancy_title,
  f.audit_type,
  f.detection_method,
  f.outcome,
  f.verdict,
  f.billed_item_code,
  f.billed_benefit_aud,
  f.recovery_aud                                        AS identified_recovery_aud,
  f.recovery_basis,
  f.confidence,
  f.source_document_type,
  f.hospital_id,
  f.hospital_name,
  f.region,
  f.surgeon_provider_id,
  sp.display_name                                       AS surgeon_name,
  f.service_date,
  f.service_month,
  coalesce(d.decision, 'pending')                       AS auditor_status,
  d.decided_at                                          AS auditor_decided_at,
  CASE WHEN d.decision = 'confirmed' THEN coalesce(d.confirmed_recovery_aud, f.recovery_aud) ELSE 0 END AS confirmed_recovery_aud
FROM ${gold_schema}.claim_finding f
LEFT JOIN finding_decision d          ON d.finding_id = f.finding_id
LEFT JOIN ${silver_schema}.provider sp ON sp.provider_id = f.surgeon_provider_id;
