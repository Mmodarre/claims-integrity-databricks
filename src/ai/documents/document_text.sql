-- Step 2: text-level AI enrichment per document (once per document):
--   ai_mask      -> PII-safe text for apps/Genie (names, contact details, DOB, record numbers)
--   ai_classify  -> verify the document type from content (catches mis-filed scans)
--   ai_summarize -> one-paragraph clinical summary for the auditor view
CREATE OR REFRESH STREAMING TABLE document_text (
  CONSTRAINT type_matches_filename EXPECT (classified_document_type = document_type)
)
COMMENT 'Full text, PII-masked text, AI document-type check and AI clinical summary per document.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  volume_path,
  claim_number,
  document_type,
  full_text,
  masked_text,
  ai_classify(
    full_text,
    '{"discharge_summary": "Hospital discharge summary: admission and separation dates, diagnoses, procedures list, clinical summary, discharge medications, follow-up",
      "operative_note": "Operation record / operative note: operating team, anaesthetic, operation performed, findings, technique, implants, post-op orders",
      "other": "Any other clinical or administrative document"}',
    map('version', '2.0')
  ):response[0]::STRING                                                AS classified_document_type,
  ai_summarize(masked_text, 60)                                        AS clinical_summary,
  current_timestamp()                                                  AS enriched_at
FROM (
  SELECT
    *,
    -- Defense in depth: deterministically mask the "Name: SURNAME, First" record header before ai_mask
    -- (the model reliably masks prose names but can miss the all-caps header format).
    ai_mask(
      regexp_replace(full_text, '(Name|Patient)[ ]*:[ ]*[A-Za-z-]+,[ ]*[A-Za-z-]+', '$1: [MASKED]'),
      array('person', 'phone number', 'email', 'street address', 'date of birth', 'medical record number')
    ) AS masked_text
  FROM (
    SELECT /*+ REPARTITION(${ai_partitions}) */
      volume_path,
      claim_number,
      document_type,
      concat_ws('\n', transform(CAST(parsed:document:elements AS ARRAY<VARIANT>), e -> e:content::STRING)) AS full_text
    FROM STREAM(document_parsed)
    WHERE parse_error IS NULL
  )
);
