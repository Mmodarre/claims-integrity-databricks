# Claims Integrity on Databricks — catching hospital-claim fraud, waste and abuse from the clinical record

**Industry:** private health insurance (Australia) · **Outcome:** payment integrity / FWA recovery

## The customer problem

A private health insurer paid ~A$35M in hospital benefits on 7,900 episodes (2021–2023). Its fraud model flags ~10% of
them, but an investigator can only confirm a flag by reading the hospital's clinical documents (discharge summary,
operative note) and comparing them line by line with what was billed: Was the "overnight" stay really same-day? Was the
billed add-on procedure actually performed? Was the drug-eluting stent really implanted? Is the DRG complication
documented? That review is manual, slow and inconsistent, so most flags are never worked and recoverable benefit is lost.

This prototype makes that loop AI-native on one governed platform: scanned documents are read by AI inside the data
pipeline, every billed line is checked against the record (SQL rules for exact facts, an LLM for clinical judgment),
recovery dollars are computed in SQL, auditors work an AI-prioritised queue in an operational app backed by Lakebase,
their decisions flow back into the lakehouse, and leaders ask questions in natural language through Genie.

## End-to-end journey (all stages integrated)

```
 raw synthetic data (27 parquet exports + 396 JPG scans) ─► UC volume  integrity_raw.landing
   │
   ▼  Lakeflow Spark Declarative Pipelines (job claims_integrity_etl)
 claims_integrity_ingest:  bronze (Auto Loader) → silver (clean, typed, PII-tagged, hospitals pseudonymised)
                           → claim scoring (mock fraud model) → gold claims_fact / claim_detail (PII masked)
 claims_integrity_ai:      ai_parse_document → ai_mask / ai_classify / ai_summarize → ai_extract (citations)
                           → SQL rule checks + ai_query LLM review → gold claim_finding (recovery in SQL, evidence bbox)
                           → ai_query claim triage → hospital risk (ai_query narrative) → eval vs ground truth
 semantic task:            4 Unity Catalog metric views + ai_forecast
   │                                   │                                    │
   ▼                                   ▼                                    ▼
 Lakebase Postgres (synced tables)   Genie Agent (metric views)          Insights app (AppKit, metric views)
   │  auditor app (apx) reads queue/findings/scans, writes decisions to Postgres
   └─► Lakehouse Sync → UC integrity_app → gold.auditor_decision → metric views ("confirmed recovery")
```

| Stage | What was built | Code | Execution evidence |
|---|---|---|---|
| **Lakeflow** — ingest | 2 serverless SDP pipelines (27 Auto Loader streaming tables, ~30 silver/gold datasets with expectations), 1 Lakeflow job with 5 tasks | [`resources/`](resources), [`src/ingest`](src/ingest), [`src/ai`](src/ai) | [`evidence/01_lakeflow.md`](evidence/01_lakeflow.md) |
| **Unity Catalog** — govern | medallion schemas with classification tags, PII column tags (governed `pii` / `class.*` policies), column masks on member PII, isolated ground-truth schema, least-privilege grants to app service principals, lineage | [`src/setup`](src/setup), [`src/ingest/gold/claim_detail.sql`](src/ingest/gold/claim_detail.sql) | [`evidence/02_unity_catalog.md`](evidence/02_unity_catalog.md) |
| **Lakebase** — operational serving | Autoscaling project, 11 synced tables from gold, app-owned decision tables, Lakehouse Sync of decisions back to UC | [`apps/auditor_app/scripts`](apps/auditor_app/scripts), [`src/setup/auditor_decision_from_lakebase.sql`](src/setup/auditor_decision_from_lakebase.sql) | [`evidence/03_lakebase.md`](evidence/03_lakebase.md) |
| **Gen AI** — make it intelligent | `ai_parse_document`, `ai_extract` v2.1, `ai_mask`, `ai_classify`, `ai_summarize`, `ai_query` (strict JSON schema), `ai_forecast`; accuracy measured against planted ground truth | [`src/ai`](src/ai), [`src/semantic`](src/semantic) | [`evidence/04_genai.md`](evidence/04_genai.md), [`docs/evaluation.md`](docs/evaluation.md) |
| **Genie Agent** — natural language | Genie space over the 4 metric views + risk/forecast tables, instructions, trusted SQL, benchmarks | [`genie/`](genie) | [`evidence/05_genie.md`](evidence/05_genie.md), [`genie/benchmark_results.json`](genie/benchmark_results.json) |
| **Databricks Apps** — surface to the business | **Auditor app** (apx: FastAPI + React) on Lakebase: AI-prioritised queue, evidence highlighted on the original scan, per-finding decisions; **Insights app** (AppKit) on metric views: exec overview + forecast, funnel, recovery, hospital risk with AI narratives, evidence explorer, Genie chat | [`apps/auditor_app`](apps/auditor_app), [`apps/insights_app`](apps/insights_app) | [`evidence/06_apps.md`](evidence/06_apps.md) |

## Results (from the evidence)

| | Result | Evidence |
|---|---|---|
| Pipelines | Final job run: all 6 tasks SUCCESS (setup, ingest, ai, refresh_lakebase, governance, semantic). Initial full load: 50,220 claims, 124,386 lines, 396 scans → 6,473 parsed layout elements; 112 data-quality expectation results recorded | `evidence/01_lakeflow.md` |
| Document AI | 396/396 scans parsed, PII-masked and type-checked (100% agreement), 396 fact extractions with citations, 228 LLM document reviews, 817 triage verdicts | `evidence/04_genai.md` |
| Accuracy vs planted ground truth | Findings precision 0.63 / recall 0.87; 71 of 80 hard-fraud claims confirmed from documents, 4 of 60 clean claims wrongly flagged; recovery on true positives within 0.5% of ground truth (A$105.6k vs 105.0k); 93% of discrepancies point to the exact region on the scan; triage keeps 92% of planted cases for audit | `docs/evaluation.md` |
| Lakebase | 11 synced tables online (2 continuous, 9 snapshot); an auditor decision written in the app reaches Postgres and Unity Catalog (Lakehouse Sync) in ~1.3 s and shows up as confirmed recovery (A$198.82) in the metric view after the next pipeline run | `evidence/03_lakebase.md`, `evidence/logs/auditor_live_checks.log` |
| Governance | PII columns tagged with governed `class.*` tags and masked; ground truth isolated; app principals hold SELECT only on what they read; lineage recorded | `evidence/02_unity_catalog.md` |
| Genie | 24/24 automatic benchmark checks pass (+4 guardrail answers reviewed); live Q&A with generated SQL | `evidence/05_genie.md`, `genie/README.md` |
| Apps | Both apps RUNNING; insights app passes AppKit validate (typegen, lint, typecheck, build) and a smoke test of every data request it makes | `evidence/06_apps.md`, `evidence/logs/` |

## Repository layout

```
databricks.yml, resources/   Lakeflow bundle: 2 pipelines + job (setup → ingest → ai → governance + semantic)
src/setup/                   UC mask functions, auditor_decision view, governance tags
src/ingest/                  bronze (Python, Auto Loader), silver, claim scoring, gold (SQL)
src/ai/                      document AI, rule + LLM findings, triage, gold facts, risk profiles, eval
src/semantic/                metric views (YAML) + ai_forecast, deployed by deploy_semantic.py
apps/auditor_app/            Lakebase-backed auditor app (own bundle + Lakebase provisioning scripts)
apps/insights_app/           AppKit insights app (own bundle)
genie/                       Genie space definition, build + benchmark scripts, results
docs/                        design (decisions, approaches) and AI evaluation report
data/                        raw synthetic dataset description (manifest, schemas, samples)
evidence/                    text evidence collected from the live workspace (scripts/collect_evidence.py)
```

## Run it

Prerequisites: a Unity Catalog catalog, a serverless SQL warehouse, the Databricks CLI (v1.27+) and the synthetic
dataset (see [`data/`](data/README.md)).

```bash
# 1. land the raw files
python scripts/upload_landing.py <local Data dir> /Volumes/<catalog>/integrity_raw/landing
# 2. pipelines + job (set catalog / warehouse in databricks.yml)
databricks bundle deploy && databricks bundle run claims_integrity_etl
# 3. Lakebase + auditor app (see apps/auditor_app/README.md)
cd apps/auditor_app && python scripts/provision_lakebase.py --profile <p> && databricks bundle deploy && \
  databricks bundle run auditor_app && python scripts/post_deploy.py --profile <p>
# 4. connect the write-back, Genie, insights app
databricks experimental aitools tools query --file src/setup/auditor_decision_from_lakebase.sql ...
python genie/build_space.py --create --catalog <catalog> --schema integrity_gold
cd apps/insights_app && databricks apps deploy
# 5. evidence
python scripts/collect_evidence.py --profile <p> --warehouse-id <id> --genie-space-id <id>
```

## Data and privacy

All data is synthetic (fictional insurer). The synthetic hospital reference data used real facility names, so
hospitals are pseudonymised at the silver layer; member PII is tagged and masked. Evidence files redact the workspace
host and operator identity.
