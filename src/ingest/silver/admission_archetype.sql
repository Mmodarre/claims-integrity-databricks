CREATE OR REFRESH MATERIALIZED VIEW admission_archetype
COMMENT 'Admission archetypes: principal procedure, DRG base/CC split, CC-driving diagnoses, typical LOS.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT
  archetype_id, name, scenario, principal_diagnosis_code, principal_procedure_code,
  drg_base, drg_cc, same_day, theatre_band, typical_los_min, typical_los_max,
  transform(
    CAST(parse_json(detail):cc_drivers AS ARRAY<VARIANT>),
    d -> named_struct('icd10am', d:icd10am::STRING, 'description', d:desc::STRING, 'ccl', d:ccl::INT)
  ) AS cc_drivers,
  transform(
    CAST(parse_json(detail):pl_devices AS ARRAY<VARIANT>),
    d -> named_struct('category', d:category::STRING,
                      'benefit_min', CAST(d:benefit_min::DOUBLE AS DECIMAL(10, 2)),
                      'benefit_max', CAST(d:benefit_max::DOUBLE AS DECIMAL(10, 2)))
  ) AS pl_devices,
  CAST(parse_json(detail):applicable_discrepancies AS ARRAY<STRING>) AS applicable_discrepancies
FROM ${bronze_schema}.reference__admission_archetype
QUALIFY row_number() OVER (PARTITION BY archetype_id ORDER BY _ingested_at DESC) = 1;
