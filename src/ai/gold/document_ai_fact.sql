-- AI document-processing fact: one row per clinical document with what each AI stage produced.
-- Source for mv_document_ai (shows the AI pipeline itself: parse quality, extraction confidence,
-- classification agreement, findings raised).
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.document_ai_fact
COMMENT 'Per-document AI processing results: parse elements and confidence, type check, extraction, LLM review outcome. PK: document_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'document_id')
AS
WITH parse_conf AS (
  SELECT document_id, avg(confidence) AS avg_element_confidence, count(*) AS element_count,
         count_if(element_type = 'signature') > 0 AS has_signature
  FROM ${gold_schema}.document_element
  GROUP BY document_id
),
extraction AS (
  SELECT volume_path, extraction_error, extracted_at,
         aggregate(
           transform(map_values(CAST(extracted:response AS MAP<STRING, VARIANT>)),
                     v -> coalesce(v:confidence_score::DOUBLE, -1.0)),
           named_struct('s', CAST(0.0 AS DOUBLE), 'n', 0),
           (acc, c) -> CASE WHEN c >= 0 THEN named_struct('s', acc.s + c, 'n', acc.n + 1) ELSE acc END,
           acc -> CASE WHEN acc.n > 0 THEN acc.s / acc.n END) AS avg_field_confidence
  FROM operative_note_facts
  UNION ALL
  SELECT volume_path, extraction_error, extracted_at,
         aggregate(
           transform(map_values(CAST(extracted:response AS MAP<STRING, VARIANT>)),
                     v -> coalesce(v:confidence_score::DOUBLE, -1.0)),
           named_struct('s', CAST(0.0 AS DOUBLE), 'n', 0),
           (acc, c) -> CASE WHEN c >= 0 THEN named_struct('s', acc.s + c, 'n', acc.n + 1) ELSE acc END,
           acc -> CASE WHEN acc.n > 0 THEN acc.s / acc.n END)
  FROM discharge_summary_facts
),
findings AS (
  SELECT document_id,
         count(*) AS checks_evaluated,
         count_if(outcome = 'discrepancy') AS discrepancies_found,
         count_if(outcome = 'needs_information') AS information_gaps,
         count_if(outcome = 'discrepancy' AND detection_method = 'llm') AS llm_discrepancies,
         count_if(outcome = 'discrepancy' AND detection_method = 'rule') AS rule_discrepancies
  FROM ${gold_schema}.claim_finding
  GROUP BY document_id
)
SELECT
  r.document_id,
  r.claim_id,
  r.claim_number,
  r.document_type,
  p.parsed_at,
  p.parse_error IS NULL                                AS parsed_ok,
  pc.element_count,
  pc.avg_element_confidence,
  pc.has_signature,
  t.classified_document_type,
  t.classified_document_type = r.document_type         AS type_check_passed,
  e.extraction_error IS NULL AND e.volume_path IS NOT NULL AS extracted_ok,
  e.avg_field_confidence,
  v.volume_path IS NOT NULL                            AS llm_reviewed,
  coalesce(f.checks_evaluated, 0)                      AS checks_evaluated,
  coalesce(f.discrepancies_found, 0)                   AS discrepancies_found,
  coalesce(f.information_gaps, 0)                      AS information_gaps,
  coalesce(f.llm_discrepancies, 0)                     AS llm_discrepancies,
  coalesce(f.rule_discrepancies, 0)                    AS rule_discrepancies,
  t.clinical_summary,
  r.volume_path
FROM ${silver_schema}.document_registry r
LEFT JOIN document_parsed p      ON p.volume_path = r.volume_path
LEFT JOIN parse_conf pc          ON pc.document_id = r.document_id
LEFT JOIN document_text t        ON t.volume_path = r.volume_path
LEFT JOIN extraction e           ON e.volume_path = r.volume_path
LEFT JOIN document_llm_review v  ON v.volume_path = r.volume_path
LEFT JOIN findings f             ON f.document_id = r.document_id;
