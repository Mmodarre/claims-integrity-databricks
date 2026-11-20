CREATE OR REFRESH MATERIALIZED VIEW claim_line (
  CONSTRAINT claim_line_id_present EXPECT (claim_line_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT positive_quantity EXPECT (quantity > 0),
  CONSTRAINT charge_non_negative EXPECT (charge_amount >= 0),
  CONSTRAINT benefit_non_negative EXPECT (benefit_amount >= 0)
)
COMMENT 'Cleaned claim lines: MBS items, accommodation (ACCOM), theatre, Prescribed List devices.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  claim_line_id,
  claim_id,
  line_number,
  item_code,
  item_description,
  CASE
    WHEN item_code = 'ACCOM'   THEN 'accommodation'
    WHEN item_code = 'THEATRE' THEN 'theatre'
    WHEN item_code RLIKE '^[0-9]{3,6}$' THEN 'mbs_item'
    WHEN item_code RLIKE '^(PL|PH)[A-Z0-9]+$' THEN 'prosthesis'
    ELSE 'other'
  END                                   AS line_category,
  CAST(clinical_category_id AS BIGINT)  AS clinical_category_id,
  CAST(benefit_category_id AS BIGINT)   AS benefit_category_id,
  service_date,
  quantity,
  charge_amount,
  schedule_fee,
  benefit_amount,
  medicare_benefit,
  gap_amount,
  line_status,
  CAST(rejection_reason_id AS BIGINT)   AS rejection_reason_id,
  CAST(provider_id AS BIGINT)           AS provider_id,
  provider_number,
  tooth_number
FROM ${bronze_schema}.claims__claim_line
QUALIFY row_number() OVER (PARTITION BY claim_line_id ORDER BY _ingested_at DESC) = 1;
