CREATE OR REFRESH MATERIALIZED VIEW medical_service (
  CONSTRAINT medical_service_id_present EXPECT (medical_service_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'In-hospital medical services billed against MBS items (all-null columns removed).'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT medical_service_id, claim_id, admission_id, mbs_item_number, mbs_item_description,
          mbs_schedule_fee, provider_id, provider_type, provider_number, service_date, service_text,
          charge_amount, medicare_benefit, fund_benefit, gap_amount, no_gap_indicator,
          gap_cover_scheme, clinical_category_id, multiple_service_rule_applied
FROM ${bronze_schema}.claims__medical_service
QUALIFY row_number() OVER (PARTITION BY medical_service_id ORDER BY _ingested_at DESC) = 1;
