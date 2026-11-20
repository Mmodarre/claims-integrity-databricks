-- Layout elements ai_parse_document found on one claim's scans (bounding boxes in image pixels).
-- @param claim_number STRING = CLM-W0-2021-00000082
SELECT
  document_id,
  document_type,
  element_index,
  element_type,
  SUBSTRING(COALESCE(content, ''), 1, 240) AS content,
  confidence,
  COALESCE(ARRAY_JOIN(TRANSFORM(bbox, x -> CAST(x AS STRING)), ','), '') AS bbox,
  image_width,
  image_height
FROM mehdidatalake_catalog.integrity_gold.document_element
WHERE claim_number = :claim_number
ORDER BY document_type, element_index
