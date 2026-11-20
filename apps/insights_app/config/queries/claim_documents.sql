-- Scanned documents for one claim and what the AI pipeline extracted from each.
-- @param claim_number STRING = CLM-W0-2021-00000082
SELECT
  document_id,
  document_type,
  parsed_ok,
  element_count,
  avg_element_confidence,
  COALESCE(classified_document_type, '') AS classified_document_type,
  type_check_passed,
  extracted_ok,
  avg_field_confidence,
  checks_evaluated,
  discrepancies_found,
  information_gaps,
  parsed_at
FROM mehdidatalake_catalog.integrity_gold.document_ai_fact
WHERE claim_number = :claim_number
ORDER BY CASE document_type WHEN 'operative_note' THEN 0 ELSE 1 END
