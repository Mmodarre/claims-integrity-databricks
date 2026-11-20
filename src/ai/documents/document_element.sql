-- Every parsed layout element (text block, title, signature...) with its page and bounding box.
-- Lets the apps draw the evidence highlight on the original scan. Lakebase sync source.
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.document_element
COMMENT 'Parsed layout elements per document with bounding boxes [x1,y1,x2,y2] in image pixels. PK: element_key.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'element_key')
AS SELECT
  concat(r.document_id, ':', e.pos)                              AS element_key,
  r.document_id,
  p.claim_number,
  r.claim_id,
  p.document_type,
  e.pos                                                          AS element_index,
  e.el:id::INT                                                   AS element_id,
  e.el:type::STRING                                              AS element_type,
  e.el:content::STRING                                           AS content,
  e.el:confidence::DOUBLE                                        AS confidence,
  e.el:bbox[0]:page_id::INT                                      AS page_id,
  CAST(e.el:bbox[0]:coord AS ARRAY<INT>)                         AS bbox,
  r.width                                                        AS image_width,
  r.height                                                       AS image_height
FROM document_parsed p
JOIN ${silver_schema}.document_registry r ON r.volume_path = p.volume_path
LATERAL VIEW posexplode(CAST(p.parsed:document:elements AS ARRAY<VARIANT>)) e AS pos, el;
