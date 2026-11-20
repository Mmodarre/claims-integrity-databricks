# Lakebase: operational serving and write-back

_Collected 2026-11-20 07:06 UTC from the live workspace by `scripts/collect_evidence.py`._

Gold tables are synced into Lakebase Postgres for the auditor app; auditor decisions are written to Postgres and flow back to Unity Catalog through Lakehouse Sync, feeding the metric views.

## Project

```json
{
 "create_time": "2026-11-20T06:26:50Z",
 "name": "projects/claims-integrity",
 "project_id": "claims-integrity",
 "spec": {
  "display_name": "Claims Integrity Auditor"
 },
 "status": {
  "branch_logical_size_limit_bytes": 35184372088832,
  "compute_last_active_time": "2026-11-20T06:57:30Z",
  "default_branch": "projects/claims-integrity/branches/production",
  "default_endpoint_settings": {
   "autoscaling_limit_max_cu": 1,
   "autoscaling_limit_min_cu": 1,
   "suspend_timeout_duration": "86400s"
  },
  "display_name": "Claims Integrity Auditor",
  "enable_pg_native_login": false,
  "history_retention_duration": "604800s",
  "owner": "<operator>",
  "pg_version": 17,
  "project_id": "claims-integrity",
  "synthetic_storage_size_bytes": 0
 },
 "uid": "b8babc6d-ab92-45e8-b784-3873c0d3da78",
 "update_time": "2026-11-20T06:57:32Z"
}
```

## Synced tables (Unity Catalog gold → Lakebase Postgres)

| synced table | source (UC gold) | mode | state | sync pipeline |
|---|---|---|---|---|
| flagged_claim_queue | mehdidatalake_catalog.integrity_gold.flagged_claim_queue | CONTINUOUS | SYNCED_TABLE_ONLINE_CONTINUOUS_UPDATE | 5cfa81b7-99f2-4b2b-92a1-71482efd5839 |
| claim_triage | mehdidatalake_catalog.integrity_gold.claim_triage | CONTINUOUS | SYNCED_TABLE_ONLINE_CONTINUOUS_UPDATE | 5cfa81b7-99f2-4b2b-92a1-71482efd5839 |
| claim_finding | mehdidatalake_catalog.integrity_gold.claim_finding | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| claim_detail | mehdidatalake_catalog.integrity_gold.claim_detail | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| claim_line_detail | mehdidatalake_catalog.integrity_gold.claim_line_detail | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| admission_coding | mehdidatalake_catalog.integrity_gold.admission_coding | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| claim_document_review | mehdidatalake_catalog.integrity_gold.claim_document_review | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| document_element | mehdidatalake_catalog.integrity_gold.document_element | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| document_ai_fact | mehdidatalake_catalog.integrity_gold.document_ai_fact | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| hospital_risk_profile | mehdidatalake_catalog.integrity_gold.hospital_risk_profile | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |
| provider_risk_profile | mehdidatalake_catalog.integrity_gold.provider_risk_profile | SNAPSHOT | SYNCED_TABLE_ONLINE_NO_PENDING_UPDATE | 92a35b74-021f-43a5-879b-f35a4d8d111c |

## Live Postgres queries (as the project owner)

### Row counts of synced tables in Postgres

```sql
SELECT 'flagged_claim_queue' t, count(*) FROM integrity_synced.flagged_claim_queue
UNION ALL SELECT 'claim_triage', count(*) FROM integrity_synced.claim_triage
UNION ALL SELECT 'claim_finding', count(*) FROM integrity_synced.claim_finding
UNION ALL SELECT 'claim_detail', count(*) FROM integrity_synced.claim_detail
UNION ALL SELECT 'document_element', count(*) FROM integrity_synced.document_element
```

| t | count |
|---|---|
| flagged_claim_queue | 817 |
| claim_triage | 817 |
| claim_finding | 538 |
| claim_detail | 7910 |
| document_element | 6473 |
### Queue query the auditor app runs (top flagged claims with AI triage)

```sql
SELECT q.claim_number, q.hospital_name, round(q.ml_fraud_score::numeric, 3) score, t.recommendation, t.discrepancy_type,
       round(t.confidence::numeric, 2) confidence
FROM integrity_synced.flagged_claim_queue q JOIN integrity_synced.claim_triage t USING (claim_id)
ORDER BY q.ml_fraud_score DESC LIMIT 8
```

| claim_number | hospital_name | score | recommendation | discrepancy_type | confidence |
|---|---|---|---|---|---|
| CLM-W6-2021-00004500 | VIC Hospital 209 | 0.989 | investigate | quantity_overstatement | 0.72 |
| CLM-W0-2021-00005362 | WA Hospital 074 | 0.989 | escalate | age_eligibility | 0.98 |
| CLM-W4-2021-00006249 | QLD Hospital 233 | 0.988 | investigate | assistant_phantom | 0.42 |
| CLM-W0-2021-00005320 | WA Hospital 144 | 0.988 | investigate | procedure_phantom | 0.56 |
| CLM-W3-2021-00003524 | SA Hospital 067 | 0.988 | dismiss | none | 0.12 |
| CLM-W3-2021-00006333 | VIC Hospital 188 | 0.988 | investigate | drg_upcoding | 0.78 |
| CLM-W1-2021-00000149 | WA Hospital 071 | 0.988 | investigate | age_eligibility | 0.94 |
| CLM-W5-2021-00002401 | WA Hospital 147 | 0.987 | investigate | procedure_phantom | 0.72 |
### App-owned tables written by the auditor app (schema auditor)

```sql
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from auditor.%I', table_name), false, true, '')))[1]::text::int AS rows
FROM information_schema.tables WHERE table_schema = 'auditor' ORDER BY 1
```

| table_name | rows |
|---|---|
| auditor_decision | 1 |
| auditor_feedback | 0 |
| document_request | 0 |
### Latest auditor decisions in Postgres

```sql
SELECT claim_id, finding_id IS NOT NULL AS finding_level, decision, confirmed_recovery_aud, decided_at
FROM auditor.auditor_decision ORDER BY decided_at DESC LIMIT 10
```

| claim_id | finding_level | decision | confirmed_recovery_aud | decided_at |
|---|---|---|---|---|
| 68ce3ffe-cf9d-4485-8ab3-f50273f03bf0 | True | confirmed | 198.82 | 2026-11-20 06:42:02.558915+00:00 |
## Write-back in Unity Catalog (Lakehouse Sync → gold)

### Change feed landed in UC by Lakehouse Sync

```sql
SELECT _pg_change_type, count(*) n, max(_timestamp) latest FROM mehdidatalake_catalog.integrity_app.lb_auditor_decision_history GROUP BY 1
```

| _pg_change_type | n | latest |
|---|---|---|
| insert | 1 | 2026-11-20T06:42:03.857 |
### gold.auditor_decision view (latest state per decision) consumed by the pipelines

```sql
SELECT decision, count(*) n, sum(confirmed_recovery_aud) confirmed_recovery_aud FROM mehdidatalake_catalog.integrity_gold.auditor_decision GROUP BY 1
```

| decision | n | confirmed_recovery_aud |
|---|---|---|
| confirmed | 1 | 198.82 |
### Confirmed recovery flowing into the metric view

```sql
SELECT MEASURE(identified_recovery) identified, MEASURE(confirmed_recovery) confirmed, MEASURE(auditor_decisions) decisions
FROM mehdidatalake_catalog.integrity_gold.mv_integrity_funnel
```

| identified | confirmed | decisions |
|---|---|---|
| 145338.67 | 198.82 | 1 |
