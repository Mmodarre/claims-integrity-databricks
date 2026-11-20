-- Surgeon/provider integrity profile (principal surgeon on hospital episodes).
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.provider_risk_profile
COMMENT 'Per-surgeon integrity profile: episodes, flag rate vs peers, document-confirmed discrepancies, identified recovery. PK: provider_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'provider_id')
AS
WITH base AS (
  SELECT surgeon_provider_id AS provider_id, count(*) AS episodes, count_if(ml_flagged) AS flagged_episodes,
         sum(benefit_paid_aud) AS benefit_paid_aud
  FROM ${gold_schema}.claim_risk_score
  WHERE surgeon_provider_id IS NOT NULL
  GROUP BY surgeon_provider_id
),
findings AS (
  SELECT surgeon_provider_id AS provider_id,
         count(DISTINCT CASE WHEN outcome = 'discrepancy' THEN claim_id END)              AS claims_with_discrepancy,
         sum(CASE WHEN outcome = 'discrepancy' THEN coalesce(recovery_aud, 0) ELSE 0 END) AS identified_recovery_aud,
         array_sort(collect_set(CASE WHEN outcome = 'discrepancy' THEN discrepancy_type END)) AS discrepancy_types
  FROM ${gold_schema}.claim_finding
  WHERE surgeon_provider_id IS NOT NULL
  GROUP BY surgeon_provider_id
)
SELECT
  b.provider_id,
  p.display_name                                                AS provider_name,
  p.provider_category,
  b.episodes,
  b.flagged_episodes,
  b.flagged_episodes / b.episodes                               AS flag_rate,
  CASE WHEN b.episodes >= 5 THEN round(
    (b.flagged_episodes / b.episodes - avg(CASE WHEN b.episodes >= 5 THEN b.flagged_episodes / b.episodes END) OVER ())
    / nullif(stddev(CASE WHEN b.episodes >= 5 THEN b.flagged_episodes / b.episodes END) OVER (), 0), 2) END AS flag_rate_peer_z,
  coalesce(f.claims_with_discrepancy, 0)                        AS claims_with_discrepancy,
  CAST(coalesce(f.identified_recovery_aud, 0) AS DECIMAL(12, 2)) AS identified_recovery_aud,
  coalesce(f.discrepancy_types, array())                        AS discrepancy_types,
  CAST(b.benefit_paid_aud AS DECIMAL(14, 2))                    AS benefit_paid_aud
FROM base b
LEFT JOIN findings f                   ON f.provider_id = b.provider_id
LEFT JOIN ${silver_schema}.provider p  ON p.provider_id = b.provider_id;
