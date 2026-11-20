-- One row per evaluated integrity check (claim x discrepancy type x billed line), from SQL rules and
-- LLM document reviews. Recovery is computed here in SQL:
--   line checks : fund benefit of the line x (1 - fraction of the line the documents support)
--   drg_upcoding: AR-DRG CC-split uplift from the price schedule (one per claim)
--   device/lens substitution: estimated against the device category benefit floor (flagged as estimated)
-- Lakebase sync source (PK finding_id); evidence bbox lets the apps highlight the scan.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.claim_finding (
  CONSTRAINT finding_id_present EXPECT (finding_id IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_verdict EXPECT (verdict IN ('contradiction', 'supported', 'not_documented')),
  CONSTRAINT recovery_not_negative EXPECT (recovery_aud IS NULL OR recovery_aud >= 0)
)
COMMENT 'Integrity findings per claim/check/line with verdict, outcome, SQL-computed recovery, evidence and reasoning. PK: finding_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'finding_id')
AS
WITH device_floor AS (
  SELECT lower(trim(d.category)) AS category_key, min(d.benefit_min) AS benefit_min
  FROM ${silver_schema}.admission_archetype a
  LATERAL VIEW explode(a.pl_devices) x AS d
  GROUP BY 1
),
llm_raw AS (
  SELECT v.claim_id, v.document_id, v.volume_path, v.document_type AS source_document_type, f.*
  FROM document_llm_review v
  LATERAL VIEW explode(v.review.findings) x AS f
  WHERE v.review_error IS NULL
),
llm_lines AS (
  SELECT
    r.claim_id, r.document_id, r.volume_path, r.source_document_type, r.discrepancy_type, l.claim_line_id, r.verdict,
    CASE
      WHEN r.verdict <> 'contradiction' THEN CAST(1.0 AS DOUBLE)
      WHEN r.discrepancy_type = 'quantity_overstatement' AND r.supported_quantity IS NOT NULL AND l.quantity > 0
        THEN least(CAST(1.0 AS DOUBLE), CAST(r.supported_quantity AS DOUBLE) / l.quantity)
      WHEN r.discrepancy_type = 'item_substitution' AND coalesce(mi.schedule_fee, pf.peer_schedule_fee) IS NOT NULL AND l.schedule_fee > 0
        THEN least(CAST(1.0 AS DOUBLE), CAST(coalesce(mi.schedule_fee, pf.peer_schedule_fee) / l.schedule_fee AS DOUBLE))
      WHEN r.discrepancy_type IN ('device_substitution', 'premium_iol_exploit')
        THEN CASE WHEN df.benefit_min IS NOT NULL AND l.benefit_amount > 0
                  THEN least(CAST(1.0 AS DOUBLE), CAST(df.benefit_min / l.benefit_amount AS DOUBLE)) END
      ELSE CAST(0.0 AS DOUBLE)
    END AS supported_fraction,
    CASE
      WHEN r.discrepancy_type IN ('device_substitution', 'premium_iol_exploit')
        THEN CASE WHEN df.benefit_min IS NOT NULL THEN 'estimated_device_floor' ELSE 'unvalued' END
      ELSE 'line_benefit'
    END AS recovery_basis,
    'llm' AS detection_method,
    r.documented_detail, r.reasoning, r.confidence, r.evidence_quote,
    CAST(NULL AS ARRAY<INT>) AS evidence_bbox, CAST(NULL AS INT) AS evidence_page,
    r.supported_item_code, r.supported_quantity
  FROM llm_raw r
  JOIN claim_line_context l ON l.claim_line_id = r.claim_line_id AND l.claim_id = r.claim_id
  LEFT JOIN ${silver_schema}.mbs_item mi ON mi.item_number = regexp_extract(r.supported_item_code, '([0-9]{4,6})', 1)
  LEFT JOIN item_peer_fee pf             ON pf.item_code = regexp_extract(r.supported_item_code, '([0-9]{4,6})', 1)
  LEFT JOIN device_floor df              ON df.category_key = lower(trim(l.item_description))
  WHERE r.discrepancy_type <> 'drg_upcoding'
),
llm_drg AS (
  -- The CC split is justified if ANY CC-driving diagnosis is documented.
  SELECT
    claim_id,
    max_by(document_id, confidence) AS document_id,
    max_by(volume_path, confidence) AS volume_path,
    'discharge_summary' AS source_document_type,
    'drg_upcoding' AS discrepancy_type,
    CAST(NULL AS STRING) AS claim_line_id,
    CASE WHEN array_contains(collect_set(verdict), 'supported')     THEN 'supported'
         WHEN array_contains(collect_set(verdict), 'contradiction') THEN 'contradiction'
         ELSE 'not_documented' END AS verdict,
    CAST(0.0 AS DOUBLE) AS supported_fraction,
    'drg_price_schedule' AS recovery_basis,
    'llm' AS detection_method,
    concat_ws('; ', collect_list(concat(coalesce(billed_item_code, '?'), ': ', verdict, ' - ', documented_detail))) AS documented_detail,
    concat_ws(' ', collect_list(reasoning)) AS reasoning,
    avg(confidence) AS confidence,
    max_by(evidence_quote, confidence) AS evidence_quote,
    CAST(NULL AS ARRAY<INT>) AS evidence_bbox, CAST(NULL AS INT) AS evidence_page,
    CAST(NULL AS STRING) AS supported_item_code, CAST(NULL AS INT) AS supported_quantity
  FROM llm_raw
  WHERE discrepancy_type = 'drg_upcoding'
  GROUP BY claim_id
),
rules AS (
  SELECT
    claim_id, document_id, volume_path, source_document_type, discrepancy_type, claim_line_id, verdict,
    supported_fraction, 'line_benefit' AS recovery_basis, 'rule' AS detection_method,
    documented_detail, reasoning, confidence, CAST(NULL AS STRING) AS evidence_quote,
    evidence_bbox, evidence_page, CAST(NULL AS STRING) AS supported_item_code, CAST(NULL AS INT) AS supported_quantity
  FROM document_rule_finding
),
unified AS (
  SELECT *, sha2(concat_ws('|', claim_id, discrepancy_type, coalesce(claim_line_id, '')), 256) AS finding_id
  FROM (SELECT * FROM rules UNION ALL SELECT * FROM llm_lines UNION ALL SELECT * FROM llm_drg)
  QUALIFY row_number() OVER (
    PARTITION BY claim_id, discrepancy_type, coalesce(claim_line_id, '')
    ORDER BY CASE detection_method WHEN 'rule' THEN 0 ELSE 1 END, confidence DESC NULLS LAST) = 1
),
quote_location AS (
  -- Locate an LLM's verbatim evidence quote on the scan (first parsed element containing its opening words).
  SELECT u.finding_id, e.bbox, e.page_id
  FROM unified u
  JOIN ${gold_schema}.document_element e ON e.document_id = u.document_id
  WHERE u.evidence_quote IS NOT NULL AND length(trim(u.evidence_quote)) >= 8
    AND instr(regexp_replace(lower(e.content), '\\s+', ' '),
              substring(regexp_replace(lower(trim(u.evidence_quote)), '\\s+', ' '), 1, 40)) > 0
  QUALIFY row_number() OVER (PARTITION BY u.finding_id ORDER BY e.element_index) = 1
)
SELECT
  u.finding_id,
  u.claim_id,
  ce.claim_number,
  u.discrepancy_type,
  dt.title                                                     AS discrepancy_title,
  dt.audit_type,
  u.detection_method,
  u.verdict,
  CASE u.verdict WHEN 'contradiction' THEN 'discrepancy'
                 WHEN 'not_documented' THEN 'needs_information'
                 ELSE 'supported' END                          AS outcome,
  u.claim_line_id,
  l.line_number,
  coalesce(l.item_code, CASE WHEN u.discrepancy_type = 'drg_upcoding' THEN ce.drg_code END) AS billed_item_code,
  coalesce(l.item_description, CASE WHEN u.discrepancy_type = 'drg_upcoding' THEN concat('AR-DRG ', ce.drg_code) END) AS billed_item_description,
  l.quantity                                                   AS billed_quantity,
  l.charge_amount                                              AS billed_charge_aud,
  coalesce(l.benefit_amount, dp.uplift_aud)                    AS billed_benefit_aud,
  u.supported_fraction,
  u.supported_item_code,
  u.supported_quantity,
  CAST(CASE
    WHEN u.verdict <> 'contradiction' THEN 0
    WHEN u.discrepancy_type = 'drg_upcoding' THEN dp.uplift_aud
    WHEN u.supported_fraction IS NULL THEN NULL
    ELSE round(l.benefit_amount * (1 - u.supported_fraction), 2)
  END AS DECIMAL(12, 2))                                       AS recovery_aud,
  CASE WHEN u.discrepancy_type = 'drg_upcoding' AND dp.uplift_aud IS NULL THEN 'unvalued' ELSE u.recovery_basis END AS recovery_basis,
  u.documented_detail,
  u.reasoning,
  u.confidence,
  u.evidence_quote,
  coalesce(u.evidence_bbox, ql.bbox)                           AS evidence_bbox,
  coalesce(u.evidence_page, ql.page_id)                        AS evidence_page,
  u.source_document_type,
  u.document_id,
  u.volume_path                                                AS document_volume_path,
  ce.hospital_id,
  ce.hospital_name,
  ce.region,
  ce.surgeon_provider_id,
  ce.service_date,
  CAST(date_trunc('MONTH', ce.service_date) AS DATE)           AS service_month
FROM unified u
JOIN ${silver_schema}.claim_episode ce        ON ce.claim_id = u.claim_id
LEFT JOIN claim_line_context l                 ON l.claim_line_id = u.claim_line_id
LEFT JOIN ${silver_schema}.drg_price_delta dp  ON dp.drg_cc = ce.drg_code AND u.discrepancy_type = 'drg_upcoding'
LEFT JOIN ${silver_schema}.discrepancy_type dt ON dt.discrepancy_type = u.discrepancy_type
LEFT JOIN quote_location ql                    ON ql.finding_id = u.finding_id;
