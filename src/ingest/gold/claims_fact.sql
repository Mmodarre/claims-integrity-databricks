-- Executive claims fact: every claim (all types), de-identified, with the dimensions leaders slice by.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.claims_fact (
  CONSTRAINT claim_id_present EXPECT (claim_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'All claims, de-identified (no names, no DOB): amounts, status, timing, product, hospital, member state and age band.'
TBLPROPERTIES ('quality' = 'gold')
AS SELECT
  c.claim_id,
  c.claim_type,
  c.claim_status,
  c.claim_channel,
  c.service_date,
  CAST(date_trunc('MONTH', c.service_date) AS DATE)       AS service_month,
  CAST(date_trunc('WEEK', c.service_date) AS DATE)        AS service_week,
  c.lodgement_date,
  c.payment_date,
  datediff(c.lodgement_date, c.service_date)              AS days_service_to_lodgement,
  datediff(c.payment_date, c.lodgement_date)              AS days_lodgement_to_payment,
  c.total_charge,
  c.total_benefit,
  c.total_gap,
  c.excess_applied,
  c.claim_status = 'Rejected'                             AS is_rejected,
  ha.admission_id IS NOT NULL                             AS is_hospital_episode,
  ha.accommodation_type,
  ha.drg_code,
  ha.length_of_stay                                       AS length_of_stay_days,
  coalesce(ha.hospital_id, c.hospital_id)                 AS hospital_id,
  h.hospital_name,
  h.state                                                 AS hospital_state,
  c.provider_id,
  pr.provider_category,
  m.state                                                 AS member_state,
  m.gender                                                AS member_gender,
  CASE
    WHEN months_between(c.service_date, m.date_of_birth) / 12 < 18 THEN '0-17'
    WHEN months_between(c.service_date, m.date_of_birth) / 12 < 35 THEN '18-34'
    WHEN months_between(c.service_date, m.date_of_birth) / 12 < 50 THEN '35-49'
    WHEN months_between(c.service_date, m.date_of_birth) / 12 < 65 THEN '50-64'
    ELSE '65+'
  END                                                     AS member_age_band,
  p.policy_type,
  p.distribution_channel,
  prod.product_name,
  prod.product_tier_id,
  coalesce(rs.ml_flagged, false)                          AS ml_flagged
FROM claim c
LEFT JOIN hospital_admission ha            ON ha.claim_id = c.claim_id
LEFT JOIN hospital h                       ON h.hospital_id = coalesce(ha.hospital_id, c.hospital_id)
LEFT JOIN provider pr                      ON pr.provider_id = c.provider_id
LEFT JOIN member m                         ON m.member_id = c.member_id
LEFT JOIN policy p                         ON p.policy_id = c.policy_id
LEFT JOIN product prod                     ON prod.product_id = p.product_id
LEFT JOIN ${gold_schema}.claim_risk_score rs ON rs.claim_id = c.claim_id;
