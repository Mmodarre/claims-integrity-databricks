-- When the AI pipeline last produced results (drives the freshness note in the header).
SELECT
  (SELECT MAX(reviewed_at) FROM mehdidatalake_catalog.integrity_gold.claim_document_review) AS last_ai_review,
  (SELECT MAX(parsed_at) FROM mehdidatalake_catalog.integrity_gold.document_ai_fact) AS last_document_parse
