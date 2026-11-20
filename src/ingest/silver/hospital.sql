-- Hospitals. The synthetic reference data was generated with real facility names, ABNs and contact
-- details; this demo publishes AI risk rankings and narratives per hospital, so facilities are
-- pseudonymised here (neutral code + name) and identifying contact/location fields are dropped.
-- Every downstream table, app and Genie answer therefore only ever sees the pseudonym.
CREATE OR REFRESH MATERIALIZED VIEW hospital (
  CONSTRAINT hospital_id_present EXPECT (hospital_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Hospitals, pseudonymised (code/name derived from hospital_id; no ABN, address, coordinates). State is the region key.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT
  hospital_id,
  concat('H', lpad(CAST(hospital_id AS STRING), 3, '0'))                         AS hospital_code,
  concat(state, ' Hospital ', lpad(CAST(hospital_id AS STRING), 3, '0'))         AS hospital_name,
  hospital_type_id,
  state,
  total_beds,
  emergency_department,
  icu_available,
  maternity_available,
  is_contracted,
  status
FROM ${bronze_schema}.reference__hospital
QUALIFY row_number() OVER (PARTITION BY hospital_id ORDER BY _ingested_at DESC) = 1;
