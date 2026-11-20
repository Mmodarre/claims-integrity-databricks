-- Per-claim roll-up of the document review (deterministic, no LLM): what the received documents say
-- about the claim, the identified recovery, and a narrative assembled from the findings.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.claim_document_review (
  CONSTRAINT claim_id_present EXPECT (claim_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Per-claim document review outcome: discrepancy_confirmed / needs_more_information / documents_support_claim, recovery, narrative, AI summaries. PK: claim_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'claim_id')
AS
WITH docs AS (
  SELECT
    r.claim_id,
    first(r.claim_number) AS claim_number,
    count(*) AS documents_received,
    array_sort(collect_list(r.document_type)) AS document_types,
    max(CASE WHEN r.document_type = 'discharge_summary' THEN t.clinical_summary END) AS discharge_summary_ai_summary,
    max(CASE WHEN r.document_type = 'operative_note' THEN t.clinical_summary END)    AS operative_note_ai_summary,
    max(CASE WHEN r.document_type = 'operative_note' THEN v.review.document_assessment END)    AS operative_note_assessment,
    max(CASE WHEN r.document_type = 'discharge_summary' THEN v.review.document_assessment END) AS discharge_summary_assessment
  FROM ${silver_schema}.document_registry r
  LEFT JOIN document_text t        ON t.volume_path = r.volume_path
  LEFT JOIN document_llm_review v  ON v.volume_path = r.volume_path
  GROUP BY r.claim_id
),
f AS (
  SELECT
    claim_id,
    count_if(outcome = 'discrepancy')        AS discrepancy_count,
    count_if(outcome = 'needs_information')  AS needs_information_count,
    count_if(outcome = 'supported')          AS supported_count,
    CAST(sum(CASE WHEN outcome = 'discrepancy' THEN coalesce(recovery_aud, 0) ELSE 0 END) AS DECIMAL(12, 2)) AS identified_recovery_aud,
    max_by(discrepancy_type, CASE WHEN outcome = 'discrepancy' THEN coalesce(recovery_aud, 0.01) END) AS primary_discrepancy_type,
    array_sort(collect_set(CASE WHEN outcome = 'discrepancy' THEN discrepancy_type END))       AS discrepancy_types,
    array_sort(collect_set(CASE WHEN outcome = 'needs_information' THEN discrepancy_type END)) AS information_gaps,
    concat_ws('\n', collect_list(CASE WHEN outcome <> 'supported'
      THEN concat('- ', upper(replace(outcome, '_', ' ')), ' | ', discrepancy_title, ': ', reasoning) END)) AS findings_narrative
  FROM ${gold_schema}.claim_finding
  GROUP BY claim_id
)
SELECT
  d.claim_id,
  d.claim_number,
  d.documents_received,
  d.document_types,
  CASE
    WHEN coalesce(f.discrepancy_count, 0) > 0       THEN 'discrepancy_confirmed'
    WHEN coalesce(f.needs_information_count, 0) > 0 THEN 'needs_more_information'
    ELSE 'documents_support_claim'
  END                                        AS review_outcome,
  coalesce(f.identified_recovery_aud, 0)     AS identified_recovery_aud,
  f.primary_discrepancy_type,
  coalesce(f.discrepancy_types, array())     AS discrepancy_types,
  coalesce(f.information_gaps, array())      AS information_gaps,
  coalesce(f.discrepancy_count, 0)           AS discrepancy_count,
  coalesce(f.needs_information_count, 0)     AS needs_information_count,
  coalesce(f.supported_count, 0)             AS supported_count,
  coalesce(nullif(f.findings_narrative, ''), 'All evaluated checks are supported by the documents.') AS findings_narrative,
  d.operative_note_assessment,
  d.discharge_summary_assessment,
  d.discharge_summary_ai_summary,
  d.operative_note_ai_summary,
  current_timestamp()                        AS reviewed_at
FROM docs d
LEFT JOIN f ON f.claim_id = d.claim_id;
