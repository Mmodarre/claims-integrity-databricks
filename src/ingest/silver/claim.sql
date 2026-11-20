-- Silver claim header. Streaming so the claim-scoring chain (and the AI triage downstream)
-- processes each claim once. Simulator fraud labels are dropped here (see eval.claim_fraud_label).
CREATE OR REFRESH STREAMING TABLE claim (
  CONSTRAINT claim_id_present EXPECT (claim_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT charges_non_negative EXPECT (total_charge >= 0 AND total_benefit >= 0),
  CONSTRAINT benefit_within_charge EXPECT (total_benefit <= total_charge),
  CONSTRAINT lodged_after_service EXPECT (lodgement_date >= service_date)
)
COMMENT 'Cleaned claim headers: typed ids, no fraud labels, no audit columns.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  claim_id,
  claim_number,
  policy_id,
  member_id,
  coverage_id,
  claim_type,
  claim_status,
  service_date,
  lodgement_date,
  assessment_date,
  payment_date,
  CAST(provider_id AS BIGINT)         AS provider_id,
  CAST(hospital_id AS BIGINT)         AS hospital_id,
  total_charge,
  total_benefit,
  total_gap,
  excess_applied,
  co_payment_applied,
  CAST(rejection_reason_id AS BIGINT) AS rejection_reason_id,
  rejection_notes,
  claim_channel,
  pay_to,
  created_at,
  modified_at
FROM STREAM(${bronze_schema}.claims__claim);
