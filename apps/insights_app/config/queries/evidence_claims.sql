-- Claims whose scanned documents were reviewed by AI, with finding counts (picker list).
WITH f AS (
  SELECT
    claim_number,
    MAX(hospital_name) AS hospital_name,
    MAX(region) AS region,
    MAX(service_date) AS service_date,
    COUNT(*) AS checks,
    COUNT_IF(outcome = 'discrepancy') AS discrepancies,
    COUNT_IF(evidence_bbox IS NOT NULL AND SIZE(evidence_bbox) = 4) AS located_evidence
  FROM mehdidatalake_catalog.integrity_gold.claim_finding
  GROUP BY claim_number
)
SELECT
  r.claim_number,
  r.review_outcome,
  CAST(r.identified_recovery_aud AS DOUBLE) AS identified_recovery_aud,
  COALESCE(r.primary_discrepancy_type, '') AS primary_discrepancy_type,
  r.discrepancy_count,
  r.needs_information_count,
  r.documents_received,
  COALESCE(f.hospital_name, '') AS hospital_name,
  COALESCE(f.region, '') AS region,
  f.service_date,
  COALESCE(f.checks, 0) AS checks,
  COALESCE(f.located_evidence, 0) AS located_evidence
FROM mehdidatalake_catalog.integrity_gold.claim_document_review r
LEFT JOIN f ON f.claim_number = r.claim_number
ORDER BY
  CASE r.review_outcome WHEN 'discrepancy_confirmed' THEN 0 WHEN 'needs_more_information' THEN 1 ELSE 2 END,
  r.identified_recovery_aud DESC,
  r.claim_number
