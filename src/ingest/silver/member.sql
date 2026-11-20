-- Contains PII. Downstream app tables carry only what an auditor needs; Genie/metric views get none.
CREATE OR REFRESH MATERIALIZED VIEW member (
  CONSTRAINT member_id_present EXPECT (member_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT plausible_dob EXPECT (date_of_birth BETWEEN DATE'1900-01-01' AND current_date())
)
COMMENT 'Members (PII). Restricted: do not expose to Genie or analytics.'
TBLPROPERTIES ('quality' = 'silver', 'contains_pii' = 'true')
AS SELECT member_id, member_number, title, first_name, middle_name, last_name, preferred_name,
          date_of_birth, gender, medicare_number, medicare_irn, medicare_expiry_date,
          address_line_1, address_line_2, suburb, state, postcode, country, email, mobile_phone,
          home_phone, australian_resident, lhc_applicable, marital_status, deceased_flag, deceased_date
FROM ${bronze_schema}.policy__member
QUALIFY row_number() OVER (PARTITION BY member_id ORDER BY _ingested_at DESC) = 1;
