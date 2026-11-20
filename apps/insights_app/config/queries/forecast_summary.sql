-- Projected total over the forecast horizon per claim type vs the same number of trailing actual weeks.
-- (Weekly 90% intervals are shown on the chart; they are not summed here because a sum of
-- per-week bounds is not a valid interval for the total.)
WITH horizon AS (
  SELECT claim_type, COUNT(*) AS forecast_weeks, MIN(week) AS forecast_start, MAX(week) AS forecast_end
  FROM mehdidatalake_catalog.integrity_gold.claims_forecast
  WHERE series = 'forecast'
  GROUP BY claim_type
),
ranked AS (
  SELECT
    claim_type,
    series,
    claims,
    benefit_paid,
    ROW_NUMBER() OVER (PARTITION BY claim_type, series ORDER BY week DESC) AS rn_desc
  FROM mehdidatalake_catalog.integrity_gold.claims_forecast
)
SELECT
  h.claim_type,
  h.forecast_weeks,
  h.forecast_start,
  h.forecast_end,
  SUM(CASE WHEN r.series = 'forecast' THEN r.claims END) AS forecast_claims,
  SUM(CASE WHEN r.series = 'forecast' THEN r.benefit_paid END) AS forecast_benefit,
  SUM(CASE WHEN r.series = 'actual' AND r.rn_desc <= h.forecast_weeks THEN r.claims END) AS trailing_claims,
  SUM(CASE WHEN r.series = 'actual' AND r.rn_desc <= h.forecast_weeks THEN r.benefit_paid END) AS trailing_benefit
FROM horizon h
JOIN ranked r ON r.claim_type = h.claim_type
GROUP BY h.claim_type, h.forecast_weeks, h.forecast_start, h.forecast_end
ORDER BY h.claim_type
