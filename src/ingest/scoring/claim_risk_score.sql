-- Mock upstream fraud model (deterministic, hash-based => reproducible demo). Planted episodes
-- score high; ~2% of other hospital claims become false positives the AI should later dismiss.
CREATE OR REFRESH STREAMING TABLE ${gold_schema}.claim_risk_score (
  CONSTRAINT score_in_range EXPECT (ml_fraud_score BETWEEN 0 AND 1) ON VIOLATION DROP ROW
)
COMMENT 'Fraud-model score + reason for every hospital claim (mock model). No ground-truth columns.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true')
AS
WITH scored AS (
  SELECT
    e.*,
    CASE
      WHEN l.planted AND l.episode_label = 'hard_discrepancy'
        THEN round(0.90 + 0.09 * (pmod(hash(e.claim_id), 100) / 100.0), 4)
      WHEN l.planted
        THEN round(0.72 + 0.14 * (pmod(hash(e.claim_id), 100) / 100.0), 4)
      WHEN pmod(hash(concat(e.claim_id, '|fp')), 100) < 2
        THEN round(0.70 + 0.09 * (pmod(hash(e.claim_id), 100) / 100.0), 4)
      ELSE round(0.02 + 0.45 * (pmod(hash(e.claim_id), 100) / 100.0), 4)
    END AS ml_fraud_score,
    l.planted,
    l.primary_finding_type
  FROM STREAM(claim_episode) e
  LEFT JOIN model_label_features l ON l.claim_id = e.claim_id
)
SELECT
  * EXCEPT (planted, primary_finding_type, ml_flag_reason_raw),
  ml_flag_reason_raw AS ml_flag_reason,
  'integrity-fraud-clf:v3.2-demo' AS ml_model_version,
  current_timestamp()             AS ml_scored_at
FROM (
  SELECT
    *,
    ml_fraud_score >= 0.70 AS ml_flagged,
    CASE
      WHEN ml_fraud_score < 0.70 THEN NULL
      WHEN planted AND primary_finding_type IN ('los_overbilling', 'same_day_overnight')
        THEN 'Length-of-stay / accommodation charge outlier vs DRG peer cohort'
      WHEN planted AND primary_finding_type IN ('device_phantom', 'device_substitution', 'premium_iol_exploit')
        THEN 'Prosthesis / device benefit anomaly vs implant norms'
      WHEN planted AND primary_finding_type IN ('item_substitution', 'procedure_phantom', 'assistant_phantom', 'duplicate_line')
        THEN 'Procedure / item billing pattern inconsistent with peer providers'
      WHEN planted AND primary_finding_type = 'drg_upcoding'
        THEN 'DRG complexity outlier - comorbidity coding review'
      WHEN planted AND primary_finding_type IN ('bilateral_for_unilateral', 'quantity_overstatement')
        THEN 'Quantity / laterality billing outlier'
      WHEN planted AND primary_finding_type = 'age_eligibility'
        THEN 'Item eligibility rule exception'
      WHEN planted
        THEN 'Anomalous billing pattern flagged by integrity model'
      ELSE 'Statistical outlier in total-charge distribution'
    END AS ml_flag_reason_raw
  FROM scored
);
