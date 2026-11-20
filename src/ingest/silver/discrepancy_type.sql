CREATE OR REFRESH MATERIALIZED VIEW discrepancy_type
COMMENT 'Integrity discrepancy taxonomy (13 types) with the detection method used by the AI pipeline.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT
  type AS discrepancy_type,
  title,
  evidence_class,
  primary_document,
  intended_span_role,
  audit_type,
  difficulty,
  recovery AS recovery_rule,
  parse_json(detail):contradiction::STRING      AS contradiction_definition,
  parse_json(detail):ambiguous_variant::STRING  AS ambiguous_variant,
  CASE WHEN type IN ('same_day_overnight', 'los_overbilling', 'quantity_overstatement', 'duplicate_line',
                     'age_eligibility', 'bilateral_for_unilateral', 'device_phantom', 'assistant_phantom')
       THEN 'rule' ELSE 'llm' END               AS detection_method
FROM ${bronze_schema}.reference__integrity_discrepancy_type
QUALIFY row_number() OVER (PARTITION BY type ORDER BY _ingested_at DESC) = 1;
