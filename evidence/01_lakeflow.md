# Lakeflow: pipelines and job runs

_Collected 2026-11-20 07:00 UTC from the live workspace by `scripts/collect_evidence.py`._

Two Spark Declarative Pipelines and one Lakeflow job (setup → ingest → ai → governance + semantic).

## Job `claims_integrity_etl` — recent runs (task level)

| run_id | start (UTC) | task | result | minutes |
|---|---|---|---|---|
| 739198944604163 | 2026-11-20 06:43 | semantic | SUCCESS | 0.8 |
| 739198944604163 | 2026-11-20 06:43 | governance | SUCCESS | 0.2 |
| 739198944604163 | 2026-11-20 06:43 | ai | SUCCESS | 4.3 |
| 739198944604163 | 2026-11-20 06:43 | setup | SUCCESS | 0.1 |
| 739198944604163 | 2026-11-20 06:43 | ingest | SUCCESS | 3.6 |
| 739198944604163 | 2026-11-20 06:43 | refresh_lakebase | SUCCESS | 1.1 |
| 677162942767480 | 2026-11-20 05:41 | semantic | SUCCESS | 0.7 |
| 677162942767480 | 2026-11-20 05:41 | semantic | SUCCESS | 0.7 |
| 677162942767480 | 2026-11-20 05:41 | governance | FAILED | 0.0 |
| 677162942767480 | 2026-11-20 05:41 | governance | FAILED | 0.0 |
| 677162942767480 | 2026-11-20 05:41 | governance | SUCCESS | 0.1 |
| 677162942767480 | 2026-11-20 05:41 | ai | SUCCESS | 34.5 |
| 677162942767480 | 2026-11-20 05:41 | setup | SUCCESS | 0.1 |
| 677162942767480 | 2026-11-20 05:41 | ingest | SUCCESS | 2.9 |
| 259587980588871 | 2026-11-20 05:34 | semantic | UPSTREAM_CANCELED |  |
| 259587980588871 | 2026-11-20 05:34 | governance | UPSTREAM_CANCELED |  |
| 259587980588871 | 2026-11-20 05:34 | ai | UPSTREAM_CANCELED |  |
| 259587980588871 | 2026-11-20 05:34 | setup | SUCCESS | 0.1 |
| 259587980588871 | 2026-11-20 05:34 | ingest | CANCELED | 2.1 |

## Pipeline `claims_integrity_ingest` — recent updates

| update_id | state | cause | full_refresh | created (UTC) |
|---|---|---|---|---|
| 4ff5e11f-740f-456b-b7c3-872b4af2c54b | COMPLETED | JOB_TASK | False | 2026-11-20 06:44 |
| 2432b424-cad4-462e-a6b7-b24fb70844ca | COMPLETED | JOB_TASK | False | 2026-11-20 05:42 |
| 4344dea8-4fb1-441b-bb64-52d6196b9933 | COMPLETED | API_CALL | True | 2026-11-20 05:36 |
| 452d9a3d-6536-468a-a71f-a991dca063dd | CANCELED | JOB_TASK | False | 2026-11-20 05:34 |

### Flows in update `4ff5e11f-740f-456b-b7c3-872b4af2c54b` (rows written, from event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS flow,
       max(details:flow_progress.status::STRING) FILTER (WHERE details:flow_progress.status::STRING = 'COMPLETED') AS status,
       sum(details:flow_progress.metrics.num_output_rows::BIGINT) AS rows_written
FROM event_log('27e9e917-5a5f-4c9e-a3e1-f35abe445347')
WHERE event_type = 'flow_progress' AND origin.update_id = '4ff5e11f-740f-456b-b7c3-872b4af2c54b'
GROUP BY 1 ORDER BY 1
```

| flow | status | rows_written |
|---|---|---|
| admission_archetype | COMPLETED | 15 |
| admission_coding | COMPLETED | 6133 |
| admission_diagnosis | COMPLETED | 4282 |
| admission_procedure | COMPLETED | 1851 |
| benefit_usage | COMPLETED | 32224 |
| claim | COMPLETED |  |
| claim_assessment | COMPLETED | 50220 |
| claim_detail | COMPLETED | 7910 |
| claim_episode | COMPLETED |  |
| claim_fraud_label | COMPLETED | 50220 |
| claim_line | COMPLETED | 124386 |
| claim_line_detail | COMPLETED | 51954 |
| claim_risk_score | COMPLETED |  |
| claims__admission_diagnosis | COMPLETED |  |
| claims__admission_procedure | COMPLETED |  |
| claims__benefit_usage | COMPLETED |  |
| claims__claim | COMPLETED |  |
| claims__claim_assessment | COMPLETED |  |
| claims__claim_line | COMPLETED |  |
| claims__hospital_admission | COMPLETED |  |
| claims__medical_service | COMPLETED |  |
| claims__prosthesis_claim | COMPLETED |  |
| claims_fact | COMPLETED | 50220 |
| coverage | COMPLETED | 12367 |
| discrepancy_type | COMPLETED | 13 |
| document_registry | COMPLETED | 396 |
| drg_price_delta | COMPLETED | 7 |
| flagged_claim_queue | COMPLETED |  |
| hospital | COMPLETED | 295 |
| hospital_admission | COMPLETED | 7910 |
| image_claim_map | COMPLETED |  |
| integrity__clinical_document | COMPLETED |  |
| integrity__clinical_document_pending | COMPLETED |  |
| integrity__episode_ground_truth | COMPLETED |  |
| integrity__evidence_span | COMPLETED |  |
| integrity__integrity_finding | COMPLETED |  |
| integrity__rendered_document | COMPLETED |  |
| mbs_item | COMPLETED | 584 |
| medical_service | COMPLETED | 36664 |
| member | COMPLETED | 12773 |
| missingFlowName |  |  |
| policy | COMPLETED | 5919 |
| policy__coverage | COMPLETED |  |
| policy__member | COMPLETED |  |
| policy__policy | COMPLETED |  |
| policy__policy_member | COMPLETED |  |
| policy_member | COMPLETED | 12773 |
| product | COMPLETED | 46 |
| prosthesis_claim | COMPLETED | 952 |
| prosthesis_list_item | COMPLETED | 436 |
| provider | COMPLETED | 3263 |
| reference__admission_archetype | COMPLETED |  |
| reference__hospital | COMPLETED |  |
| reference__integrity_discrepancy_type | COMPLETED |  |
| reference__mbs_item | COMPLETED |  |
| reference__product | COMPLETED |  |
| reference__prosthesis_list_item | COMPLETED |  |
| reference__provider | COMPLETED |  |
### Flows in update `4344dea8-4fb1-441b-bb64-52d6196b9933` (rows written, from event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS flow,
       max(details:flow_progress.status::STRING) FILTER (WHERE details:flow_progress.status::STRING = 'COMPLETED') AS status,
       sum(details:flow_progress.metrics.num_output_rows::BIGINT) AS rows_written
FROM event_log('27e9e917-5a5f-4c9e-a3e1-f35abe445347')
WHERE event_type = 'flow_progress' AND origin.update_id = '4344dea8-4fb1-441b-bb64-52d6196b9933'
GROUP BY 1 ORDER BY 1
```

| flow | status | rows_written |
|---|---|---|
| admission_archetype | COMPLETED | 15 |
| admission_coding | COMPLETED | 6133 |
| admission_diagnosis | COMPLETED | 4282 |
| admission_procedure | COMPLETED | 1851 |
| benefit_usage | COMPLETED | 32224 |
| claim | COMPLETED | 50220 |
| claim_assessment | COMPLETED | 50220 |
| claim_detail | COMPLETED | 7910 |
| claim_episode | COMPLETED | 7910 |
| claim_fraud_label | COMPLETED | 50220 |
| claim_line | COMPLETED | 124386 |
| claim_line_detail | COMPLETED | 51954 |
| claim_risk_score | COMPLETED | 7910 |
| claims__admission_diagnosis | COMPLETED | 4282 |
| claims__admission_procedure | COMPLETED | 1851 |
| claims__benefit_usage | COMPLETED | 32224 |
| claims__claim | COMPLETED | 50220 |
| claims__claim_assessment | COMPLETED | 50220 |
| claims__claim_line | COMPLETED | 124386 |
| claims__hospital_admission | COMPLETED | 7910 |
| claims__medical_service | COMPLETED | 36664 |
| claims__prosthesis_claim | COMPLETED | 952 |
| claims_fact | COMPLETED | 50220 |
| coverage | COMPLETED | 12367 |
| discrepancy_type | COMPLETED | 13 |
| document_registry | COMPLETED | 396 |
| drg_price_delta | COMPLETED | 7 |
| flagged_claim_queue | COMPLETED | 817 |
| hospital | COMPLETED | 295 |
| hospital_admission | COMPLETED | 7910 |
| image_claim_map | COMPLETED | 396 |
| integrity__clinical_document | COMPLETED | 995 |
| integrity__clinical_document_pending | COMPLETED | 1496 |
| integrity__episode_ground_truth | COMPLETED | 1496 |
| integrity__evidence_span | COMPLETED | 471 |
| integrity__integrity_finding | COMPLETED | 820 |
| integrity__rendered_document | COMPLETED | 396 |
| mbs_item | COMPLETED | 584 |
| medical_service | COMPLETED | 36664 |
| member | COMPLETED | 12773 |
| missingFlowName |  |  |
| policy | COMPLETED | 5919 |
| policy__coverage | COMPLETED | 12367 |
| policy__member | COMPLETED | 12773 |
| policy__policy | COMPLETED | 5919 |
| policy__policy_member | COMPLETED | 12773 |
| policy_member | COMPLETED | 12773 |
| product | COMPLETED | 46 |
| prosthesis_claim | COMPLETED | 952 |
| prosthesis_list_item | COMPLETED | 436 |
| provider | COMPLETED | 3263 |
| reference__admission_archetype | COMPLETED | 15 |
| reference__hospital | COMPLETED | 295 |
| reference__integrity_discrepancy_type | COMPLETED | 13 |
| reference__mbs_item | COMPLETED | 584 |
| reference__product | COMPLETED | 46 |
| reference__prosthesis_list_item | COMPLETED | 436 |
| reference__provider | COMPLETED | 3263 |
### Data-quality expectations in update `4344dea8-4fb1-441b-bb64-52d6196b9933` (event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS dataset, e.name AS expectation,
       sum(e.passed_records) AS passed, sum(e.failed_records) AS failed
FROM event_log('27e9e917-5a5f-4c9e-a3e1-f35abe445347')
LATERAL VIEW explode(from_json(details:flow_progress.data_quality.expectations::STRING,
     'ARRAY<STRUCT<name: STRING, dataset: STRING, passed_records: BIGINT, failed_records: BIGINT>>')) x AS e
WHERE event_type = 'flow_progress' AND origin.update_id = '4344dea8-4fb1-441b-bb64-52d6196b9933'
GROUP BY 1, 2 ORDER BY 1, 2
```

| dataset | expectation | passed | failed |
|---|---|---|---|
| admission_diagnosis | diagnosis_code_present | 4282 | 0 |
| admission_procedure | procedure_code_present | 1851 | 0 |
| claim | benefit_within_charge | 50220 | 0 |
| claim | charges_non_negative | 50220 | 0 |
| claim | claim_id_present | 50220 | 0 |
| claim | lodged_after_service | 49947 | 273 |
| claim_assessment | assessment_id_present | 50220 | 0 |
| claim_detail | claim_id_present | 7910 | 0 |
| claim_episode | has_admission | 7910 | 0 |
| claim_episode | has_hospital | 7910 | 0 |
| claim_line | benefit_non_negative | 124386 | 0 |
| claim_line | charge_non_negative | 124386 | 0 |
| claim_line | claim_line_id_present | 124386 | 0 |
| claim_line | positive_quantity | 124386 | 0 |
| claim_line_detail | claim_line_id_present | 51954 | 0 |
| claim_risk_score | score_in_range | 7910 | 0 |
| claims_fact | claim_id_present | 50220 | 0 |
| document_registry | volume_path_present | 396 | 0 |
| flagged_claim_queue | claim_id_present | 817 | 0 |
| flagged_claim_queue | flagged_only | 817 | 0 |
| hospital | hospital_id_present | 295 | 0 |
| hospital_admission | admission_id_present | 7910 | 0 |
| hospital_admission | discharge_after_admission | 7910 | 0 |
| hospital_admission | los_matches_dates | 7910 | 0 |
| mbs_item | item_number_present | 584 | 0 |
| medical_service | medical_service_id_present | 36664 | 0 |
| member | member_id_present | 12773 | 0 |
| member | plausible_dob | 12773 | 0 |
| policy | policy_id_present | 5919 | 0 |
| prosthesis_claim | positive_quantity | 952 | 0 |
| prosthesis_claim | prosthesis_claim_id_present | 952 | 0 |
| provider | provider_id_present | 3263 | 0 |
## Pipeline `claims_integrity_ai` — recent updates

| update_id | state | cause | full_refresh | created (UTC) |
|---|---|---|---|---|
| 2e96ea40-cd42-4c8f-a449-1fc9559e8065 | COMPLETED | JOB_TASK | False | 2026-11-20 06:47 |
| e19836d1-9197-4f9e-badb-a577d1f5ae0d | COMPLETED | JOB_TASK | False | 2026-11-20 05:44 |

### Flows in update `2e96ea40-cd42-4c8f-a449-1fc9559e8065` (rows written, from event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS flow,
       max(details:flow_progress.status::STRING) FILTER (WHERE details:flow_progress.status::STRING = 'COMPLETED') AS status,
       sum(details:flow_progress.metrics.num_output_rows::BIGINT) AS rows_written
FROM event_log('f3ff5b97-1512-4443-b68f-83cceda965d6')
WHERE event_type = 'flow_progress' AND origin.update_id = '2e96ea40-cd42-4c8f-a449-1fc9559e8065'
GROUP BY 1 ORDER BY 1
```

| flow | status | rows_written |
|---|---|---|
| ai_eval_finding_match | COMPLETED | 191 |
| ai_eval_summary | COMPLETED | 13 |
| ai_eval_triage | COMPLETED | 817 |
| claim_document_review | COMPLETED | 200 |
| claim_finding | COMPLETED | 538 |
| claim_triage | COMPLETED |  |
| discharge_summary_facts | COMPLETED |  |
| document_ai_fact | COMPLETED | 396 |
| document_element | COMPLETED | 6473 |
| document_llm_review | COMPLETED |  |
| document_parsed | COMPLETED |  |
| document_rule_finding | COMPLETED | 136 |
| document_text | COMPLETED |  |
| hospital_risk_profile | COMPLETED | 295 |
| integrity_case_fact | COMPLETED | 876 |
| integrity_finding_fact | COMPLETED | 538 |
| missingFlowName |  |  |
| operative_note_facts | COMPLETED |  |
| provider_risk_profile | COMPLETED | 2813 |
### Flows in update `e19836d1-9197-4f9e-badb-a577d1f5ae0d` (rows written, from event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS flow,
       max(details:flow_progress.status::STRING) FILTER (WHERE details:flow_progress.status::STRING = 'COMPLETED') AS status,
       sum(details:flow_progress.metrics.num_output_rows::BIGINT) AS rows_written
FROM event_log('f3ff5b97-1512-4443-b68f-83cceda965d6')
WHERE event_type = 'flow_progress' AND origin.update_id = 'e19836d1-9197-4f9e-badb-a577d1f5ae0d'
GROUP BY 1 ORDER BY 1
```

| flow | status | rows_written |
|---|---|---|
| ai_eval_finding_match | COMPLETED | 191 |
| ai_eval_summary | COMPLETED | 13 |
| ai_eval_triage | COMPLETED | 817 |
| claim_document_review | COMPLETED | 200 |
| claim_finding | COMPLETED | 538 |
| claim_triage | COMPLETED | 817 |
| discharge_summary_facts | COMPLETED | 198 |
| document_ai_fact | COMPLETED | 396 |
| document_element | COMPLETED | 6473 |
| document_llm_review | COMPLETED | 228 |
| document_parsed | COMPLETED | 396 |
| document_rule_finding | COMPLETED | 136 |
| document_text | COMPLETED | 396 |
| hospital_risk_profile | COMPLETED | 295 |
| integrity_case_fact | COMPLETED | 876 |
| integrity_finding_fact | COMPLETED | 538 |
| missingFlowName |  |  |
| operative_note_facts | COMPLETED | 198 |
| provider_risk_profile | COMPLETED | 2813 |
### Data-quality expectations in update `e19836d1-9197-4f9e-badb-a577d1f5ae0d` (event_log)

```sql
SELECT split(origin.flow_name, '\\.')[2] AS dataset, e.name AS expectation,
       sum(e.passed_records) AS passed, sum(e.failed_records) AS failed
FROM event_log('f3ff5b97-1512-4443-b68f-83cceda965d6')
LATERAL VIEW explode(from_json(details:flow_progress.data_quality.expectations::STRING,
     'ARRAY<STRUCT<name: STRING, dataset: STRING, passed_records: BIGINT, failed_records: BIGINT>>')) x AS e
WHERE event_type = 'flow_progress' AND origin.update_id = 'e19836d1-9197-4f9e-badb-a577d1f5ae0d'
GROUP BY 1, 2 ORDER BY 1, 2
```

| dataset | expectation | passed | failed |
|---|---|---|---|
| claim_document_review | claim_id_present | 200 | 0 |
| claim_finding | finding_id_present | 538 | 0 |
| claim_finding | recovery_not_negative | 538 | 0 |
| claim_finding | valid_verdict | 538 | 0 |
| claim_triage | confidence_in_range | 817 | 0 |
| claim_triage | triage_succeeded | 817 | 0 |
| discharge_summary_facts | extracted_without_error | 198 | 0 |
| discharge_summary_facts | has_admission_date | 198 | 0 |
| document_llm_review | review_succeeded | 228 | 0 |
| document_parsed | has_elements | 396 | 0 |
| document_parsed | parsed_without_error | 396 | 0 |
| document_text | type_matches_filename | 396 | 0 |
| integrity_case_fact | claim_id_present | 876 | 0 |
| integrity_finding_fact | finding_id_present | 538 | 0 |
| operative_note_facts | extracted_without_error | 198 | 0 |
| operative_note_facts | has_operation_date | 198 | 0 |
## Row counts by layer

### Bronze, silver, gold and eval row counts

```sql
SELECT 'bronze' layer, 'claims__claim' tbl, count(*) n FROM mehdidatalake_catalog.integrity_bronze.claims__claim
UNION ALL SELECT 'bronze', 'claims__claim_line', count(*) FROM mehdidatalake_catalog.integrity_bronze.claims__claim_line
UNION ALL SELECT 'bronze', 'policy__member', count(*) FROM mehdidatalake_catalog.integrity_bronze.policy__member
UNION ALL SELECT 'silver', 'claim', count(*) FROM mehdidatalake_catalog.integrity_silver.claim
UNION ALL SELECT 'silver', 'claim_line', count(*) FROM mehdidatalake_catalog.integrity_silver.claim_line
UNION ALL SELECT 'silver', 'claim_episode', count(*) FROM mehdidatalake_catalog.integrity_silver.claim_episode
UNION ALL SELECT 'silver', 'document_parsed', count(*) FROM mehdidatalake_catalog.integrity_silver.document_parsed
UNION ALL SELECT 'silver', 'operative_note_facts', count(*) FROM mehdidatalake_catalog.integrity_silver.operative_note_facts
UNION ALL SELECT 'silver', 'discharge_summary_facts', count(*) FROM mehdidatalake_catalog.integrity_silver.discharge_summary_facts
UNION ALL SELECT 'silver', 'document_llm_review', count(*) FROM mehdidatalake_catalog.integrity_silver.document_llm_review
UNION ALL SELECT 'gold', 'claims_fact', count(*) FROM mehdidatalake_catalog.integrity_gold.claims_fact
UNION ALL SELECT 'gold', 'flagged_claim_queue', count(*) FROM mehdidatalake_catalog.integrity_gold.flagged_claim_queue
UNION ALL SELECT 'gold', 'claim_triage', count(*) FROM mehdidatalake_catalog.integrity_gold.claim_triage
UNION ALL SELECT 'gold', 'claim_finding', count(*) FROM mehdidatalake_catalog.integrity_gold.claim_finding
UNION ALL SELECT 'gold', 'claim_document_review', count(*) FROM mehdidatalake_catalog.integrity_gold.claim_document_review
UNION ALL SELECT 'gold', 'document_element', count(*) FROM mehdidatalake_catalog.integrity_gold.document_element
UNION ALL SELECT 'gold', 'hospital_risk_profile', count(*) FROM mehdidatalake_catalog.integrity_gold.hospital_risk_profile
UNION ALL SELECT 'gold', 'claims_forecast', count(*) FROM mehdidatalake_catalog.integrity_gold.claims_forecast
UNION ALL SELECT 'eval', 'integrity__integrity_finding', count(*) FROM mehdidatalake_catalog.integrity_eval.integrity__integrity_finding
```

| layer | tbl | n |
|---|---|---|
| silver | claim_line | 124386 |
| gold | claims_fact | 50220 |
| gold | claim_finding | 538 |
| gold | claim_document_review | 200 |
| bronze | claims__claim | 50220 |
| bronze | claims__claim_line | 124386 |
| bronze | policy__member | 12773 |
| silver | claim | 50220 |
| silver | claim_episode | 7910 |
| silver | document_parsed | 396 |
| silver | operative_note_facts | 198 |
| silver | discharge_summary_facts | 198 |
| silver | document_llm_review | 228 |
| gold | flagged_claim_queue | 817 |
| gold | claim_triage | 817 |
| gold | document_element | 6473 |
| gold | hospital_risk_profile | 295 |
| gold | claims_forecast | 381 |
| eval | integrity__integrity_finding | 820 |
