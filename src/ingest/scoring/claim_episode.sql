-- One de-identified feature row per hospital claim (claim + admission + hospital + coded episode).
-- Streaming over silver.claim with stream-static joins, so each claim flows downstream once.
CREATE OR REFRESH STREAMING TABLE claim_episode (
  CONSTRAINT has_admission EXPECT (admission_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT has_hospital EXPECT (hospital_name IS NOT NULL)
)
COMMENT 'Hospital claim episodes: claim + admission + hospital + coded diagnoses/procedures/items. No PII, no labels.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  c.claim_id,
  c.claim_number,
  c.member_id,
  c.policy_id,
  c.claim_status,
  c.service_date,
  c.lodgement_date,
  ha.admission_id,
  ha.hospital_id,
  h.hospital_code,
  h.hospital_name,
  h.state                                                         AS region,
  s.surgeon_provider_id,
  ha.admission_date,
  ha.discharge_date,
  ha.length_of_stay                                               AS length_of_stay_days,
  ha.same_day_flag,
  ha.admission_type,
  ha.accommodation_type,
  ha.care_type,
  ha.separation_mode,
  ha.drg_code,
  ha.principal_diagnosis                                          AS principal_diagnosis_code,
  ha.principal_procedure                                          AS principal_procedure_code,
  ha.theatre_minutes,
  CAST(floor(months_between(ha.admission_date, m.date_of_birth) / 12) AS INT) AS patient_age,
  m.gender                                                        AS patient_sex,
  dx.additional_diagnosis_codes,
  dx.cc_diagnosis_codes,
  dx.max_ccl,
  px.additional_procedure_codes,
  ls.mbs_item_numbers,
  ls.prosthesis_codes,
  ls.accommodation_units_billed,
  ls.line_count,
  ha.accommodation_charge                                         AS accommodation_charge_aud,
  ha.theatre_charge                                               AS theatre_charge_aud,
  ha.prosthesis_charge                                            AS prosthesis_charge_aud,
  c.total_charge                                                  AS total_claim_amount_aud,
  c.total_benefit                                                 AS benefit_paid_aud,
  c.total_gap                                                     AS gap_aud
FROM STREAM(claim) c
JOIN hospital_admission ha          ON ha.claim_id = c.claim_id
LEFT JOIN hospital h                ON h.hospital_id = ha.hospital_id
LEFT JOIN member m                  ON m.member_id = c.member_id
LEFT JOIN admission_dx_summary dx   ON dx.admission_id = ha.admission_id
LEFT JOIN admission_px_summary px   ON px.admission_id = ha.admission_id
LEFT JOIN claim_line_summary ls     ON ls.claim_id = c.claim_id
LEFT JOIN claim_surgeon s           ON s.claim_id = c.claim_id;
