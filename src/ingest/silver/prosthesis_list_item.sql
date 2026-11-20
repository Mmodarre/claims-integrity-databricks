CREATE OR REFRESH MATERIALIZED VIEW prosthesis_list_item
COMMENT 'Prescribed List devices with benefit ranges.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT prosthesis_item_id, prosthesis_category_id, billing_code, item_name, manufacturer, brand_name,
          minimum_benefit, maximum_benefit, no_gap_benefit, effective_date, end_date, is_current,
          requires_clinical_justification
FROM ${bronze_schema}.reference__prosthesis_list_item
QUALIFY row_number() OVER (PARTITION BY prosthesis_item_id ORDER BY _ingested_at DESC) = 1;
