CREATE OR REFRESH MATERIALIZED VIEW mbs_item (
  CONSTRAINT item_number_present EXPECT (item_number IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'MBS item schedule with derived assistant-surgeon flag.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT mbs_item_id, item_number, item_description, category_id, schedule_fee, benefit_75, benefit_85,
          is_anaes_applicable, is_assist_applicable, multiple_procedure_rule, is_derived_fee,
          derived_fee_rule, effective_date, is_active,
          lower(item_description) LIKE 'surgical assistant%' AS is_assistant_item
FROM ${bronze_schema}.reference__mbs_item
QUALIFY row_number() OVER (PARTITION BY item_number ORDER BY effective_date DESC, _ingested_at DESC) = 1;
