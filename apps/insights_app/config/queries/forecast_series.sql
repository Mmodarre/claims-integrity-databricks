-- Weekly actuals + ai_forecast projection (90% interval) for one claim type.
-- @param claim_type STRING = Hospital
SELECT
  week,
  series,
  claims,
  claims_lower,
  claims_upper,
  benefit_paid,
  benefit_paid_lower,
  benefit_paid_upper
FROM mehdidatalake_catalog.integrity_gold.claims_forecast
WHERE claim_type = :claim_type
ORDER BY week
