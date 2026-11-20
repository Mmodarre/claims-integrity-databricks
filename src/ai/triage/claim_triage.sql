-- AI triage of every ML-flagged claim using the claim data only (the "before any documents" view
-- an investigator has when the flag lands). Replaces the DSPy Investigator + GEPA + serving
-- endpoint with one ai_query call per claim (strict JSON schema output). Streaming: each flagged
-- claim is triaged exactly once.
CREATE OR REFRESH STREAMING TABLE ${gold_schema}.claim_triage (
  CONSTRAINT triage_succeeded EXPECT (triage_error IS NULL),
  CONSTRAINT confidence_in_range EXPECT (confidence BETWEEN 0 AND 1)
)
COMMENT 'AI triage verdict per flagged claim (claim data only): issue?, discrepancy type, confidence, impact, document to request, recommendation. PK: claim_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'claim_id')
AS
WITH requests AS (
  SELECT
    q.claim_id,
    q.claim_number,
    q.ml_fraud_score,
    q.ml_flag_reason,
    ai_query(
      '${llm_endpoint}',
      concat(
        'You are a claims-integrity investigator at an Australian private health insurer. An upstream fraud model ',
        'flagged the hospital claim below. You do NOT have any clinical documents yet - only the coded claim and its ',
        'billed lines. Decide whether the claim structure shows a genuine billing-integrity issue worth auditing, or ',
        'whether the flag is a false positive to dismiss.\n\n',
        'Discrepancy types you can name (or none):\n',
        '- same_day_overnight: same-day episode billed with an overnight accommodation line\n',
        '- los_overbilling: more bed-days billed than the stay supports (extra-night accommodation lines)\n',
        '- procedure_phantom: a procedure or theatre line billed that was likely not performed\n',
        '- item_substitution: a higher-fee MBS item billed than the procedure performed\n',
        '- drg_upcoding: CC split of the DRG driven by a complication/comorbidity diagnosis that may be undocumented\n',
        '- assistant_phantom: surgical-assistant item billed without an assistant\n',
        '- bilateral_for_unilateral: bilateral fee loading (about 1.5x the peer fee) for a one-sided procedure\n',
        '- quantity_overstatement: billed quantity higher than plausible for the procedure\n',
        '- device_phantom: Prescribed List device billed but not implanted\n',
        '- device_substitution: higher-tier device billed than implanted\n',
        '- premium_iol_exploit: premium intraocular lens benefit for a monofocal lens\n',
        '- age_eligibility: age-restricted item billed for a patient outside the age band\n',
        '- duplicate_line: the same procedure line billed twice on the same date\n\n',
        'Claim-level signals worth checking: an accommodation line marked (overnight) or (N extra nights), especially ',
        'when billed nights exceed the typical stay for the procedure or the procedure is normally same-day; a ',
        'prosthesis benefit above the typical Prescribed List range for its device category (possible higher-tier ',
        'device billed than implanted); a surgical-assistant item; a schedule fee about 1.5x the peer typical fee ',
        '(bilateral loading); a quantity above 1 on a procedure; an item restricted by age (e.g. under 12 years) versus ',
        'the patient age; a DRG ending in A (CC split) and which coded diagnosis has a high CCL; an add-on line such as an ',
        'additional intraoperative procedure; a higher-complexity item than the coded principal procedure; premium or ',
        'extra prosthesis lines.\n\n',
        'Rules: ground every signal in a specific field or billed line. Name the single document that would confirm ',
        'the hypothesis (discharge_summary for dates, stay, diagnoses, age; operative_note for procedures, assistants, ',
        'laterality, quantities, devices). est_impact_aud is the fund benefit you expect to recover if confirmed (0 if ',
        'none). recommendation: dismiss = the claim data itself explains the flag away (e.g. a charge outlier fully ',
        'accounted for by a legitimate high-cost procedure and its devices); investigate = the flag points at something ',
        'only a clinical document can confirm, even if the claim looks internally consistent (stay length, procedures ',
        'performed, assistants, laterality, implants, documented diagnoses) - request that document; escalate = strong, ',
        'high-value case already evident from the claim. A consistent-looking claim is NOT a reason to dismiss when the ',
        'discrepancy would only show in the documents.\n\n',
        'MODEL FLAG REASON: ', q.ml_flag_reason, ' (score ', q.ml_fraud_score, ')\n\n',
        'CLAIM:\n', c.claim_text
      ),
      responseFormat => '{"type": "json_schema", "json_schema": {"name": "claim_triage", "strict": true, "schema": {
        "type": "object", "additionalProperties": false,
        "required": ["reasoning", "key_signals", "is_integrity_issue", "discrepancy_type", "confidence", "est_impact_aud", "doc_to_request", "recommendation"],
        "properties": {
          "reasoning": {"type": "string", "description": "Step-by-step reasoning grounded in specific claim fields and lines."},
          "key_signals": {"type": "array", "items": {"type": "string"}, "description": "Up to 4 short signals, each citing a field or line."},
          "is_integrity_issue": {"type": "boolean"},
          "discrepancy_type": {"type": "string", "enum": ["same_day_overnight", "los_overbilling", "procedure_phantom", "item_substitution", "drg_upcoding", "assistant_phantom", "bilateral_for_unilateral", "quantity_overstatement", "device_phantom", "device_substitution", "premium_iol_exploit", "age_eligibility", "duplicate_line", "none"]},
          "confidence": {"type": "number", "description": "0-1 confidence that an audit is warranted."},
          "est_impact_aud": {"type": "number"},
          "doc_to_request": {"type": "string", "enum": ["discharge_summary", "operative_note", "none"]},
          "recommendation": {"type": "string", "enum": ["dismiss", "investigate", "escalate"]}
        }}}}',
      failOnError => false
    ) AS resp
  FROM (SELECT /*+ REPARTITION(${ai_partitions}) */ * FROM STREAM(${gold_schema}.flagged_claim_queue)) q
  JOIN claim_prompt_context c ON c.claim_id = q.claim_id
),
parsed AS (
  SELECT
    *,
    from_json(resp.result,
      'reasoning STRING, key_signals ARRAY<STRING>, is_integrity_issue BOOLEAN, discrepancy_type STRING,
       confidence DOUBLE, est_impact_aud DOUBLE, doc_to_request STRING, recommendation STRING') AS v
  FROM requests
)
SELECT
  claim_id,
  claim_number,
  ml_fraud_score,
  ml_flag_reason,
  v.is_integrity_issue,
  v.discrepancy_type,
  v.confidence,
  CAST(round(v.est_impact_aud, 2) AS DECIMAL(12, 2)) AS est_impact_aud,
  v.doc_to_request,
  v.recommendation,
  v.key_signals,
  v.reasoning,
  resp.errorMessage                                  AS triage_error,
  '${llm_endpoint}'                                  AS triage_model,
  current_timestamp()                                AS triaged_at
FROM parsed;
