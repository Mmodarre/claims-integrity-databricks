-- Every AI check for one claim: verdict, reasoning, quoted evidence and its location on the scan.
-- @param claim_number STRING = CLM-W0-2021-00000082
SELECT
  finding_id,
  discrepancy_type,
  discrepancy_title,
  audit_type,
  detection_method,
  verdict,
  outcome,
  line_number,
  COALESCE(billed_item_code, '') AS billed_item_code,
  COALESCE(billed_item_description, '') AS billed_item_description,
  billed_quantity,
  CAST(billed_charge_aud AS DOUBLE) AS billed_charge_aud,
  CAST(billed_benefit_aud AS DOUBLE) AS billed_benefit_aud,
  supported_fraction,
  COALESCE(supported_item_code, '') AS supported_item_code,
  supported_quantity,
  CAST(recovery_aud AS DOUBLE) AS recovery_aud,
  COALESCE(recovery_basis, '') AS recovery_basis,
  COALESCE(documented_detail, '') AS documented_detail,
  COALESCE(reasoning, '') AS reasoning,
  confidence,
  COALESCE(evidence_quote, '') AS evidence_quote,
  COALESCE(ARRAY_JOIN(TRANSFORM(evidence_bbox, x -> CAST(x AS STRING)), ','), '') AS evidence_bbox,
  evidence_page,
  COALESCE(source_document_type, '') AS source_document_type,
  COALESCE(document_id, '') AS document_id,
  COALESCE(hospital_name, '') AS hospital_name,
  COALESCE(region, '') AS region,
  service_date
FROM mehdidatalake_catalog.integrity_gold.claim_finding
WHERE claim_number = :claim_number
ORDER BY
  CASE outcome WHEN 'discrepancy' THEN 0 WHEN 'needs_information' THEN 1 ELSE 2 END,
  recovery_aud DESC,
  line_number
