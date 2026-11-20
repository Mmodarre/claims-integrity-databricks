-- Pipeline-private lookups (not published) used to build one feature row per hospital claim.

CREATE TEMPORARY VIEW admission_dx_summary AS
SELECT
  admission_id,
  array_sort(collect_list(CASE WHEN NOT coalesce(is_principal, false) THEN icd10am_code END)) AS additional_diagnosis_codes,
  array_sort(collect_list(CASE WHEN ccl >= 3 THEN icd10am_code END))                         AS cc_diagnosis_codes,
  max(ccl)                                                                                  AS max_ccl
FROM admission_diagnosis
GROUP BY admission_id;

CREATE TEMPORARY VIEW admission_px_summary AS
SELECT
  admission_id,
  array_sort(collect_list(CASE WHEN NOT coalesce(is_principal, false) THEN achi_code END)) AS additional_procedure_codes
FROM admission_procedure
GROUP BY admission_id;

CREATE TEMPORARY VIEW claim_line_summary AS
SELECT
  claim_id,
  array_sort(collect_list(CASE WHEN line_category = 'mbs_item' THEN item_code END))   AS mbs_item_numbers,
  array_sort(collect_list(CASE WHEN line_category = 'prosthesis' THEN item_code END)) AS prosthesis_codes,
  sum(CASE WHEN line_category = 'accommodation' THEN quantity ELSE 0 END)             AS accommodation_units_billed,
  count(*)                                                                            AS line_count
FROM claim_line
GROUP BY claim_id;

CREATE TEMPORARY VIEW claim_surgeon AS
SELECT claim_id, provider_id AS surgeon_provider_id
FROM medical_service
WHERE provider_type = 'Surgeon'
QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY mbs_schedule_fee DESC, medical_service_id) = 1;
