-- Evaluation summary (restricted): precision / recall per discrepancy type and overall (line-level,
-- label families), exact-type agreement on true positives, gap-trap routing, recovery accuracy.
CREATE OR REFRESH MATERIALIZED VIEW ${eval_schema}.ai_eval_summary
COMMENT 'AI accuracy vs ground truth per discrepancy type and overall (line-level matching). Restricted.'
TBLPROPERTIES ('quality' = 'eval')
AS
WITH by_type AS (
  SELECT
    discrepancy_type,
    count_if(result = 'TP') AS tp,
    count_if(result = 'FP') AS fp,
    count_if(result = 'FN') AS fn,
    count_if(result = 'TP' AND exact_type_match) AS tp_exact_type,
    count_if(expected = 'not_discrepancy') AS gaps_planted,
    count_if(expected = 'not_discrepancy' AND predicted_outcome = 'needs_information') AS gaps_routed_to_info,
    count_if(expected = 'not_discrepancy' AND predicted_outcome = 'discrepancy') AS gaps_flagged_as_discrepancy,
    sum(CASE WHEN result = 'TP' THEN gt_recovery_aud END) AS tp_gt_recovery_aud,
    sum(CASE WHEN result = 'TP' THEN ai_recovery_aud END) AS tp_ai_recovery_aud
  FROM ${eval_schema}.ai_eval_finding_match
  GROUP BY discrepancy_type
),
rolled AS (
  SELECT * FROM by_type
  UNION ALL
  SELECT '_overall', sum(tp), sum(fp), sum(fn), sum(tp_exact_type), sum(gaps_planted), sum(gaps_routed_to_info),
         sum(gaps_flagged_as_discrepancy), sum(tp_gt_recovery_aud), sum(tp_ai_recovery_aud)
  FROM by_type
)
SELECT
  discrepancy_type, tp, fp, fn,
  round(tp / nullif(tp + fp, 0), 3)            AS precision,
  round(tp / nullif(tp + fn, 0), 3)            AS recall,
  round(tp_exact_type / nullif(tp, 0), 3)      AS exact_type_rate,
  gaps_planted, gaps_routed_to_info, gaps_flagged_as_discrepancy,
  CAST(tp_gt_recovery_aud AS DECIMAL(12, 2))   AS tp_gt_recovery_aud,
  CAST(tp_ai_recovery_aud AS DECIMAL(12, 2))   AS tp_ai_recovery_aud
FROM rolled;
