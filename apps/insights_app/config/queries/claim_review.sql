-- AI document review roll-up for one claim (gold.claim_document_review).
-- @param claim_number STRING = CLM-W0-2021-00000082
SELECT
  claim_number,
  review_outcome,
  CAST(identified_recovery_aud AS DOUBLE) AS identified_recovery_aud,
  COALESCE(primary_discrepancy_type, '') AS primary_discrepancy_type,
  discrepancy_count,
  needs_information_count,
  supported_count,
  documents_received,
  COALESCE(findings_narrative, '') AS findings_narrative,
  COALESCE(operative_note_assessment, '') AS operative_note_assessment,
  COALESCE(discharge_summary_assessment, '') AS discharge_summary_assessment,
  COALESCE(operative_note_ai_summary, '') AS operative_note_ai_summary,
  COALESCE(discharge_summary_ai_summary, '') AS discharge_summary_ai_summary,
  reviewed_at
FROM mehdidatalake_catalog.integrity_gold.claim_document_review
WHERE claim_number = :claim_number
