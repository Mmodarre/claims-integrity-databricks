# Gen AI: AI Functions inside the pipelines

_Collected 2026-11-20 06:56 UTC from the live workspace by `scripts/collect_evidence.py`._

Real model output from the pipeline tables. Showcase claim: `CLM-W0-2021-00000082` (planted phantom procedure: add-on item 34992 billed, operative note says diagnostic only).

### AI function volume per stage

```sql
SELECT 'ai_parse_document' fn, count(*) calls FROM mehdidatalake_catalog.integrity_silver.document_parsed
UNION ALL SELECT 'ai_mask + ai_classify + ai_summarize', count(*) FROM mehdidatalake_catalog.integrity_silver.document_text
UNION ALL SELECT 'ai_extract (operative notes)', count(*) FROM mehdidatalake_catalog.integrity_silver.operative_note_facts
UNION ALL SELECT 'ai_extract (discharge summaries)', count(*) FROM mehdidatalake_catalog.integrity_silver.discharge_summary_facts
UNION ALL SELECT 'ai_query document review', count(*) FROM mehdidatalake_catalog.integrity_silver.document_llm_review
UNION ALL SELECT 'ai_query claim triage', count(*) FROM mehdidatalake_catalog.integrity_gold.claim_triage
UNION ALL SELECT 'ai_query hospital narrative', count(risk_narrative) FROM mehdidatalake_catalog.integrity_gold.hospital_risk_profile
UNION ALL SELECT 'ai_forecast rows (forecast series)', count(*) FROM mehdidatalake_catalog.integrity_gold.claims_forecast WHERE series = 'forecast'
```

| fn | calls |
|---|---|
| ai_forecast rows (forecast series) | 75 |
| ai_parse_document | 396 |
| ai_mask + ai_classify + ai_summarize | 396 |
| ai_extract (operative notes) | 198 |
| ai_extract (discharge summaries) | 198 |
| ai_query document review | 228 |
| ai_query claim triage | 817 |
| ai_query hospital narrative | 113 |
### ai_parse_document: layout elements with bounding boxes (showcase operative note)

```sql
SELECT element_index, element_type, round(confidence, 3) AS confidence, bbox, content
FROM mehdidatalake_catalog.integrity_gold.document_element
WHERE claim_number = 'CLM-W0-2021-00000082' AND document_type = 'operative_note' AND element_type <> 'text' OR
      (claim_number = 'CLM-W0-2021-00000082' AND document_type = 'operative_note' AND element_index IN (4, 6, 8, 14))
ORDER BY element_index
```

| element_index | element_type | confidence | bbox | content |
|---|---|---|---|---|
| 1 | title | 0.996 | ["2428","137","3337","223"] | OPERATION RECORD |
| 3 | section_header | 0.989 | ["251","654","864","730"] | Operative note: |
| 4 | text | 1.0 | ["251","739","913","1071"] | Date: 04/06/2021 Start: 08:15 Finish: 08:55 Elective |
| 5 | section_header | 0.997 | ["251","1199","860","1280"] | Operating team: |
| 6 | text | 0.994 | ["251","1285","1596","1540"] | Surgeon: Dr R. Patel (Consultant) Assistant: Dr L. Tran (Registrar) Anaesthetist: Dr J. Wong (F1) |
| 7 | section_header | 0.993 | ["251","1626","1033","1702"] | Anaesthetic: GA/SAB |
| 8 | text | 0.99 | ["241","1796","3355","3602"] | Pre-op diagnosis: Tear of medial meniscus, current injury (S83.21) Post-op diagnosis: Tear of medial meniscus, current injury (S83.21)  Operation performed: Ar… |
| 9 | section_header | 0.996 | ["241","3692","3150","3783"] | Closure: Skin closed with sterile strips. Dry sterile dressing applied. |
| 11 | section_header | 0.996 | ["237","4209","644","4294"] | Signed by: |
| 12 | signature | 0.966 | ["750","4148","1224","4275"] | Dr L. Tran |
| 14 | text | 0.995 | ["234","4389","2495","4475"] | Diagnostic only; no therapeutic intervention performed. |
### ai_extract v2.1 (citations + confidence): structured facts from the showcase operative note

```sql
SELECT operation_date, laterality, diagnostic_only_statement, assistant_surgeon_present, no_implant_statement,
       to_json(procedures) AS procedures,
       extracted:response:diagnostic_only_statement AS diagnostic_only_with_citation
FROM mehdidatalake_catalog.integrity_silver.operative_note_facts WHERE claim_number = 'CLM-W0-2021-00000082'
```

| operation_date | laterality | diagnostic_only_statement | assistant_surgeon_present | no_implant_statement | procedures | diagnostic_only_with_citation |
|---|---|---|---|---|---|---|
| 2021-06-04 | right | true | yes | true | [{"description":"Diagnostic arthroscopy","laterality":"right","intervention":"diagnostic_only","quantity":1},{"description":"Debridement and partial meniscectomy","laterality":"right","intervention":"therapeutic","quantity":1}] | {"citation_ids":[2],"confidence_score":1,"value":true} |
### ai_mask + ai_classify + ai_summarize (PII-masked text, type check, summary)

```sql
SELECT document_type, classified_document_type, substring(masked_text, 1, 300) AS masked_text_start, clinical_summary
FROM mehdidatalake_catalog.integrity_silver.document_text WHERE claim_number = 'CLM-W0-2021-00000082'
```

| document_type | classified_document_type | masked_text_start | clinical_summary |
|---|---|---|---|
| operative_note | operative_note | [FACILITY REDACTED] \| Department of Orthopaedic Surgery [MASKED] \| Ph [MASKED] OPERATION RECORD Name: [MASKED]                    UR: [MASKED]    DOB: [MASKED]    Sex: M Operative note: Date: 04/06/2021 Start: 08:15 Finish: 08:55 Elective Operating team: Surgeon: [MASKED] (Consultant) Assistant | Arthroscopic partial medial meniscectomy performed on right knee due to medial meniscus tear, with no complications or implants used. |
| discharge_summary | discharge_summary | [FACILITY REDACTED] \| Department of Orthopaedic Surgery [MASKED] \| Ph [MASKED] DISCHARGE SUMMARY Name: [MASKED]                    UR: [MASKED]        DOB: [MASKED]    Sex: M Discharge Summary Patient: [MASKED] Hospital: [Redacted Private Hospital], [MASKED] Admission: 04/06/2021 08:15 \| Separa | Patient underwent arthroscopic partial meniscectomy for medial meniscus tear, discharged same day with crutches and pain management. |
### ai_query claim triage (claim data only, strict JSON schema, GPT-5.5)

```sql
SELECT claim_number, ml_flag_reason, recommendation, discrepancy_type, confidence, doc_to_request,
       to_json(key_signals) AS key_signals, reasoning
FROM mehdidatalake_catalog.integrity_gold.claim_triage WHERE claim_number = 'CLM-W0-2021-00000082'
```

| claim_number | ml_flag_reason | recommendation | discrepancy_type | confidence | doc_to_request | key_signals | reasoning |
|---|---|---|---|---|---|---|---|
| CLM-W0-2021-00000082 | Procedure / item billing pattern inconsistent with peer providers | investigate | procedure_phantom | 0.66 | operative_note | ["Same-day episode: admission 2021-06-04 and discharge 2021-06-04, LOS billed 0 nights, same-day flag true.","Principal/coded procedure only lists 49580-00 Partial meniscectomy of knee, arthroscopic.","Billed line item 49580 matches the coded principal procedure, qty 1, benefit paid AUD 193.72.","Additional billed line item 34992 “Additional intraoperative procedure”, qty 1, benefit paid AUD 198.82, but no corresponding additional coded procedure appears."] | The stay and accommodation structure is internally consistent: this is a same-day day-surgery admission with 0 billed nights, and the typical stay for arthroscopic partial meniscectomy is 0-0 nights. The main procedure line 49580 aligns with the coded principal procedure 49580-00, so there is no obvious substitution on the primary procedure. The only integrity concern is the separate add-on line 34992 for an additional intraoperative procedure. The claim’s coded procedures list only the arthroscopic partial meniscectomy and does not show any secondary procedure supporting that add-on. This co… |
### ai_query document review + SQL recovery: findings for the showcase claim

```sql
SELECT discrepancy_type, detection_method, verdict, outcome, billed_item_code, recovery_aud, evidence_quote,
       evidence_bbox, reasoning
FROM mehdidatalake_catalog.integrity_gold.claim_finding WHERE claim_number = 'CLM-W0-2021-00000082' ORDER BY outcome
```

| discrepancy_type | detection_method | verdict | outcome | billed_item_code | recovery_aud | evidence_quote | evidence_bbox | reasoning |
|---|---|---|---|---|---|---|---|---|
| procedure_phantom | llm | contradiction | discrepancy | 34992 | 198.82 | Technique: Standard anterolateral and anteromedial portals established. Diagnostic arthroscopy performed. Debridement and partial meniscectomy carried out with powered shaver. | ["241","1796","3355","3602"] | The billed additional intraoperative procedure is not matched by any separate additional procedure in the operation title, findings or technique. The documented operative work is the arthroscopy with debridement/partial meniscectomy only, with no additional intraoperative service described. |
| procedure_phantom | llm | supported | supported | 49580 | 0.00 | Operation performed: Arthroscopic partial medial meniscectomy, right knee | ["241","1796","3355","3602"] | The billed item 49580 is for arthroscopic partial meniscectomy for a traumatic meniscus tear. The operation title and technique document an arthroscopic partial medial meniscectomy, so this billed procedure is supported despite the inconsistent final diagnostic-only statement. |
### Rule checks on extracted facts: one example per rule type (discrepancies)

```sql
SELECT discrepancy_type, claim_number, billed_item_code, recovery_aud, documented_detail, reasoning
FROM (SELECT *, row_number() OVER (PARTITION BY discrepancy_type ORDER BY recovery_aud DESC) rn
      FROM mehdidatalake_catalog.integrity_gold.claim_finding WHERE detection_method = 'rule' AND outcome = 'discrepancy') WHERE rn = 1
```

| discrepancy_type | claim_number | billed_item_code | recovery_aud | documented_detail | reasoning |
|---|---|---|---|---|---|
| age_eligibility | CLM-W3-2021-00005869 | 30648 | 135.49 | Record age evidence - stated age: 9, stated category: not_stated, DOB-derived age: 9 | Item 30648 (Femoral or inguinal hernia repair, open or minimally invasive, >= 10 years) is restricted to patients 10 or over; the record establishes age 9 |
| assistant_phantom | CLM-W7-2021-00005187 | 51303 | 25.98 | Assistant: Operating team – Assistant: nil (extracted: no) | Surgical-assistant item 51303 billed (benefit AUD 25.98); operative note: Operating team – Assistant: nil |
| bilateral_for_unilateral | CLM-W0-2021-00003730 | 30648 | 67.74 | Documented laterality: right - Operation performed: Laparoscopic TEP inguinal hernia repair – Right side only; procedure unilateral. | Item 30648 billed at 812.92 = 1.500x the peer fee 541.95 (bilateral loading); operative note documents right side |
| device_phantom | CLM-W2-2021-00002176 | PLSPI00 | 7016.79 | Operative note states no implant/prosthesis was used | Prescribed List device PLSPI00 (Pedicle screw system (spinal instrumentation), benefit AUD 7016.79) billed; operative note records no implanted device |
| los_overbilling | CLM-W2-2021-00004587 | ACCOM | 3929.88 | Documented stay: 3 night(s) (2023-04-17 to 2023-04-20) | Claim bills 6 night(s) including 3 extra night(s) (benefit AUD 3929.88); discharge summary documents 3 night(s) |
| same_day_overnight | CLM-W2-2021-00002313 | ACCOM | 1797.61 | Admitted 2022-06-23 09:40, separated 2022-06-23 17:15, same-day stated: yes | Overnight accommodation line billed (Hospital accommodation (overnight), benefit AUD 1797.61); discharge summary records 2022-06-23 to 2022-06-23 |
### Document review outcomes across the 200 claims with scans

```sql
SELECT review_outcome, count(*) AS claims, sum(identified_recovery_aud) AS identified_recovery_aud
FROM mehdidatalake_catalog.integrity_gold.claim_document_review GROUP BY 1 ORDER BY 2 DESC
```

| review_outcome | claims | identified_recovery_aud |
|---|---|---|
| discrepancy_confirmed | 111 | 145338.67 |
| documents_support_claim | 59 | 0.00 |
| needs_more_information | 30 | 0.00 |
### AI accuracy vs ground truth (restricted eval schema): per discrepancy type

```sql
SELECT * FROM mehdidatalake_catalog.integrity_eval.ai_eval_summary ORDER BY discrepancy_type
```

| discrepancy_type | tp | fp | fn | precision | recall | exact_type_rate | gaps_planted | gaps_routed_to_info | gaps_flagged_as_discrepancy | tp_gt_recovery_aud | tp_ai_recovery_aud |
|---|---|---|---|---|---|---|---|---|---|---|---|
| _overall | 85 | 51 | 13 | 0.625 | 0.867 | 0.824 | 75 | 34 | 33 | 105036.26 | 105553.26 |
| age_eligibility | 4 | 5 | 0 | 0.444 | 1.0 | 1.0 | 0 | 0 | 0 | 344.96 | 344.96 |
| assistant_phantom | 8 | 2 | 0 | 0.8 | 1.0 | 1.0 | 5 | 3 | 2 | 207.84 | 207.84 |
| bilateral_for_unilateral | 5 | 0 | 0 | 1.0 | 1.0 | 1.0 | 5 | 5 | 0 | 338.70 | 338.70 |
| device_phantom | 2 | 6 | 0 | 0.25 | 1.0 | 1.0 | 1 | 0 | 1 | 2595.65 | 2595.65 |
| device_substitution | 0 | 0 | 4 |  | 0.0 |  | 5 | 2 | 0 |  |  |
| drg_upcoding | 14 | 2 | 6 | 0.875 | 0.7 | 1.0 | 10 | 8 | 2 | 63982.17 | 63982.17 |
| item_substitution | 17 | 23 | 3 | 0.425 | 0.85 | 0.118 | 18 | 1 | 17 | 2351.23 | 2868.23 |
| los_overbilling | 1 | 0 | 0 | 1.0 | 1.0 | 1.0 | 2 | 0 | 0 | 3929.88 | 3929.88 |
| premium_iol_exploit | 0 | 2 | 0 | 0.0 |  |  | 1 | 1 | 0 |  |  |
| procedure_phantom | 14 | 6 | 0 | 0.7 | 1.0 | 1.0 | 9 | 1 | 6 | 2528.65 | 2528.65 |
| quantity_overstatement | 2 | 5 | 0 | 0.286 | 1.0 | 1.0 | 5 | 0 | 5 | 1871.30 | 1871.30 |
| same_day_overnight | 18 | 0 | 0 | 1.0 | 1.0 | 1.0 | 14 | 13 | 0 | 26885.88 | 26885.88 |
### Claim-level confusion: planted episode label vs AI document review outcome

```sql
SELECT g.episode_label, r.review_outcome, count(*) n
FROM mehdidatalake_catalog.integrity_gold.claim_document_review r
JOIN (SELECT claim_id, episode_label FROM mehdidatalake_catalog.integrity_eval.integrity__episode_ground_truth
      QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY created_at DESC) = 1) g USING (claim_id)
GROUP BY 1, 2 ORDER BY 1, 2
```

| episode_label | review_outcome | n |
|---|---|---|
| ambiguous | discrepancy_confirmed | 36 |
| ambiguous | documents_support_claim | 8 |
| ambiguous | needs_more_information | 16 |
| clean | discrepancy_confirmed | 4 |
| clean | documents_support_claim | 48 |
| clean | needs_more_information | 8 |
| hard_discrepancy | discrepancy_confirmed | 71 |
| hard_discrepancy | documents_support_claim | 3 |
| hard_discrepancy | needs_more_information | 6 |
### Triage accuracy vs ground truth

```sql
SELECT round(avg(CAST(recommendation_correct AS INT)), 3) AS recommendation_accuracy,
       round(avg(CASE WHEN planted THEN CAST(recommendation_correct AS INT) END), 3) AS planted_kept_for_audit,
       round(avg(CASE WHEN planted THEN CAST(type_in_ground_truth AS INT) END), 3) AS type_accuracy_planted,
       count(*) AS triaged
FROM mehdidatalake_catalog.integrity_eval.ai_eval_triage
```

| recommendation_accuracy | planted_kept_for_audit | type_accuracy_planted | triaged |
|---|---|---|---|
| 0.791 | 0.922 | 0.498 | 817 |
### AI-written hospital risk narratives (hospitals are pseudonymised)

```sql
SELECT hospital_name, flagged_claims, round(flag_rate_peer_z, 2) AS peer_z, identified_recovery_aud, narrative_model, risk_narrative
FROM mehdidatalake_catalog.integrity_gold.hospital_risk_profile WHERE risk_narrative IS NOT NULL ORDER BY identified_recovery_aud DESC LIMIT 3
```

| hospital_name | flagged_claims | peer_z | identified_recovery_aud | narrative_model | risk_narrative |
|---|---|---|---|---|---|
| NSW Hospital 225 | 3 | -0.5 | 12091.04 | system.ai.claude-sonnet-5-5 | NSW Hospital 225 shows limited evidence for broad integrity attention, though one claim merits follow-up: of 41 claims, 3 (7.3%) were ML-flagged with a peer z-score of -0.5 (slightly below the peer average), and AI triage raised 0 escalations. However, document review confirmed discrepancies on 1 claim, comprising 3 findings that were all of the device_phantom type (devices apparently claimed without supporting evidence), with 1 information gap and an identified recovery of AUD 12,091.04, or about 6.3% of the AUD 191,851.00 benefit paid. These findings are not yet auditor-confirmed, so the recommended next step is to refer the single claim with the device_phantom findings for auditor verification and recovery, and to check whether the same device billing pattern appears in other claims from this hospital before deciding on any wider review. |
| NSW Hospital 235 | 8 | 1.42 | 11227.36 | system.ai.claude-sonnet-5-5 | NSW Hospital 235 warrants targeted, but not high-priority, integrity attention: document review confirmed discrepancies on 3 of 42 claims (7 findings, including DRG upcoding x2 and phantom procedure x2), with AUD 11,227.36 identified against AUD 252,982.11 paid (about 4.4%). The ML flag rate of 19.0% (8 claims) is elevated at a peer z-score of 1.42 but is not extreme, and AI triage raised only 1 escalation, with 1 information gap still open, so these findings are not yet auditor-confirmed. The recommended next step is for an auditor to validate the 3 claims with confirmed discrepancies, resolve the open information gap, and then decide whether to review the remaining ML-flagged claims for the same upcoding and phantom-service patterns. |
| SA Hospital 067 | 1 | -0.92 | 10406.52 | system.ai.claude-sonnet-5-5 | SA Hospital 067 has a limited but specific basis for integrity attention: one of its 21 claims (4.8%) was ML-flagged, which is below the peer average (z-score -0.92), yet document review confirmed four discrepancy findings on that claim, all of the device_phantom type, with AUD 10,406.52 identified for recovery, about 10.1% of the AUD 103,155.99 benefit paid on hospital claims. There were no AI triage escalations and no information gaps, so the evidence points to a single-claim, single-pattern issue rather than a hospital-wide one, and these findings are not yet auditor-confirmed. The recommended next step is for an auditor to validate the device_phantom findings on that claim and pursue the identified recovery, then check whether device billing on the other 20 claims shows the same pattern before any wider escalation. |
### ai_forecast: next weeks of benefit paid by claim type (90% interval)

```sql
SELECT week, claim_type, round(claims, 1) claims, round(benefit_paid) benefit_paid, round(benefit_paid_lower) lower, round(benefit_paid_upper) upper
FROM mehdidatalake_catalog.integrity_gold.claims_forecast WHERE series = 'forecast' ORDER BY week, claim_type LIMIT 9
```

| week | claim_type | claims | benefit_paid | lower | upper |
|---|---|---|---|---|---|
| 2023-12-25 | Ambulance | 3.0 | 2862.0 | 751.0 | 6619.0 |
| 2023-12-25 | Extras | 347.4 | 37105.0 | 28811.0 | 44010.0 |
| 2023-12-25 | Hospital | 72.1 | 344998.0 | 250151.0 | 450571.0 |
| 2024-01-01 | Ambulance | 3.0 | 2870.0 | 750.0 | 6638.0 |
| 2024-01-01 | Extras | 347.4 | 37134.0 | 28800.0 | 44044.0 |
| 2024-01-01 | Hospital | 72.1 | 345945.0 | 250838.0 | 451808.0 |
| 2024-01-08 | Ambulance | 3.1 | 2879.0 | 750.0 | 6658.0 |
| 2024-01-08 | Extras | 347.5 | 37163.0 | 28790.0 | 44079.0 |
| 2024-01-08 | Hospital | 72.0 | 346895.0 | 251527.0 | 453048.0 |
### Metric views answer with governed definitions

```sql
SELECT claim_type, MEASURE(claim_count) claims, MEASURE(benefit_paid) benefit_paid, MEASURE(rejection_rate) rejection_rate
FROM mehdidatalake_catalog.integrity_gold.mv_claims_overview GROUP BY 1 ORDER BY 2 DESC
```

| claim_type | claims | benefit_paid | rejection_rate |
|---|---|---|---|
| Extras | 41920 | 4428912.72 | 0.19091125954198473 |
| Hospital | 7910 | 35446295.78 | 0.014664981036662453 |
| Ambulance | 390 | 354852.03 | 0.05641025641025641 |
### Recovery by discrepancy type and detection method (mv_recovery)

```sql
SELECT discrepancy_type, detection_method, MEASURE(discrepancy_findings) discrepancies, MEASURE(identified_recovery) identified_recovery
FROM mehdidatalake_catalog.integrity_gold.mv_recovery GROUP BY 1, 2 ORDER BY 4 DESC NULLS LAST
```

| discrepancy_type | detection_method | discrepancies | identified_recovery |
|---|---|---|---|
| drg_upcoding | llm | 16 | 72382.59 |
| same_day_overnight | rule | 18 | 26885.88 |
| device_phantom | rule | 7 | 22497.56 |
| procedure_phantom | llm | 50 | 7974.25 |
| quantity_overstatement | llm | 7 | 5344.00 |
| los_overbilling | rule | 1 | 3929.88 |
| item_substitution | llm | 10 | 2875.10 |
| device_phantom | llm | 1 | 1671.01 |
| age_eligibility | rule | 9 | 956.42 |
| bilateral_for_unilateral | rule | 5 | 338.70 |
| assistant_phantom | rule | 10 | 259.80 |
| premium_iol_exploit | llm | 2 | 223.48 |
| device_substitution | llm | 0 |  |
