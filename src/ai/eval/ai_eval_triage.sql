-- Triage evaluation (restricted): does the claim-only AI triage dismiss the model false positives and
-- name the right discrepancy type for planted episodes?
CREATE OR REFRESH MATERIALIZED VIEW ${eval_schema}.ai_eval_triage
COMMENT 'AI triage vs ground truth per flagged claim. Restricted.'
TBLPROPERTIES ('quality' = 'eval')
AS
WITH labels AS (
  SELECT claim_id, planted, episode_label
  FROM ${eval_schema}.integrity__episode_ground_truth
  QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY created_at DESC) = 1
),
gt_findings AS (
  SELECT claim_id,
         max_by(finding_type, recovery_amount) AS gt_primary_type,
         collect_set(finding_type)             AS gt_types
  FROM ${eval_schema}.integrity__integrity_finding
  GROUP BY claim_id
)
SELECT
  t.claim_id,
  coalesce(l.planted, false)                                          AS planted,
  coalesce(l.episode_label, 'not_in_integrity_set')                   AS episode_label,
  f.gt_primary_type,
  t.recommendation,
  t.discrepancy_type                                                  AS triage_discrepancy_type,
  t.confidence,
  CASE WHEN coalesce(l.planted, false) THEN t.recommendation <> 'dismiss'
       ELSE t.recommendation = 'dismiss' END                          AS recommendation_correct,
  array_contains(coalesce(f.gt_types, array()), t.discrepancy_type)   AS type_in_ground_truth
FROM ${gold_schema}.claim_triage t
LEFT JOIN labels l      ON l.claim_id = t.claim_id
LEFT JOIN gt_findings f ON f.claim_id = t.claim_id;
