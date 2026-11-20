-- Coded diagnoses and procedures per admission, one row per code, for the auditor claim page.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.admission_coding
COMMENT 'ICD-10-AM diagnoses and ACHI procedures coded on each admission. PK: coding_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'coding_id')
AS
SELECT admission_diagnosis_id AS coding_id, admission_id, 'diagnosis' AS coding_type, sequence_no,
       icd10am_code AS code, description, is_principal, ccl
FROM admission_diagnosis
UNION ALL
SELECT admission_procedure_id, admission_id, 'procedure', sequence_no,
       achi_code, description, is_principal, CAST(NULL AS BIGINT)
FROM admission_procedure;
