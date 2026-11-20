-- Auditor-facing work queue: claims the fraud model flagged (score >= 0.70). Streaming so the AI
-- pipeline's triage runs exactly once per flagged claim. Lakebase sync source (PK claim_id).
CREATE OR REFRESH STREAMING TABLE ${gold_schema}.flagged_claim_queue (
  CONSTRAINT claim_id_present EXPECT (claim_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT flagged_only EXPECT (ml_fraud_score >= 0.70)
)
COMMENT 'ML-flagged hospital claims awaiting integrity review. PK: claim_id. No PII, no labels.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'claim_id')
AS SELECT * EXCEPT (ml_flagged)
FROM STREAM(${gold_schema}.claim_risk_score)
WHERE ml_flagged;
