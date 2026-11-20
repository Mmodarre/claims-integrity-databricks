CREATE OR REFRESH MATERIALIZED VIEW claim_assessment (
  CONSTRAINT assessment_id_present EXPECT (assessment_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Cleaned claim assessments.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT
  assessment_id, claim_id, assessment_type, assessment_date, assessed_by,
  original_benefit, adjusted_benefit, adjustment_reason,
  waiting_period_check, benefit_limit_check, eligibility_check, outcome, notes
FROM ${bronze_schema}.claims__claim_assessment
QUALIFY row_number() OVER (PARTITION BY assessment_id ORDER BY _ingested_at DESC) = 1;
