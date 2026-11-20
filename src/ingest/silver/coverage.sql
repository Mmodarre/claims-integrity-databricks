CREATE OR REFRESH MATERIALIZED VIEW coverage
COMMENT 'Policy coverage (hospital / extras / ambulance).'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT coverage_id, policy_id, coverage_type, product_id, effective_date, end_date, status, tier,
          excess_amount
FROM ${bronze_schema}.policy__coverage
QUALIFY row_number() OVER (PARTITION BY coverage_id ORDER BY _ingested_at DESC) = 1;
