-- Per-hospital risk profile with the AI-written narrative (gold.hospital_risk_profile).
SELECT
  hospital_id,
  hospital_name,
  region,
  hospital_claims,
  flagged_claims,
  flag_rate,
  flag_rate_peer_z,
  claims_with_discrepancy,
  discrepancy_findings,
  information_gaps,
  CAST(identified_recovery_aud AS DOUBLE) AS identified_recovery_aud,
  CAST(benefit_paid_aud AS DOUBLE) AS benefit_paid_aud,
  avg_length_of_stay,
  COALESCE(discrepancy_mix, '') AS discrepancy_mix,
  triage_escalations,
  recovery_rank,
  needs_attention,
  COALESCE(risk_narrative, '') AS risk_narrative,
  COALESCE(narrative_model, '') AS narrative_model
FROM mehdidatalake_catalog.integrity_gold.hospital_risk_profile
ORDER BY needs_attention DESC, identified_recovery_aud DESC, flag_rate_peer_z DESC
