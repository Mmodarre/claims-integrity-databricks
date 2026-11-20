CREATE OR REFRESH MATERIALIZED VIEW document_registry (
  CONSTRAINT volume_path_present EXPECT (volume_path IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Registry of clinical document scans: claim, document type, absolute volume path, image size.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT
  document_id,
  render_id,
  claim_id,
  regexp_extract(file_path, '(CLM-[A-Z0-9]+-[0-9]{4}-[0-9]+)', 1)              AS claim_number,
  document_type,
  concat('${raw_volume_path}/', regexp_replace(file_path, '^data/', ''))        AS volume_path,
  image_format,
  image_bytes,
  width,
  height,
  status AS render_status
FROM ${bronze_schema}.integrity__rendered_document
QUALIFY row_number() OVER (PARTITION BY document_id ORDER BY _ingested_at DESC) = 1;
