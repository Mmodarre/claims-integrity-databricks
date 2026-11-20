CREATE OR REFRESH MATERIALIZED VIEW prosthesis_claim (
  CONSTRAINT prosthesis_claim_id_present EXPECT (prosthesis_claim_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT positive_quantity EXPECT (quantity > 0)
)
COMMENT 'Prescribed List prosthesis claims.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT prosthesis_claim_id, claim_id, admission_id, prosthesis_item_id, billing_code,
          item_description, quantity, charge_amount, benefit_amount, gap_amount, implant_date
FROM ${bronze_schema}.claims__prosthesis_claim
QUALIFY row_number() OVER (PARTITION BY prosthesis_claim_id ORDER BY _ingested_at DESC) = 1;
