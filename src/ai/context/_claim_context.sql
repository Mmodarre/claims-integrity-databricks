-- Pipeline-private claim context shared by the AI triage, the document reviews and the rule checks.
-- Everything here is de-identified (no names, Medicare numbers or DOB) and label-free.

-- Typical (modal) schedule fee per MBS item across all claims. A line billed at ~1.5x its peer
-- fee carries the bilateral loading; this is how bilateral billing shows up in the claim data.
CREATE TEMPORARY VIEW item_peer_fee AS
SELECT item_code, mode(schedule_fee) AS peer_schedule_fee
FROM ${silver_schema}.claim_line
WHERE line_category = 'mbs_item' AND schedule_fee IS NOT NULL
GROUP BY item_code;

-- Prescribed List benefit range per device category (archetype reference).
CREATE TEMPORARY VIEW device_category_range AS
SELECT lower(trim(d.category)) AS category_key, min(d.benefit_min) AS category_benefit_min, max(d.benefit_max) AS category_benefit_max
FROM ${silver_schema}.admission_archetype a
LATERAL VIEW explode(a.pl_devices) x AS d
GROUP BY 1;

-- Billed lines of hospital claims with admission context and derived signals.
CREATE TEMPORARY VIEW claim_line_context AS
SELECT
  l.claim_line_id,
  l.claim_id,
  l.line_number,
  l.line_category,
  l.item_code,
  l.item_description,
  l.service_date,
  l.quantity,
  l.charge_amount,
  l.schedule_fee,
  l.benefit_amount,
  pf.peer_schedule_fee,
  CASE WHEN l.line_category = 'mbs_item' AND pf.peer_schedule_fee > 0
       THEN round(l.schedule_fee / pf.peer_schedule_fee, 3) END                    AS fee_loading_ratio,
  coalesce(mi.is_assistant_item, false)
    OR lower(l.item_description) LIKE 'surgical assistant%'                         AS is_assistant_item,
  CAST(regexp_extract(lower(l.item_description), 'under ([0-9]+) years', 1) AS INT) AS item_max_age_exclusive,
  CAST(nullif(regexp_extract(lower(l.item_description), '(?:>= ?|aged |patient )([0-9]+) years( or over)?', 1), '') AS INT) AS item_min_age,
  ha.admission_id,
  ha.admission_date,
  ha.discharge_date,
  ha.length_of_stay,
  ha.same_day_flag,
  ha.drg_code,
  dc.category_benefit_min,
  dc.category_benefit_max
FROM ${silver_schema}.claim_line l
JOIN ${silver_schema}.hospital_admission ha ON ha.claim_id = l.claim_id
LEFT JOIN item_peer_fee pf                ON pf.item_code = l.item_code
LEFT JOIN ${silver_schema}.mbs_item mi    ON mi.item_number = l.item_code AND l.line_category = 'mbs_item'
LEFT JOIN device_category_range dc        ON dc.category_key = lower(trim(l.item_description)) AND l.line_category = 'prosthesis';

-- One prompt-ready, de-identified text rendering of each hospital claim.
CREATE TEMPORARY VIEW claim_prompt_context AS
WITH dx AS (
  SELECT admission_id,
         array_join(transform(array_sort(collect_list(named_struct(
           'seq', sequence_no,
           'txt', concat(icd10am_code, ' ', description, CASE WHEN is_principal THEN ' [principal]' ELSE '' END,
                         ' (CCL ', coalesce(CAST(ccl AS STRING), '0'), ')')))), x -> x.txt), '; ') AS dx_text
  FROM ${silver_schema}.admission_diagnosis
  GROUP BY admission_id
),
px AS (
  SELECT admission_id,
         array_join(transform(array_sort(collect_list(named_struct(
           'seq', sequence_no,
           'txt', concat(achi_code, ' ', description, CASE WHEN is_principal THEN ' [principal]' ELSE '' END)))), x -> x.txt), '; ') AS px_text
  FROM ${silver_schema}.admission_procedure
  GROUP BY admission_id
),
ln AS (
  SELECT claim_id,
         array_join(transform(array_sort(collect_list(named_struct(
           'n', line_number,
           'txt', concat('- line_id=', claim_line_id, ' | item ', item_code, ' | ', coalesce(item_description, ''),
                         ' | qty ', quantity,
                         ' | schedule fee ', coalesce(CAST(schedule_fee AS STRING), 'n/a'),
                         CASE WHEN fee_loading_ratio IS NOT NULL AND fee_loading_ratio <> 1
                              THEN concat(' (peer typical ', peer_schedule_fee, ', ', fee_loading_ratio, 'x)') ELSE '' END,
                         ' | charge ', charge_amount, ' | benefit paid ', benefit_amount,
                         CASE WHEN category_benefit_max IS NOT NULL
                              THEN concat(' (typical Prescribed List benefit for this device category ', category_benefit_min,
                                          '-', category_benefit_max, ')') ELSE '' END)))), x -> x.txt), '\n') AS lines_text
  FROM claim_line_context
  GROUP BY claim_id
)
SELECT
  e.claim_id,
  e.claim_number,
  e.drg_code,
  e.cc_diagnosis_codes,
  -- Reference knowledge (not labels): is the claim grouped to the CC split of its procedure's DRG,
  -- and which diagnoses typically drive that split.
  (a.drg_cc IS NOT NULL AND e.drg_code = a.drg_cc)                                  AS is_cc_split,
  a.drg_base,
  array_join(transform(a.cc_drivers, d -> concat(d.icd10am, ' ', d.description, ' (CCL ', d.ccl, ')')), '; ') AS typical_cc_drivers,
  coalesce(dx.dx_text, 'none')                                                      AS coded_diagnoses_text,
  concat_ws('\n',
    concat('Claim number: ', e.claim_number, ' | Status: ', e.claim_status),
    concat('Hospital: ', e.hospital_name, ' (', e.region, ')'),
    concat('Admission date: ', e.admission_date, ' | Discharge date: ', e.discharge_date,
           ' | Length of stay billed (nights): ', e.length_of_stay_days,
           ' | Same-day flag: ', coalesce(CAST(e.same_day_flag AS STRING), 'not recorded')),
    concat('Accommodation type: ', e.accommodation_type, ' | Admission type: ', coalesce(e.admission_type, 'n/a'),
           ' | Care type: ', coalesce(e.care_type, 'n/a')),
    concat('Patient: age ', coalesce(CAST(e.patient_age AS STRING), 'unknown'), ', sex ', coalesce(e.patient_sex, 'unknown')),
    concat('AR-DRG: ', coalesce(e.drg_code, 'n/a')),
    CASE WHEN a.archetype_id IS NOT NULL
         THEN concat('Typical stay for this principal procedure: ', a.typical_los_min, '-', a.typical_los_max,
                     ' nights', CASE WHEN a.same_day THEN ' (normally same-day)' ELSE '' END) END,
    concat('Principal diagnosis: ', coalesce(e.principal_diagnosis_code, 'n/a'),
           ' | Principal procedure: ', coalesce(e.principal_procedure_code, 'n/a')),
    concat('Coded diagnoses: ', coalesce(dx.dx_text, 'none')),
    concat('Coded procedures: ', coalesce(px.px_text, 'none')),
    'Billed lines:',
    coalesce(ln.lines_text, '(none)'),
    concat('Totals: charged AUD ', e.total_claim_amount_aud, ' | benefit paid AUD ', e.benefit_paid_aud,
           ' | member gap AUD ', e.gap_aud)
  ) AS claim_text
FROM ${silver_schema}.claim_episode e
LEFT JOIN dx ON dx.admission_id = e.admission_id
LEFT JOIN px ON px.admission_id = e.admission_id
LEFT JOIN ln ON ln.claim_id = e.claim_id
LEFT JOIN (
  SELECT * FROM ${silver_schema}.admission_archetype
  QUALIFY row_number() OVER (PARTITION BY principal_procedure_code ORDER BY archetype_id) = 1
) a ON a.principal_procedure_code = e.principal_procedure_code;

-- Audit playbook for the LLM checks, straight from the governed discrepancy taxonomy: what counts as a
-- contradiction vs a documentation gap for each discrepancy type.
CREATE TEMPORARY VIEW audit_playbook AS
SELECT array_join(array_sort(collect_list(concat(
         '- ', discrepancy_type, ': CONTRADICTION = ', contradiction_definition,
         ' | DOCUMENTATION GAP (verdict not_documented) = ', ambiguous_variant))), '\n') AS playbook_text
FROM ${silver_schema}.discrepancy_type
WHERE detection_method = 'llm';
