CREATE OR REFRESH MATERIALIZED VIEW product
COMMENT 'Insurance products.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT product_id, product_code, product_name, product_type_id,
          CAST(product_tier_id AS INT) AS product_tier_id, description, is_hospital, is_extras,
          is_ambulance, default_excess, status, effective_date, end_date,
          CAST(min_age AS INT) AS min_age, CAST(max_age AS INT) AS max_age,
          available_policy_types, is_community_rated, government_rebate_eligible
FROM ${bronze_schema}.reference__product
QUALIFY row_number() OVER (PARTITION BY product_id ORDER BY _ingested_at DESC) = 1;
