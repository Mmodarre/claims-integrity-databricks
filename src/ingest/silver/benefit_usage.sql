CREATE OR REFRESH MATERIALIZED VIEW benefit_usage
COMMENT 'Benefit usage against annual limits.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT benefit_usage_id, policy_id, member_id, claim_id, benefit_category_id, benefit_year,
          usage_date, usage_amount, usage_count, annual_limit, remaining_limit, limit_type
FROM ${bronze_schema}.claims__benefit_usage
QUALIFY row_number() OVER (PARTITION BY benefit_usage_id ORDER BY _ingested_at DESC) = 1;
