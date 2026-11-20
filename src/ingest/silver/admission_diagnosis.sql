CREATE OR REFRESH MATERIALIZED VIEW admission_diagnosis (
  CONSTRAINT diagnosis_code_present EXPECT (icd10am_code IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'ICD-10-AM diagnoses coded on admissions; ccl = complication/comorbidity level (>=3 drives DRG CC splits).'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT admission_diagnosis_id, admission_id, sequence_no, icd10am_code, description,
          is_principal, condition_onset_flag, ccl
FROM ${bronze_schema}.claims__admission_diagnosis
QUALIFY row_number() OVER (PARTITION BY admission_diagnosis_id ORDER BY _ingested_at DESC) = 1;
