-- Evaluation (restricted schema): compare AI document findings with the planted ground truth for every
-- claim that has documents. Matching is by BILLED LINE where the ground truth names one (did the AI flag
-- the right line?), within a family of interchangeable labels:
--   procedure_line : procedure_phantom, item_substitution, quantity_overstatement, duplicate_line,
--                    assistant_phantom, bilateral_for_unilateral, age_eligibility
--   device_line    : device_phantom, device_substitution, premium_iol_exploit
--   accommodation  : same_day_overnight, los_overbilling
-- drg_upcoding (no billed line) matches on claim + type. Exact type agreement is reported separately.
--   expected : documentary_contradiction -> discrepancy; documentation_gap_trap / clinical_judgment -> not_discrepancy
CREATE OR REFRESH MATERIALIZED VIEW ${eval_schema}.ai_eval_finding_match
COMMENT 'AI findings vs ground truth (line-level, label families) for claims with documents. Restricted.'
TBLPROPERTIES ('quality' = 'eval')
AS
WITH doc_claims AS (
  SELECT DISTINCT claim_id FROM ${silver_schema}.document_registry
),
labels AS (
  SELECT claim_id, episode_label FROM ${eval_schema}.integrity__episode_ground_truth
  QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY created_at DESC) = 1
),
gt AS (
  SELECT g.finding_id, g.claim_id, g.claim_line_id, g.finding_type, g.evidence_class, g.recovery_amount
  FROM ${eval_schema}.integrity__integrity_finding g
  JOIN doc_claims d ON d.claim_id = g.claim_id
),
pred AS (
  SELECT finding_id AS pred_id, claim_id, claim_line_id, discrepancy_type, outcome, recovery_aud, detection_method,
         CASE
           WHEN discrepancy_type IN ('device_phantom', 'device_substitution', 'premium_iol_exploit') THEN 'device_line'
           WHEN discrepancy_type IN ('same_day_overnight', 'los_overbilling') THEN 'accommodation'
           WHEN discrepancy_type = 'drg_upcoding' THEN 'drg'
           ELSE 'procedure_line'
         END AS family
  FROM ${gold_schema}.claim_finding
),
gt_fam AS (
  SELECT *,
         CASE
           WHEN finding_type IN ('device_phantom', 'device_substitution', 'premium_iol_exploit') THEN 'device_line'
           WHEN finding_type IN ('same_day_overnight', 'los_overbilling') THEN 'accommodation'
           WHEN finding_type = 'drg_upcoding' THEN 'drg'
           ELSE 'procedure_line'
         END AS family
  FROM gt
),
gt_matched AS (
  -- strongest AI outcome on the same line (same family), or same claim+type when no line is named
  SELECT
    g.*,
    max_by(p.outcome, CASE p.outcome WHEN 'discrepancy' THEN 3 WHEN 'needs_information' THEN 2 ELSE 1 END) AS predicted_outcome,
    max_by(p.discrepancy_type, CASE p.outcome WHEN 'discrepancy' THEN 3 WHEN 'needs_information' THEN 2 ELSE 1 END) AS predicted_type,
    max_by(p.detection_method, CASE p.outcome WHEN 'discrepancy' THEN 3 WHEN 'needs_information' THEN 2 ELSE 1 END) AS detection_method,
    sum(CASE WHEN p.outcome = 'discrepancy' THEN coalesce(p.recovery_aud, 0) END) AS ai_recovery_aud,
    collect_set(p.pred_id) AS matched_pred_ids
  FROM gt_fam g
  LEFT JOIN pred p
    ON p.claim_id = g.claim_id AND p.family = g.family
   AND (CASE WHEN g.claim_line_id IS NOT NULL THEN p.claim_line_id = g.claim_line_id
             ELSE p.discrepancy_type = g.finding_type END)
  GROUP BY ALL
),
matched_ids AS (
  SELECT DISTINCT explode(matched_pred_ids) AS pred_id FROM gt_matched
),
unmatched_pred AS (
  -- AI discrepancies on lines / claims where nothing was planted
  SELECT p.*
  FROM pred p
  JOIN doc_claims d ON d.claim_id = p.claim_id
  LEFT ANTI JOIN matched_ids m ON m.pred_id = p.pred_id
  WHERE p.outcome = 'discrepancy'
)
SELECT
  g.claim_id,
  g.claim_line_id,
  g.finding_type                                                   AS discrepancy_type,
  g.family,
  l.episode_label,
  g.evidence_class,
  CASE WHEN g.evidence_class = 'documentary_contradiction' THEN 'discrepancy' ELSE 'not_discrepancy' END AS expected,
  coalesce(g.predicted_outcome, 'not_evaluated')                   AS predicted_outcome,
  g.predicted_type,
  g.predicted_type = g.finding_type                                AS exact_type_match,
  g.detection_method,
  CASE
    WHEN g.evidence_class = 'documentary_contradiction' AND g.predicted_outcome = 'discrepancy' THEN 'TP'
    WHEN g.evidence_class = 'documentary_contradiction'                                        THEN 'FN'
    WHEN g.predicted_outcome = 'discrepancy'                                                     THEN 'FP'
    ELSE 'TN'
  END                                                              AS result,
  g.recovery_amount                                                AS gt_recovery_aud,
  g.ai_recovery_aud
FROM gt_matched g
LEFT JOIN labels l ON l.claim_id = g.claim_id
UNION ALL
SELECT
  p.claim_id, p.claim_line_id, p.discrepancy_type, p.family, l.episode_label, CAST(NULL AS STRING),
  'no_finding_planted', 'discrepancy', p.discrepancy_type, CAST(NULL AS BOOLEAN), p.detection_method,
  'FP', CAST(NULL AS DECIMAL(12, 2)), p.recovery_aud
FROM unmatched_pred p
LEFT JOIN labels l ON l.claim_id = p.claim_id;
