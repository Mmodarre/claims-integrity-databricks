CREATE OR REFRESH MATERIALIZED VIEW admission_procedure (
  CONSTRAINT procedure_code_present EXPECT (achi_code IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'ACHI procedures coded on admissions.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT admission_procedure_id, admission_id, sequence_no, achi_code, description, is_principal
FROM ${bronze_schema}.claims__admission_procedure
QUALIFY row_number() OVER (PARTITION BY admission_procedure_id ORDER BY _ingested_at DESC) = 1;
