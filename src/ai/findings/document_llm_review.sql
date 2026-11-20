-- LLM judgment checks per document (once per document, streaming). The model reads the PII-masked
-- document text against the de-identified billed claim and returns one structured decision per
-- billed line. Only checks that need clinical reading go to the LLM; exact comparisons are SQL rules
-- (document_rule_finding). Money is never computed here.
--   operative_note    -> every MBS procedure line: procedure_phantom | item_substitution
--                        every line with qty > 1: quantity_overstatement
--                        every prosthesis line:   device_phantom | device_substitution | premium_iol_exploit
--   discharge_summary -> drg_upcoding, for claims grouped to the CC split of their DRG
CREATE OR REFRESH STREAMING TABLE document_llm_review (
  CONSTRAINT review_succeeded EXPECT (review_error IS NULL)
)
COMMENT 'Structured LLM review per clinical document: per-line findings with verdict, verbatim evidence quote, reasoning, confidence.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS
WITH docs AS (
  SELECT /*+ REPARTITION(${ai_partitions}) */
    t.volume_path,
    t.claim_number,
    t.document_type,
    t.masked_text,
    r.claim_id,
    r.document_id,
    c.claim_text,
    c.drg_code,
    c.drg_base,
    c.is_cc_split,
    c.typical_cc_drivers,
    c.coded_diagnoses_text,
    pb.playbook_text
  FROM STREAM(document_text) t
  JOIN ${silver_schema}.document_registry r ON r.volume_path = t.volume_path
  JOIN claim_prompt_context c            ON c.claim_id = r.claim_id
  CROSS JOIN audit_playbook pb
  WHERE t.document_type = 'operative_note'
     OR (t.document_type = 'discharge_summary' AND c.is_cc_split)
),
requests AS (
  SELECT
    *,
    ai_query(
      '${llm_endpoint}',
      concat(
        'You are a senior clinical coding auditor at an Australian private health insurer. Compare the BILLED CLAIM ',
        'with the clinical document below and return structured findings.\n\n',
        CASE document_type
          WHEN 'operative_note' THEN concat(
            'TASK - OPERATIVE NOTE. Make these decisions, one finding each:\n',
            'A. For EVERY billed MBS procedure line (skip surgical-assistant, anaesthesia, ACCOM and THEATRE lines) return ',
            'exactly one finding whose discrepancy_type is either item_substitution or procedure_phantom:\n',
            '   - item_substitution: the note documents a procedure of the same kind but less complex or lower-fee than the ',
            'billed item - the billed line corresponds to what was done, but at a higher item. Examples: PCI with stent ',
            'billed but only diagnostic coronary angiography documented; radical prostatectomy billed but TURP ',
            'documented; open procedure billed but laparoscopic documented; colonoscopy with polypectomy billed but ',
            'diagnostic colonoscopy documented. Give supported_item_code if you know the MBS item of the documented procedure.\n',
            '   - procedure_phantom: nothing corresponding to the billed line was done - e.g. an add-on such as an additional ',
            'intraoperative procedure that the operation, technique and findings never describe, or a separate ',
            'therapeutic line when the note states diagnostic only / no therapeutic intervention. A diagnostic-only remark ',
            'does NOT void the principal procedure when that procedure is explicitly named in the operation title and technique.\n',
            '   - If the line is backed by the note, return verdict supported (use discrepancy_type procedure_phantom).\n',
            '   - not_documented when the note records the operation only by a generic name or the MBS item descriptor ',
            'wording (e.g. Femoral or inguinal hernia repair, open or minimally invasive; procedure performed as planned) ',
            'rather than a specific description of what was done, or is ambiguous about a step (e.g. inspected, treated as ',
            'indicated): such a note can neither confirm nor refute an extra or higher billed item.\n',
            'B. For EVERY billed MBS procedure line with quantity above 1 (never ACCOM, THEATRE or anaesthesia lines), also ',
            'return one quantity_overstatement finding. Contradiction ',
            'only if the note explicitly documents a smaller number (give it as supported_quantity); if the note does not ',
            'state a count, verdict not_documented.\n',
            'C. For EVERY billed prosthesis line (item codes starting PL or PH) return exactly one finding whose ',
            'discrepancy_type is device_phantom, device_substitution or premium_iol_exploit:\n',
            '   - device_phantom: no matching implant is documented for this line.\n',
            '   - device_substitution: an implant of that kind is documented but it is a different or lower-tier device ',
            'than billed (e.g. bare-metal stent documented, drug-eluting billed; standard component documented, premium ',
            'billed; fewer or smaller components than billed).\n',
            '   - premium_iol_exploit: a lens billed at a premium level or premium benefit while a monofocal lens is documented.\n',
            '   - If the documented implant matches the billed device, return verdict supported (use discrepancy_type device_substitution).\n')
          ELSE concat(
            'TASK - DISCHARGE SUMMARY, check drg_upcoding only. The claim is grouped to AR-DRG ', drg_code,
            ', the complication/comorbidity (CC) split of base DRG ', coalesce(drg_base, 'n/a'), '. The split is only ',
            'justified if a CC-driving diagnosis is documented.\n',
            'Coded diagnoses on the claim: ', coded_diagnoses_text, '\n',
            'Diagnoses that typically drive this CC split: ', coalesce(typical_cc_drivers, 'n/a'), '\n',
            'Identify the coded diagnosis that drives the CC split (a coded diagnosis matching a typical driver, else the ',
            'highest-CCL secondary diagnosis) and return ONE finding for it, billed_item_code = that diagnosis code, ',
            'claim_line_id = null:\n',
            '   - supported: the summary explicitly documents that diagnosis or clearly describes it being treated.\n',
            '   - contradiction: the diagnosis is absent from the documented diagnoses AND the summary explicitly records ',
            'in-range investigations or the absence of the complication - e.g. renal function within normal limits throughout ',
            'admission, no nephrology consult, Cr 78 [60-110], condition excluded. Such an explicit in-range statement refutes ',
            'an undocumented CC diagnosis.\n',
            '   - not_documented: the diagnosis is absent but the summary contains no explicit in-range or exclusion ',
            'statement (merely an uncomplicated narrative), or there is partial/borderline evidence - e.g. a sub-threshold ',
            'result such as creatinine rising 80 to 141, a raised marker, a query diagnosis. That is a clinical judgment: ',
            'request more information.\n')
        END,
        '\nAudit playbook (definitions from the insurer discrepancy taxonomy):\n', playbook_text, '\n',
        '\nVerdict rules: contradiction ONLY when the document positively contradicts the bill. not_documented when the ',
        'document is silent, generic or ambiguous so the bill can neither be confirmed nor refuted - that means ',
        'request more information, not fraud. supported when the document backs the bill. evidence_quote must be ONE ',
        'contiguous excerpt copied verbatim from the document - no quotation marks, no ellipses, no stitching of ',
        'separate passages - at most 200 characters, empty string if nothing relevant exists. Use the exact line_id ',
        'values shown in the billed lines. Personal details in the document are masked; ignore that.\n\n',
        'BILLED CLAIM:\n', claim_text,
        '\n\nDOCUMENT (', document_type, '):\n', masked_text
      ),
      responseFormat => '{"type": "json_schema", "json_schema": {"name": "document_review", "strict": true, "schema": {
        "type": "object", "additionalProperties": false,
        "required": ["findings", "document_assessment"],
        "properties": {
          "findings": {"type": "array", "items": {
            "type": "object", "additionalProperties": false,
            "required": ["discrepancy_type", "claim_line_id", "billed_item_code", "verdict", "supported_quantity", "supported_item_code", "documented_detail", "evidence_quote", "reasoning", "confidence"],
            "properties": {
              "discrepancy_type": {"type": "string", "enum": ["procedure_phantom", "item_substitution", "quantity_overstatement", "device_phantom", "device_substitution", "premium_iol_exploit", "drg_upcoding"]},
              "claim_line_id": {"type": ["string", "null"]},
              "billed_item_code": {"type": ["string", "null"]},
              "verdict": {"type": "string", "enum": ["contradiction", "supported", "not_documented"]},
              "supported_quantity": {"type": ["integer", "null"]},
              "supported_item_code": {"type": ["string", "null"]},
              "documented_detail": {"type": "string", "description": "What the document actually records for this line."},
              "evidence_quote": {"type": "string"},
              "reasoning": {"type": "string"},
              "confidence": {"type": "number"}
            }}},
          "document_assessment": {"type": "string", "description": "Two-sentence overall assessment of this document against the claim."}
        }}}}',
      failOnError => false
    ) AS resp
  FROM docs
)
SELECT
  volume_path,
  claim_id,
  claim_number,
  document_id,
  document_type,
  from_json(resp.result,
    'findings ARRAY<STRUCT<discrepancy_type: STRING, claim_line_id: STRING, billed_item_code: STRING, verdict: STRING,
       supported_quantity: INT, supported_item_code: STRING, documented_detail: STRING, evidence_quote: STRING,
       reasoning: STRING, confidence: DOUBLE>>, document_assessment STRING') AS review,
  resp.errorMessage    AS review_error,
  '${llm_endpoint}'    AS review_model,
  current_timestamp()  AS reviewed_at
FROM requests;
