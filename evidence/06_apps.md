# Databricks Apps: surfaced to the business

_Collected 2026-11-20 06:57 UTC from the live workspace by `scripts/collect_evidence.py`._

Two apps deployed on the workspace.

## `claims-integrity-auditor`

| field | value |
|---|---|
| app status | RUNNING |
| compute | ACTIVE |
| active deployment | SUCCEEDED |
| resources | postgres, scans-volume, draft-model |
| user API scopes | dashboards.genie |

`GET /api/health` → 200

```json
{"status":"ok","database":"databricks_postgres","app_schema":"auditor","synced_schema":"integrity_synced","detail":null}
```

`GET /api/queue/facets` → 200

```json
{"regions":["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"],"claim_statuses":["Paid","Rejected"],"recommendations":["dismiss","escalate","investigate"],"review_outcomes":["discrepancy_confirmed","documents_support_claim","needs_more_information","no_documents"],"statuses":["open","in_review","awaiting_information","escalated","closed"]}
```

`GET /api/claims/68ce3ffe-cf9d-4485-8ab3-f50273f03bf0/triage` → 200

```json
{"claim_id":"68ce3ffe-cf9d-4485-8ab3-f50273f03bf0","claim_number":"CLM-W0-2021-00000082","ml_fraud_score":0.9477,"ml_flag_reason":"Procedure / item billing pattern inconsistent with peer providers","is_integrity_issue":true,"discrepancy_type":"procedure_phantom","confidence":0.66,"est_impact_aud":198.82,"doc_to_request":"operative_note","recommendation":"investigate","key_signals":["Same-day episode: admission 2021-06-04 and discharge 2021-06-04, LOS billed 0 nights, same-day flag true.","Principal/coded procedure only lists 49580-00 Partial meniscectomy of knee, arthroscopic.","Billed line item 49580 matches the coded principal procedure, qty 1, benefit paid AUD 193.72.","Additional billed line item 34992 “Additional intraoperative procedure”, qty 1, benefit paid AUD 198.82, but no corresponding additional coded procedure appears."],"reasoning":"The stay and accommodation structure is internally consistent: this is a same-day day-surgery admission with 0 billed nights, and the typical stay for arthroscopic partial meniscectomy is 0-0 nights. The main procedure line 49580 aligns with the coded principal procedure 49580-00, so there is no obvious substitution on the primary procedure. The only integrity concern is the separate add-on line 34992 for an additional intraoperative procedure. The claim’s coded procedures list only the arthroscopic partial meniscectomy and does not show any secondary procedure supporting that add-on. This could be legitimate if an additional procedu
```

`GET /api/claims/68ce3ffe-cf9d-4485-8ab3-f50273f03bf0/review` → 200

```json
{"claim_id":"68ce3ffe-cf9d-4485-8ab3-f50273f03bf0","status":"received","summary":{"review_outcome":"discrepancy_confirmed","documents_received":2,"document_types":["discharge_summary","operative_note"],"identified_recovery_aud":198.82,"primary_discrepancy_type":"procedure_phantom","discrepancy_types":["procedure_phantom"],"information_gaps":[],"discrepancy_count":1,"needs_information_count":0,"supported_count":1,"findings_narrative":"- DISCREPANCY | Procedure/theatre line billed but not performed: The billed additional intraoperative procedure is not matched by any separate additional procedure in the operation title, findings or technique. The documented operative work is the arthroscopy with debridement/partial meniscectomy only, with no additional intraoperative service described.","operative_note_assessment":"The operative note supports the principal billed arthroscopic partial medial meniscectomy item 49580. It does not document any separate additional intraoperative procedure corresponding to item 34992.","discharge_summary_assessment":null,"discharge_summary_ai_summary":"Patient underwent arthroscopic partial meniscectomy for medial meniscus tear, discharged same day with crutches and pain management.","operative_note_ai_summary":"Arthroscopic partial medial meniscectomy performed on right knee due to medial meniscus tear, with no complications or implants used.","reviewed_at":"2026-11-20T06:49:25.103670Z"},"documents":[{"document_id":"47e909cb-9c3b-4e28-94e4-524792501
```

`GET /api/genie/status` → 200

```json
{"configured":true,"space_id":"01f1e4ab2b7a1f3492e03099f81db7d7"}
```

## `claims-integrity-insights`

| field | value |
|---|---|
| app status | RUNNING |
| compute | ACTIVE |
| active deployment | SUCCEEDED |
| resources | sql-warehouse, files, genie-space |
| user API scopes | genie |

`GET /health` → 200

```json
{"status":"ok"}
```

`GET /api/app-config` → 200

```json
{"genie":{"configured":true,"alias":"default","executionIdentity":"user"},"scans":{"imageProcessing":true},"appName":"claims-integrity-insights"}
```

