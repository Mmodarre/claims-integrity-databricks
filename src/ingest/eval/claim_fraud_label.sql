-- Simulator fraud labels carried on the raw claim header. Kept out of silver/gold entirely.
CREATE OR REFRESH MATERIALIZED VIEW ${eval_schema}.claim_fraud_label
COMMENT 'GROUND TRUTH: simulator fraud labels from the raw claim header.'
TBLPROPERTIES ('quality' = 'eval')
AS SELECT claim_id, is_fraud, fraud_type, fraud_original_charge, fraud_inflation_amount,
          fraud_inflation_ratio, fraud_source_claim_id, fraud_ring_id
FROM ${bronze_schema}.claims__claim
QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY _ingested_at DESC) = 1;
