-- Billed lines for the auditor claim page, enriched with schedule and provider context.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.claim_line_detail (
  CONSTRAINT claim_line_id_present EXPECT (claim_line_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Billed lines of hospital claims with MBS schedule fee and provider. PK: claim_line_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'claim_line_id')
AS SELECT
  l.claim_line_id,
  l.claim_id,
  l.line_number,
  l.line_category,
  l.item_code,
  l.item_description,
  l.service_date,
  l.quantity,
  l.charge_amount,
  coalesce(l.schedule_fee, mi.schedule_fee) AS schedule_fee,
  l.benefit_amount,
  l.medicare_benefit,
  l.gap_amount,
  l.line_status,
  l.provider_id,
  pr.display_name                         AS provider_name,
  pr.provider_category,
  mi.is_assistant_item
FROM claim_line l
JOIN hospital_admission ha ON ha.claim_id = l.claim_id
LEFT JOIN mbs_item mi      ON mi.item_number = l.item_code AND l.line_category = 'mbs_item'
LEFT JOIN provider pr      ON pr.provider_id = l.provider_id;
