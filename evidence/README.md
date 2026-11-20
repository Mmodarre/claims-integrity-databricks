# Execution evidence (text)

Everything here was produced by running the build on a Databricks workspace (Azure, serverless) on 2026-11-20.
Two kinds of files:

- **Collected query results** — `NN_*.md`, written by [`scripts/collect_evidence.py`](../scripts/collect_evidence.py)
  from the live workspace: job/pipeline run history (Jobs API + pipeline `event_log()`), table contents, Unity
  Catalog metadata, live Lakebase Postgres queries, live Genie conversations, live app API calls. Each section
  shows the exact SQL it ran next to the result.
- **Raw command logs** — `logs/*.log`, the console output of the deploy/run commands as they executed, captured
  with [`scripts/save_log.py`](../scripts/save_log.py). Failed first attempts are kept (e.g. the governance-tag
  syntax fix, the Lakebase/column-mask interaction) so the history is honest.

The workspace host, workspace id and operator identity are redacted (`<workspace-host>`, `<operator>`). A clinical
facility name and contact line that appears in the synthetic scan text is redacted as `[FACILITY REDACTED]`.

| Stage | Evidence | What it shows |
|---|---|---|
| Lakeflow | [`01_lakeflow.md`](01_lakeflow.md), [`logs/etl_job_run.log`](logs/etl_job_run.log), [`raw/01_lakeflow_runs.json`](raw/01_lakeflow_runs.json) | Job runs task by task (final run: setup, ingest, ai, refresh_lakebase, governance, semantic all SUCCESS); pipeline updates; rows written per flow in the initial full load and the latest run; 112 data-quality expectation results; row counts bronze → silver → gold |
| Unity Catalog | [`02_unity_catalog.md`](02_unity_catalog.md) | Schema/table classification tags, governed PII column tags (`pii`, `class.au_medicare`, `class.name`, `class.date_of_birth`, …), column masks on member PII, mask function definition, app service-principal grants, eval-schema isolation, lineage from `system.access.table_lineage` |
| Lakebase | [`03_lakebase.md`](03_lakebase.md), [`logs/lakebase_provision.log`](logs/lakebase_provision.log), [`logs/auditor_post_deploy.log`](logs/auditor_post_deploy.log) | Lakebase project; 11 synced tables online; live Postgres queries (synced row counts, the auditor queue query, app-owned tables, the recorded decision); Lakehouse Sync change feed in UC; `gold.auditor_decision`; confirmed recovery in the metric view |
| Gen AI | [`04_genai.md`](04_genai.md), [`../docs/evaluation.md`](../docs/evaluation.md) | Volume of each AI function call; real `ai_parse_document` elements with bounding boxes, `ai_extract` v2.1 facts with citations, `ai_mask`/`ai_classify`/`ai_summarize` output, `ai_query` triage and document-review findings with SQL recovery; accuracy vs ground truth; AI hospital narratives; `ai_forecast` rows; metric-view answers |
| Genie Agent | [`05_genie.md`](05_genie.md), [`logs/genie_benchmark.log`](logs/genie_benchmark.log), [`../genie/benchmark_results.json`](../genie/benchmark_results.json) | Live questions → generated SQL → result rows; benchmark of 28 questions (24/24 automatic checks pass, 4 guardrail answers for review) |
| Apps | [`06_apps.md`](06_apps.md), [`logs/insights_app_deploy.log`](logs/insights_app_deploy.log), [`logs/insights_app_smoke_test.log`](logs/insights_app_smoke_test.log), [`logs/auditor_app_deploy.log`](logs/auditor_app_deploy.log), [`logs/auditor_live_checks.log`](logs/auditor_live_checks.log) | Both apps RUNNING with SUCCEEDED deployments; AppKit validate (typegen, lint, typecheck, build) + platform build; apx build; smoke test of every insights data request; auditor live checks incl. an auditor decision written through the app, landing in Postgres and in UC via Lakehouse Sync |

## End-to-end trace of one claim (`CLM-W0-2021-00000082`)

1. **Ingest** — claim, lines and two scans land in bronze/silver (`01_lakeflow.md`).
2. **Fraud model** flags it (score ≥ 0.70) → `gold.flagged_claim_queue`.
3. **AI triage** (`ai_query`, claim data only) recommends *investigate* — likely `procedure_phantom` on add-on item 34992; request the operative note (`04_genai.md`).
4. **Document AI** parses both scans (`ai_parse_document`), masks PII (`ai_mask`), extracts facts with citations (`ai_extract`), and the LLM review finds item 34992 not performed; recovery A$198.82 computed in SQL; evidence bounding box located on the scan (`04_genai.md`).
5. **Lakebase** serves the claim to the auditor app; the auditor confirms the finding (A$198.82) → Postgres `auditor.auditor_decision` → Lakehouse Sync → `integrity_app.lb_auditor_decision_history` (`logs/auditor_live_checks.log`, `03_lakebase.md`).
6. **Pipelines** pick the decision up through `gold.auditor_decision`; `mv_integrity_funnel` reports confirmed recovery A$198.82 and AI–auditor agreement 100% (`03_lakebase.md`).
7. **Genie** and the **insights app** answer from the same metric views (`05_genie.md`, `logs/insights_app_smoke_test.log`).
