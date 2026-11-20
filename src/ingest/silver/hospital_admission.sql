CREATE OR REFRESH MATERIALIZED VIEW hospital_admission (
  CONSTRAINT admission_id_present EXPECT (admission_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT discharge_after_admission EXPECT (discharge_date >= admission_date),
  CONSTRAINT los_matches_dates EXPECT (length_of_stay = datediff(discharge_date, admission_date))
)
COMMENT 'Cleaned hospital admissions (all-null columns removed; detail fields populated for integrity episodes).'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  admission_id,
  claim_id,
  hospital_id,
  admission_number,
  admission_date,
  discharge_date,
  admission_type,
  accommodation_type,
  drg_code,
  clinical_category_id,
  principal_diagnosis,
  principal_procedure,
  same_day_flag,
  care_type,
  separation_mode,
  length_of_stay,
  CAST(theatre_minutes AS INT) AS theatre_minutes,
  accommodation_charge,
  theatre_charge,
  prosthesis_charge,
  accommodation_benefit,
  theatre_benefit,
  excess_applicable,
  excess_amount,
  co_payment_amount,
  contracted_hospital,
  informed_financial_consent
FROM ${bronze_schema}.claims__hospital_admission
QUALIFY row_number() OVER (PARTITION BY admission_id ORDER BY _ingested_at DESC) = 1;
