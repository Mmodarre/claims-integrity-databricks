-- Documents where the AI was least certain: candidates for human spot-checks.
SELECT
  claim_number,
  document_type,
  avg_element_confidence,
  avg_field_confidence,
  type_check_passed,
  discrepancies_found,
  information_gaps
FROM mehdidatalake_catalog.integrity_gold.document_ai_fact
WHERE extracted_ok
ORDER BY avg_field_confidence ASC
LIMIT 8
