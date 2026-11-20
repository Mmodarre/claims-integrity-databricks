-- Deterministic rule checks: exact comparisons between ai_extract facts and billed lines.
-- Each row = one (check, billed line) evaluation with verdict, the fraction of the line the documents
-- support (drives SQL recovery), and the citation bounding box of the evidence on the scan.
CREATE OR REFRESH MATERIALIZED VIEW document_rule_finding
COMMENT 'Rule-based integrity checks (dates, stay, age, assistant, laterality, device absence, duplicates) with cited evidence.'
TBLPROPERTIES ('quality' = 'silver')
AS
WITH ds AS (
  SELECT r.claim_id, r.document_id, f.*
  FROM discharge_summary_facts f
  JOIN ${silver_schema}.document_registry r ON r.volume_path = f.volume_path
),
op AS (
  SELECT r.claim_id, r.document_id, f.*
  FROM operative_note_facts f
  JOIN ${silver_schema}.document_registry r ON r.volume_path = f.volume_path
),
same_day_overnight AS (
  SELECT
    l.claim_id, d.document_id, d.volume_path, 'discharge_summary' AS source_document_type,
    'same_day_overnight' AS discrepancy_type, l.claim_line_id,
    -- Explicit admission/separation dates outrank narrative phrases ("same day discharge").
    -- Playbook: a same-date discharge WITH a discharge time refutes the overnight; a missing discharge
    -- time is a documentation gap. Explicit dates outrank narrative phrases.
    CASE
      WHEN d.admission_date IS NOT NULL AND d.separation_date = d.admission_date
           AND nullif(trim(d.separation_time), '') IS NOT NULL                 THEN 'contradiction'
      WHEN d.admission_date IS NOT NULL AND d.separation_date = d.admission_date THEN 'not_documented'
      WHEN d.admission_date IS NOT NULL AND d.separation_date > d.admission_date
           AND nullif(trim(d.separation_time), '') IS NOT NULL                 THEN 'supported'
      WHEN d.admission_date IS NOT NULL AND d.separation_date > d.admission_date THEN 'not_documented'
      WHEN d.same_day_stated = 'yes'                                           THEN 'not_documented'
      WHEN d.same_day_stated = 'no'                                            THEN 'supported'
      ELSE 'not_documented'
    END AS verdict,
    CAST(0.0 AS DOUBLE) AS supported_fraction,
    concat('Admitted ', coalesce(CAST(d.admission_date AS STRING), 'not stated'), coalesce(concat(' ', d.admission_time), ''),
           ', separated ', coalesce(CAST(d.separation_date AS STRING), 'not stated'), coalesce(concat(' ', d.separation_time), ''),
           ', same-day stated: ', coalesce(d.same_day_stated, 'not_stated')) AS documented_detail,
    concat('Overnight accommodation line billed (', l.item_description, ', benefit AUD ', l.benefit_amount,
           '); discharge summary records ', coalesce(CAST(d.admission_date AS STRING), '?'), ' to ',
           coalesce(CAST(d.separation_date AS STRING), '?')) AS reasoning,
    CAST(d.extracted:response:admission_date:citation_ids AS ARRAY<INT>) AS citation_ids,
    d.extracted:metadata:citations AS citations,
    d.extracted:response:separation_date:confidence_score::DOUBLE AS confidence
  FROM claim_line_context l
  JOIN ds d ON d.claim_id = l.claim_id
  WHERE l.line_category = 'accommodation' AND lower(l.item_description) LIKE '%(overnight)%'
),
los AS (
  SELECT
    l.*, d.document_id, d.volume_path, d.admission_date AS doc_admission_date, d.separation_date AS doc_separation_date,
    d.stated_length_of_stay_days, d.extracted,
    coalesce(datediff(d.separation_date, d.admission_date), d.stated_length_of_stay_days) AS documented_nights
  FROM claim_line_context l
  JOIN ds d ON d.claim_id = l.claim_id
  WHERE l.line_category = 'accommodation' AND lower(l.item_description) RLIKE 'extra nights?'
),
los_overbilling AS (
  SELECT
    claim_id, document_id, volume_path, 'discharge_summary', 'los_overbilling', claim_line_id,
    CASE
      WHEN documented_nights IS NULL                     THEN 'not_documented'
      WHEN length_of_stay - documented_nights <= 0       THEN 'supported'
      ELSE 'contradiction'
    END,
    CASE
      WHEN documented_nights IS NULL OR length_of_stay - documented_nights <= 0 THEN CAST(1.0 AS DOUBLE)
      WHEN length_of_stay - documented_nights >= quantity THEN CAST(0.0 AS DOUBLE)
      ELSE CAST(quantity - (length_of_stay - documented_nights) AS DOUBLE) / quantity
    END,
    concat('Documented stay: ', coalesce(CAST(documented_nights AS STRING), 'not stated'), ' night(s) (',
           coalesce(CAST(doc_admission_date AS STRING), '?'), ' to ', coalesce(CAST(doc_separation_date AS STRING), '?'), ')'),
    concat('Claim bills ', length_of_stay, ' night(s) including ', quantity, ' extra night(s) (benefit AUD ', benefit_amount,
           '); discharge summary documents ', coalesce(CAST(documented_nights AS STRING), 'no'), ' night(s)'),
    CAST(extracted:response:separation_date:citation_ids AS ARRAY<INT>),
    extracted:metadata:citations,
    extracted:response:separation_date:confidence_score::DOUBLE
  FROM los
),
age_eligibility AS (
  -- Age evidence in the record: explicit numeric age, explicit adult/child wording, record DOB. Decide on
  -- evidence that agrees; when the record contradicts itself (e.g. body says child, header DOB says adult)
  -- the auditor must clarify -> not_documented.
  SELECT
    claim_id, document_id, volume_path, 'discharge_summary', 'age_eligibility', claim_line_id,
    CASE
      WHEN resolved_age IS NULL AND age_conflict THEN 'not_documented'
      WHEN resolved_age IS NULL AND age_category_stated = 'adult' AND item_max_age_exclusive <= 18 THEN 'contradiction'
      WHEN resolved_age IS NULL THEN 'not_documented'
      WHEN (item_max_age_exclusive IS NOT NULL AND resolved_age >= item_max_age_exclusive)
        OR (item_min_age IS NOT NULL AND resolved_age < item_min_age) THEN 'contradiction'
      ELSE 'supported'
    END,
    CAST(0.0 AS DOUBLE),
    concat('Record age evidence - stated age: ', coalesce(CAST(patient_age_years AS STRING), 'none'),
           ', stated category: ', coalesce(age_category_stated, 'not_stated'),
           ', DOB-derived age: ', coalesce(CAST(dob_age AS STRING), 'none'),
           CASE WHEN age_conflict THEN ' (conflicting)' ELSE '' END),
    concat('Item ', item_code, ' (', item_description, ') is restricted to ',
           CASE WHEN item_max_age_exclusive IS NOT NULL THEN concat('patients under ', item_max_age_exclusive)
                ELSE concat('patients ', item_min_age, ' or over') END,
           CASE WHEN resolved_age IS NOT NULL THEN concat('; the record establishes age ', resolved_age)
                WHEN age_conflict THEN '; the record gives conflicting age evidence - clarify with the hospital'
                WHEN age_category_stated = 'adult' THEN '; the record states the patient is an adult'
                ELSE '; the record gives no age' END),
    citation_ids,
    citations,
    confidence
  FROM (
    SELECT
      e.*,
      CASE
        WHEN dob_age IS NOT NULL AND age_category_stated = 'adult' AND dob_age >= 18 THEN dob_age
        WHEN dob_age IS NOT NULL AND age_category_stated = 'child' AND dob_age < 18  THEN dob_age
        WHEN dob_age IS NOT NULL AND patient_age_years IS NOT NULL AND abs(dob_age - patient_age_years) <= 2 THEN patient_age_years
        WHEN dob_age IS NULL AND patient_age_years IS NOT NULL
             AND NOT (age_category_stated = 'adult' AND patient_age_years < 18)
             AND NOT (age_category_stated = 'child' AND patient_age_years >= 18) THEN patient_age_years
        WHEN patient_age_years IS NULL AND age_category_stated = 'not_stated' THEN dob_age
      END AS resolved_age,
      (dob_age IS NOT NULL AND patient_age_years IS NOT NULL AND abs(dob_age - patient_age_years) > 2)
        OR (dob_age IS NOT NULL AND age_category_stated = 'adult' AND dob_age < 18)
        OR (dob_age IS NOT NULL AND age_category_stated = 'child' AND dob_age >= 18) AS age_conflict
    FROM (
      SELECT
        l.claim_id, l.claim_line_id, l.item_code, l.item_description, l.item_max_age_exclusive, l.item_min_age,
        d.document_id, d.volume_path, d.patient_age_years, coalesce(d.age_category_stated, 'not_stated') AS age_category_stated,
        CAST(floor(months_between(coalesce(d.admission_date, l.admission_date), d.patient_dob) / 12) AS INT) AS dob_age,
        CAST(coalesce(d.extracted:response:age_category_stated:citation_ids, d.extracted:response:patient_dob:citation_ids,
                      d.extracted:response:patient_age_years:citation_ids) AS ARRAY<INT>) AS citation_ids,
        d.extracted:metadata:citations AS citations,
        coalesce(d.extracted:response:age_category_stated:confidence_score::DOUBLE,
                 d.extracted:response:patient_dob:confidence_score::DOUBLE) AS confidence
      FROM claim_line_context l
      JOIN ds d ON d.claim_id = l.claim_id
      WHERE l.line_category = 'mbs_item' AND (l.item_max_age_exclusive IS NOT NULL OR l.item_min_age IS NOT NULL)
    ) e
  )
),
assistant_phantom AS (
  SELECT
    l.claim_id, o.document_id, o.volume_path, 'operative_note', 'assistant_phantom', l.claim_line_id,
    CASE o.assistant_surgeon_present WHEN 'no' THEN 'contradiction' WHEN 'yes' THEN 'supported' ELSE 'not_documented' END,
    CAST(0.0 AS DOUBLE),
    concat('Assistant: ', coalesce(nullif(o.assistant_statement, ''), 'no assistant recorded'),
           ' (extracted: ', coalesce(o.assistant_surgeon_present, 'not_documented'), ')'),
    concat('Surgical-assistant item ', l.item_code, ' billed (benefit AUD ', l.benefit_amount, '); operative note: ',
           coalesce(nullif(o.assistant_statement, ''), 'operating team records no assistant')),
    CAST(coalesce(o.extracted:response:assistant_statement:citation_ids, o.extracted:response:assistant_surgeon_present:citation_ids) AS ARRAY<INT>),
    o.extracted:metadata:citations,
    o.extracted:response:assistant_surgeon_present:confidence_score::DOUBLE
  FROM claim_line_context l
  JOIN op o ON o.claim_id = l.claim_id
  WHERE l.line_category = 'mbs_item' AND l.is_assistant_item
),
bilateral_for_unilateral AS (
  SELECT
    l.claim_id, o.document_id, o.volume_path, 'operative_note', 'bilateral_for_unilateral', l.claim_line_id,
    -- Contradiction only when the operation-performed line itself records one side; a side mentioned
    -- only in findings/diagnosis is not documentation of the operation performed -> needs information.
    CASE
      WHEN o.laterality IN ('left', 'right') AND o.title_side IS NOT NULL THEN 'contradiction'
      WHEN o.laterality = 'bilateral'                                    THEN 'supported'
      ELSE 'not_documented'
    END,
    CASE WHEN o.laterality IN ('left', 'right') AND o.title_side IS NOT NULL
         THEN 1.0 / l.fee_loading_ratio ELSE CAST(1.0 AS DOUBLE) END,
    concat('Documented laterality: ', coalesce(o.laterality, 'not_stated'),
           CASE WHEN o.title_side IS NULL THEN ' (side not stated in the operation performed)' ELSE '' END,
           ' - ', coalesce(o.operation_title, '')),
    concat('Item ', l.item_code, ' billed at ', l.schedule_fee, ' = ', l.fee_loading_ratio, 'x the peer fee ',
           l.peer_schedule_fee, ' (bilateral loading); operative note documents ', coalesce(o.laterality, 'no'), ' side'),
    CAST(o.extracted:response:laterality:citation_ids AS ARRAY<INT>),
    o.extracted:metadata:citations,
    o.extracted:response:laterality:confidence_score::DOUBLE
  FROM claim_line_context l
  JOIN (
    SELECT *, nullif(regexp_extract(lower(operation_title), '(\\bright\\b|\\bleft\\b|\\(r\\)|\\(l\\))', 1), '') AS title_side
    FROM op
  ) o ON o.claim_id = l.claim_id
  -- Bilateral loading = exactly 1.5x the item fee; anaesthesia fees vary with time units, so excluded.
  WHERE l.line_category = 'mbs_item' AND l.fee_loading_ratio BETWEEN 1.48 AND 1.52
    AND lower(l.item_description) NOT LIKE 'anaesthesia%'
),
device_phantom AS (
  -- Only when the note records no implants at all; with other implants recorded the LLM matches devices.
  SELECT
    l.claim_id, o.document_id, o.volume_path, 'operative_note', 'device_phantom', l.claim_line_id,
    CASE WHEN coalesce(o.no_implant_statement, false) THEN 'contradiction' ELSE 'not_documented' END,
    CAST(0.0 AS DOUBLE),
    CASE WHEN coalesce(o.no_implant_statement, false) THEN 'Operative note states no implant/prosthesis was used'
         ELSE 'Operative note records no implants' END,
    concat('Prescribed List device ', l.item_code, ' (', l.item_description, ', benefit AUD ', l.benefit_amount,
           ') billed; operative note records no implanted device'),
    CAST(o.extracted:response:no_implant_statement:citation_ids AS ARRAY<INT>),
    o.extracted:metadata:citations,
    o.extracted:response:no_implant_statement:confidence_score::DOUBLE
  FROM claim_line_context l
  JOIN op o ON o.claim_id = l.claim_id
  WHERE l.line_category = 'prosthesis' AND size(o.implants) = 0
),
duplicate_line AS (
  SELECT
    l.claim_id, o.document_id, o.volume_path, 'operative_note', 'duplicate_line', l.claim_line_id,
    'contradiction', CAST(0.0 AS DOUBLE),
    concat('Operative note documents one operation on ', coalesce(CAST(o.operation_date AS STRING), 'the service date')),
    concat('Item ', l.item_code, ' billed more than once on ', l.service_date, ' (duplicate line ', l.line_number, ')'),
    CAST(o.extracted:response:operation_title:citation_ids AS ARRAY<INT>),
    o.extracted:metadata:citations,
    o.extracted:response:operation_title:confidence_score::DOUBLE
  FROM (
    SELECT *, row_number() OVER (PARTITION BY claim_id, item_code, service_date ORDER BY line_number) AS occurrence
    FROM claim_line_context
    WHERE line_category = 'mbs_item'
  ) l
  JOIN op o ON o.claim_id = l.claim_id
  WHERE l.occurrence > 1
),
all_rules AS (
  SELECT * FROM same_day_overnight
  UNION ALL SELECT * FROM los_overbilling
  UNION ALL SELECT * FROM age_eligibility
  UNION ALL SELECT * FROM assistant_phantom
  UNION ALL SELECT * FROM bilateral_for_unilateral
  UNION ALL SELECT * FROM device_phantom
  UNION ALL SELECT * FROM duplicate_line
)
SELECT
  claim_id,
  document_id,
  volume_path,
  source_document_type,
  discrepancy_type,
  claim_line_id,
  verdict,
  greatest(CAST(0.0 AS DOUBLE), least(CAST(1.0 AS DOUBLE), supported_fraction)) AS supported_fraction,
  documented_detail,
  reasoning,
  confidence,
  -- first cited region of the evidence field on the scan
  CAST(get(filter(CAST(citations AS ARRAY<VARIANT>), c -> c:id::INT = get(citation_ids, 0)), 0):bbox[0]:coord AS ARRAY<INT>) AS evidence_bbox,
  get(filter(CAST(citations AS ARRAY<VARIANT>), c -> c:id::INT = get(citation_ids, 0)), 0):bbox[0]:page_id::INT AS evidence_page
FROM all_rules;
