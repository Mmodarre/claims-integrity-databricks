# Unity Catalog: governance

_Collected 2026-11-20 06:56 UTC from the live workspace by `scripts/collect_evidence.py`._

Medallion schemas with classification tags, PII column tags and masks, restricted ground truth, least-privilege grants to app service principals, and lineage.

### Schemas, comments and classification tags

```sql
SELECT s.schema_name, s.comment, t.tag_name, t.tag_value
FROM mehdidatalake_catalog.information_schema.schemata s
LEFT JOIN mehdidatalake_catalog.information_schema.schema_tags t ON t.schema_name = s.schema_name
WHERE s.schema_name IN ('integrity_raw', 'integrity_bronze', 'integrity_silver', 'integrity_gold', 'integrity_eval', 'integrity_synced', 'integrity_app') ORDER BY 1
```

| schema_name | comment | tag_name | tag_value |
|---|---|---|---|
| integrity_app |  |  |  |
| integrity_bronze | Claims integrity demo: raw tables 1:1 with landed export files (pipelines only) | data_classification | confidential |
| integrity_eval | Claims integrity demo: ground truth labels and AI accuracy evaluation (restricted) | data_classification | restricted |
| integrity_gold | Claims integrity demo: app- and metric-view-facing tables and metric views | data_classification | internal |
| integrity_raw | Claims integrity demo: raw landing zone (source files as delivered) | data_classification | confidential |
| integrity_silver | Claims integrity demo: cleaned, typed, conformed entities and AI intermediate outputs | data_classification | confidential |
| integrity_synced |  |  |  |
### Table-level classification tags

```sql
SELECT schema_name, table_name, tag_name, tag_value FROM mehdidatalake_catalog.information_schema.table_tags
WHERE schema_name IN ('integrity_raw', 'integrity_bronze', 'integrity_silver', 'integrity_gold', 'integrity_eval') ORDER BY 1, 2
```

| schema_name | table_name | tag_name | tag_value |
|---|---|---|---|
| integrity_gold | claim_detail | data_classification | pii |
| integrity_silver | member | data_classification | pii |
### Column-level PII tags (governed tag policies: pii, class.*)

```sql
SELECT schema_name, table_name, column_name, tag_name, tag_value FROM mehdidatalake_catalog.information_schema.column_tags
WHERE schema_name IN ('integrity_raw', 'integrity_bronze', 'integrity_silver', 'integrity_gold', 'integrity_eval') ORDER BY 1, 2, 3, 4
```

| schema_name | table_name | column_name | tag_name | tag_value |
|---|---|---|---|---|
| integrity_gold | claim_detail | medicare_number | class.au_medicare |  |
| integrity_gold | claim_detail | medicare_number | pii | true |
| integrity_gold | claim_detail | member_dob | class.date_of_birth |  |
| integrity_gold | claim_detail | member_dob | pii | true |
| integrity_gold | claim_detail | member_full_name | class.name |  |
| integrity_gold | claim_detail | member_full_name | pii | true |
| integrity_silver | member | address_line_1 | class.street_address |  |
| integrity_silver | member | address_line_1 | pii | true |
| integrity_silver | member | date_of_birth | class.date_of_birth |  |
| integrity_silver | member | date_of_birth | pii | true |
| integrity_silver | member | email | class.email_address |  |
| integrity_silver | member | email | pii | email |
| integrity_silver | member | first_name | class.name |  |
| integrity_silver | member | first_name | pii | true |
| integrity_silver | member | last_name | class.name |  |
| integrity_silver | member | last_name | pii | true |
| integrity_silver | member | medicare_number | class.au_medicare |  |
| integrity_silver | member | medicare_number | pii | true |
| integrity_silver | member | mobile_phone | class.phone_number |  |
| integrity_silver | member | mobile_phone | pii | true |
### Column masks on member PII

```sql
SELECT table_schema, table_name, column_name, mask_name FROM mehdidatalake_catalog.information_schema.column_masks
WHERE table_schema IN ('integrity_raw', 'integrity_bronze', 'integrity_silver', 'integrity_gold', 'integrity_eval') ORDER BY 1, 2, 3
```

| table_schema | table_name | column_name | mask_name |
|---|---|---|---|
| integrity_gold | claim_detail | medicare_number | mehdidatalake_catalog.integrity_gold.mask_pii_string |
| integrity_gold | claim_detail | member_dob | mehdidatalake_catalog.integrity_gold.mask_pii_date |
| integrity_gold | claim_detail | member_full_name | mehdidatalake_catalog.integrity_gold.mask_pii_string |
### Mask function definition

```sql
DESCRIBE FUNCTION EXTENDED mehdidatalake_catalog.integrity_gold.mask_pii_string
```

| function_desc |
|---|
| Function:      mehdidatalake_catalog.integrity_gold.mask_pii_string |
| Type:          SCALAR |
| Input:         value STRING |
| Returns:       STRING |
| Comment:       Column mask: reveal member PII only to admins and the claims_integrity_auditors group. |
| Deterministic: true |
| Data Access:   CONTAINS SQL |
| Configs:       runtime.databricks.sql.functions.counter_diff.enabled=true |
|                runtime.databricks.sql.functions.time_bucket.enabled=true |
|                spark.databricks.ai.adaptiveBatch.initialSize=4 |
|                spark.databricks.ai.adaptiveBatch.maxRetries=30 |
|                spark.databricks.ai.adaptiveBatch.partitionJitterEnabled=true |
|                spark.databricks.ai.adaptiveBatch.retriableInvokeStatusCodes=UNAVAILABLE,RESOURCE_EXHAUSTED,DEADLINE_EXCEEDED,ABORTED,CANCELLED |
|                spark.databricks.ai.adaptiveBatch.retryMaxDelayMs=120000 |
|                spark.databricks.ai.grpc.sync.retriableStatusCodes=UNAVAILABLE,RESOURCE_EXHAUSTED,DEADLINE_EXCEEDED,ABORTED,CANCELLED |
|                spark.databricks.docingest.apdfl.sandbox.enabled=false |
|                spark.databricks.docingest.batchEval.size=8 |
|                spark.databricks.docingest.contentElementTypes.excluded= |
|                spark.databricks.docingest.maxDocumentPages=1000 |
|                spark.databricks.docingest.pagination.concurrency=1 |
|                spark.databricks.docingest.pdf.drawFlags=USE_ANNOT_FACES |
|                spark.databricks.docingest.stage2.descriptionModel=databricks-gemma-3-12b |
|                spark.databricks.docingest.version.default=2.0 |
|                spark.databricks.sql.ai.hermes.embeddingBatch.enabled=true |
|                spark.databricks.sql.ai.partitionProcessor.aimdLimiter.enabled=true |
|                spark.databricks.sql.ai.partitionProcessor.aimdLimiter.max=200 |
|                spark.databricks.sql.ai.partitionProcessor.globalMaxInFlightElements=10240 |
|                spark.databricks.sql.ai.partitionProcessor.maxBufferedResults=512 |
|                spark.databricks.sql.ai.partitionProcessor.maxInFlightElements=200 |
|                spark.databricks.sql.ai.partitionProcessor.maxWaitTimeSeconds=172800 |
|                spark.databricks.sql.ai.remoteFunction.grpc.initialRetryInterval=100 |
|                spark.databricks.sql.ai.remoteFunction.grpc.maxRetryInterval=10000 |
|                spark.databricks.sql.ai.remoteFunction.grpc.retryIntervalJitterFactor=1.0 |
|                spark.databricks.sql.ai.remoteFunction.grpc.richArguments.enabled=true |
|                spark.databricks.sql.ai.remoteFunction.hermes.extendedTypeConversion.enabled=true |
|                spark.databricks.sql.expression.aiFunctions.repartition=0 |
|                spark.databricks.sql.functions.aiDetectAnomalies.enabled=true |
|                spark.databricks.sql.functions.aiForecast.enabled=true |
|                spark.databricks.sql.functions.aiForecastV2.enabled=true |
|                spark.databricks.sql.functions.aiForecastV2.modelPath=/Volumes/system/__internal_ai/ai_forecast_volume/forecaster_v7 |

_148 more rows not shown._
### Grants on the gold schema objects (app service principals get SELECT on exactly what they read)

```sql
SELECT grantee, table_schema, table_name, privilege_type FROM mehdidatalake_catalog.information_schema.table_privileges
WHERE table_schema IN ('integrity_gold', 'integrity_synced', 'integrity_app') AND grantee <> current_user()
ORDER BY 1, 2, 3
```

| grantee | table_schema | table_name | privilege_type |
|---|---|---|---|
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | claim_document_review | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | claim_finding | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | claims_forecast | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | document_ai_fact | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | document_element | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | hospital_risk_profile | SELECT |
| 65fd2f61-3730-48c5-8f5a-f77da8794683 | integrity_gold | provider_risk_profile | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_decision_history | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_decision_history | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_decision_history | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_feedback_history | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_feedback_history | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_auditor_feedback_history | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_document_request_history | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_document_request_history | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_app | lb_document_request_history | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_admission_coding_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_admission_coding_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_admission_coding_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_detail_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_detail_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_detail_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_line_detail_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_line_detail_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_line_detail_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_risk_score_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_risk_score_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claim_risk_score_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claims_fact_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claims_fact_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_claims_fact_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_flagged_claim_queue_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_flagged_claim_queue_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_27e9e917_5a5f_4c9e_a3e1_f35abe445347_flagged_claim_queue_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_document_review_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_document_review_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_document_review_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_finding_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_finding_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_finding_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_triage_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_triage_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_claim_triage_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_ai_fact_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_ai_fact_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_ai_fact_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_element_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_element_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_document_element_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_hospital_risk_profile_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_hospital_risk_profile_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_hospital_risk_profile_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_case_fact_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_case_fact_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_case_fact_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_finding_fact_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_finding_fact_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_integrity_finding_fact_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_provider_risk_profile_1 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_provider_risk_profile_1 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | __materialization_mat_f3ff5b97_1512_4443_b68f_83cceda965d6_provider_risk_profile_1 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | admission_coding | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | admission_coding | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | admission_coding | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | auditor_decision | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | auditor_decision | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | auditor_decision | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_detail | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_detail | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_detail | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_document_review | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_document_review | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_document_review | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_finding | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_finding | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_finding | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_line_detail | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_line_detail | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_line_detail | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | integrity_gold | claim_risk_score | MANAGE |

_147 more rows not shown._
### Ground truth is isolated: who can read the eval schema

```sql
SELECT grantee, privilege_type FROM mehdidatalake_catalog.information_schema.schema_privileges
WHERE schema_name = 'integrity_eval'
```

| grantee | privilege_type |
|---|---|
| jason.scalia@databricks.com | EXECUTE |
| jason.scalia@databricks.com | SELECT |
| jason.scalia@databricks.com | USE_SCHEMA |
| parth.rampal@databricks.com | USE_SCHEMA |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | ALL_PRIVILEGES |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | MANAGE |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | SELECT |
| e11003f7-f6b6-41ce-8263-94cf9012fc57 | USE_SCHEMA |
### Lineage: upstream tables feeding gold.claim_finding (system.access.table_lineage)

```sql
SELECT DISTINCT source_table_full_name, target_table_full_name
FROM system.access.table_lineage
WHERE target_table_full_name LIKE 'mehdidatalake_catalog.integrity_gold.claim_finding' AND source_table_full_name IS NOT NULL
ORDER BY 1
```

| source_table_full_name | target_table_full_name |
|---|---|
| mehdidatalake_catalog.integrity_gold.document_element | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.admission_archetype | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.claim_episode | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.claim_line | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.discrepancy_type | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.document_llm_review | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.document_rule_finding | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.drg_price_delta | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.hospital_admission | mehdidatalake_catalog.integrity_gold.claim_finding |
| mehdidatalake_catalog.integrity_silver.mbs_item | mehdidatalake_catalog.integrity_gold.claim_finding |
### Lineage: what reads the parsed documents

```sql
SELECT DISTINCT source_table_full_name, target_table_full_name
FROM system.access.table_lineage
WHERE source_table_full_name = 'mehdidatalake_catalog.integrity_silver.document_parsed' AND target_table_full_name IS NOT NULL
ORDER BY 2
```

| source_table_full_name | target_table_full_name |
|---|---|
| mehdidatalake_catalog.integrity_silver.document_parsed | mehdidatalake_catalog.integrity_gold.document_ai_fact |
| mehdidatalake_catalog.integrity_silver.document_parsed | mehdidatalake_catalog.integrity_gold.document_element |
| mehdidatalake_catalog.integrity_silver.document_parsed | mehdidatalake_catalog.integrity_silver.discharge_summary_facts |
| mehdidatalake_catalog.integrity_silver.document_parsed | mehdidatalake_catalog.integrity_silver.document_text |
| mehdidatalake_catalog.integrity_silver.document_parsed | mehdidatalake_catalog.integrity_silver.operative_note_facts |
