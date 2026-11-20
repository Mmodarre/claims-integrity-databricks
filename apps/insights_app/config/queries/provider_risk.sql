-- Surgeons / providers ranked by identified recovery and flag-rate outlier score.
SELECT
  provider_id,
  provider_name,
  provider_category,
  episodes,
  flagged_episodes,
  flag_rate,
  flag_rate_peer_z,
  claims_with_discrepancy,
  CAST(identified_recovery_aud AS DOUBLE) AS identified_recovery_aud,
  CAST(benefit_paid_aud AS DOUBLE) AS benefit_paid_aud,
  ARRAY_JOIN(COALESCE(discrepancy_types, ARRAY()), ', ') AS discrepancy_types
FROM mehdidatalake_catalog.integrity_gold.provider_risk_profile
WHERE claims_with_discrepancy > 0 OR flag_rate_peer_z >= 2
ORDER BY identified_recovery_aud DESC, flag_rate_peer_z DESC
LIMIT 50
