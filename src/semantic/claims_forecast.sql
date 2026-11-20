-- Executive forward view: weekly claims and benefit paid forecast by claim type with ai_forecast,
-- trained on steady-state history (2022 onward, complete weeks) and projected to ${horizon}.
-- ${catalog}, ${gold_schema}, ${last_full_week} and ${horizon} are substituted by deploy_semantic.py.
CREATE OR REPLACE TABLE ${catalog}.${gold_schema}.claims_forecast
COMMENT 'ai_forecast weekly projection of claim volume and benefit paid by claim type, with 90% prediction intervals; actual history rows included for charting.'
AS
WITH history AS (
  SELECT service_week AS week, claim_type,
         CAST(COUNT(1) AS DOUBLE)           AS claims,
         CAST(SUM(total_benefit) AS DOUBLE) AS benefit_paid
  FROM ${catalog}.${gold_schema}.claims_fact
  WHERE service_week BETWEEN DATE'2022-01-03' AND DATE'${last_full_week}'
  GROUP BY 1, 2
),
fc AS (
  SELECT * FROM ai_forecast(
    observed => TABLE(
      SELECT service_week AS week, claim_type,
             CAST(COUNT(1) AS DOUBLE)           AS claims,
             CAST(SUM(total_benefit) AS DOUBLE) AS benefit_paid
      FROM ${catalog}.${gold_schema}.claims_fact
      WHERE service_week BETWEEN DATE'2022-01-03' AND DATE'${last_full_week}'
      GROUP BY 1, 2
    ),
    horizon                   => '${horizon}',
    time_col                  => 'week',
    value_col                 => ARRAY('claims', 'benefit_paid'),
    group_col                 => 'claim_type',
    prediction_interval_width => 0.9,
    frequency                 => 'week',
    seed                      => 42,
    parameters                => '{"global_floor": 0}'
  )
)
SELECT CAST(week AS DATE) AS week, claim_type, 'actual' AS series,
       claims, CAST(NULL AS DOUBLE) AS claims_lower, CAST(NULL AS DOUBLE) AS claims_upper,
       benefit_paid, CAST(NULL AS DOUBLE) AS benefit_paid_lower, CAST(NULL AS DOUBLE) AS benefit_paid_upper
FROM history
UNION ALL
SELECT CAST(week AS DATE), claim_type, 'forecast',
       claims_forecast, claims_lower, claims_upper,
       benefit_paid_forecast, benefit_paid_lower, benefit_paid_upper
FROM fc
WHERE CAST(week AS DATE) > DATE'${last_full_week}';
