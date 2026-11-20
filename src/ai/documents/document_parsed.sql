-- Step 1: parse every clinical document scan once with ai_parse_document (layout-aware OCR).
-- Streaming over the landing volume: new scans are parsed on the next update; existing ones never
-- re-parsed. The VARIANT keeps every element with its bounding box for evidence highlighting.
CREATE OR REFRESH STREAMING TABLE document_parsed (
  CONSTRAINT parsed_without_error EXPECT (parse_error IS NULL),
  CONSTRAINT has_elements EXPECT (element_count > 0)
)
COMMENT 'ai_parse_document output per clinical document scan (elements, bounding boxes, confidence).'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  volume_path,
  regexp_extract(volume_path, '(CLM-[A-Z0-9]+-[0-9]{4}-[0-9]+)', 1)    AS claim_number,
  regexp_extract(volume_path, '/([a-z_]+)\\.jpg$', 1)                  AS document_type,
  file_bytes,
  file_modified_at,
  parsed,
  size(CAST(parsed:document:elements AS ARRAY<VARIANT>))               AS element_count,
  CASE WHEN parsed:error_status IS NULL OR is_variant_null(parsed:error_status)
       THEN NULL ELSE parsed:error_status::STRING END                  AS parse_error,
  current_timestamp()                                                  AS parsed_at
FROM (
  SELECT
    regexp_replace(path, '^dbfs:', '')                                 AS volume_path,
    length                                                             AS file_bytes,
    modificationTime                                                   AS file_modified_at,
    ai_parse_document(content, map('version', '2.0', 'descriptionElementTypes', '')) AS parsed
  FROM (
    SELECT /*+ REPARTITION(${ai_partitions}) */ *
    FROM STREAM read_files(
      '${raw_volume_path}/rendered_docs/',
      format => 'binaryFile',
      recursiveFileLookup => 'true',
      pathGlobFilter => '*.jpg'
    )
  )
);
