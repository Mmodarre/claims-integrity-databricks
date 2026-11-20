# Claims Integrity Demo (`claims_integrity`) — ETL Design

Status: approved to build (2026-11-20). Workspace: `field_east`
(`https://<workspace-host>`, CLI profile `field_east`). Catalog: `mehdidatalake_catalog`.

## 1. Intent

Rebuild the claims-integrity demo so that **all document reading and fraud reasoning runs inside
Lakeflow Spark Declarative Pipelines using Databricks AI Functions** (`ai_parse_document`,
`ai_extract`, `ai_mask`, `ai_classify`, `ai_summarize`, `ai_query`, `ai_forecast`) instead of DSPy
programs, GEPA training and custom serving endpoints. The ETL feeds three consumers:

| Consumer | Reads | Notes |
|---|---|---|
| Auditor app (later project) | Lakebase Postgres synced from gold row-level tables | Auditor writes land in Postgres and flow back to Delta via Lakehouse Sync |
| Visualization app (later project) | Unity Catalog **metric views** via SQL warehouse | Audience: integrity team leads + executives; must feel AI-native, not a BI layer |
| Genie spaces (later project) | Same metric views | One metric definition shared by app and Genie |

The existing repo (`../pipelines`, `../src`, `../packages/auditor_app`) is **reference only**. Everything
new lives in `claims_integrity/` with its own bundle.

## 2. Goals / non-goals / anti-goals

Goals
- Raw files → bronze → silver → gold with expectations, typed/cleaned entities, and clear lineage.
- Every one of the 396 rendered clinical documents parsed with `ai_parse_document`, facts pulled
  with `ai_extract`, PII masked with `ai_mask`.
- Fraud checks: deterministic SQL rules where the comparison is exact; `ai_query` LLM judgment where
  clinical prose must be read; recovery dollars always computed in SQL.
- Claim-only AI triage for every flagged claim (replaces the DSPy Investigator).
- Gold tables shaped for (a) Lakebase sync (PK + change data feed) and (b) metric views.
- Metric views for claims overview, integrity funnel, recovery, and document-AI processing.
- Accuracy of the AI measured against ground truth in a locked-down eval schema.

Non-goals (this project)
- Building the auditor app, the visualization app, Genie spaces, Lakebase project or synced tables.
- Grants / row filters (schema boundaries are designed so grants are easy later).

Anti-goals
- Ground-truth labels (`integrity.*`, `claims.claim.is_fraud/fraud_*`, `image_claim_map.episode_label`)
  reaching any silver/gold table an app or Genie could read.
- LLMs computing money. Recovery amounts are SQL.
- LLM calls repeated for unchanged inputs on routine pipeline updates (documents and triage are
  processed once via streaming tables).
- Treating a *documentation gap* (document silent) as fraud. Gaps → "request more information".

## 3. Source data (already landed)

Volume `mehdidatalake_catalog.integrity_raw.landing`:
- `exports/` — 27 Parquet files + `_manifest.json` (table → file → row count).
- `rendered_docs/<claim_number>/{discharge_summary,operative_note}.jpg` — 396 JPGs (≈9 MB,
  3584×4800) for 200 claims (196 with both docs, 4 with one). Labels of those 200 claims:
  80 hard discrepancy, 60 ambiguous, 60 clean; 173 ground-truth findings.

Profiling notes that drive silver: IDs stored as `double` (`provider_id`, `hospital_id`,
`rejection_reason_id`, …) → cast to `BIGINT`; ~15 columns 100% null → drop; admission detail
(principal dx/procedure, same-day, care type) present for only ~19% of admissions (the integrity
episodes); `claims.claim` carries simulator fraud labels → eval only.

## 4. Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | One pipeline (bronze→gold incl. AI) + metric-view task | Simplest; but any full refresh re-runs every LLM call and a model outage blocks plain cleaning tables | — |
| **B** | **Two pipelines in one Lakeflow job: `ingest` (bronze/silver/claim scoring) and `ai` (documents, triage, reconciliation, gold), then SQL task for metric views + forecast** | Cleaning layer rebuildable at will; AI outputs incremental and isolated; mirrors the existing repo split | **Chosen** (builder's call; user delegated the how) |
| C | AI steps as notebook tasks outside SDP | Violates the "SDP pipelines" requirement | Rejected |

## 5. Architecture

Schemas (created once via CLI, not bundle-managed so `bundle destroy` can never drop data):

| Schema | Contents | Who may read (later grants) |
|---|---|---|
| `integrity_raw` | Volume `landing` | pipelines only |
| `integrity_bronze` | Raw tables, 1:1 with export files, + `_source_file`, `_ingested_at` | pipelines only |
| `integrity_silver` | Cleaned, typed, conformed entities; parsed documents; AI intermediate outputs | data team |
| `integrity_gold` | App/metric-view tables + metric views | apps, Genie |
| `integrity_eval` | Ground truth + AI accuracy tables | presenter / data team only |

### 5.1 Pipeline `claims_integrity_ingest` (serverless, triggered)

- **Bronze** (Python, manifest-driven loop): one streaming table per export file via Auto Loader
  (`cloudFiles`, parquet, glob filter on the file name). Ground-truth exports
  (`integrity__*`, `image_claim_map`) are written straight to `integrity_eval`.
- **Silver** (SQL): one cleaned table per entity — claim, claim_line, claim_assessment,
  hospital_admission, admission_diagnosis, admission_procedure, prosthesis_claim, medical_service,
  benefit_usage, member, policy, policy_member, coverage, product, hospital, provider, mbs_item,
  prosthesis_list_item, admission_archetype, discrepancy_type, document_registry (from
  `rendered_document`: claim, type, volume path). Expectations: keys not null, amounts ≥ 0,
  discharge ≥ admission, FK presence (warn). Fraud-label columns dropped from `claim` and
  published to `integrity_eval.claim_fraud_label`.
- **Claim scoring** (streaming chain so downstream AI runs once per claim):
  `silver.claim_episode` (hospital claim + admission + hospital + coded dx/px/MBS/prosthesis
  arrays; de-identified) → `gold.claim_risk_score` (port of the existing deterministic mock fraud
  model; reads ground truth internally via a temporary view, publishes no labels) →
  `gold.flagged_claim_queue` (score ≥ 0.70).

### 5.2 Pipeline `claims_integrity_ai` (serverless, triggered)

Documents (streaming tables — each file parsed once):
1. `silver.document_parsed` — `STREAM read_files(rendered_docs, binaryFile)` →
   `ai_parse_document(content, version 2.0)`; keeps the VARIANT (elements with bounding boxes),
   claim_number and document_type derived from the path. No binary stored.
2. `silver.document_text` — full text, `ai_mask` (person, phone, email, address) text,
   `ai_classify` document-type check (vs. file name), `ai_summarize` one-paragraph clinical summary.
3. `silver.discharge_summary_facts`, `silver.operative_note_facts` — `ai_extract` (version 2.1,
   citations + confidence) with one JSON schema per document type:
   - discharge summary: admission/discharge date-time, documented LOS, same-day flag, separation
     mode, principal + additional diagnoses (with CC/comorbidity markers), patient age/sex.
   - operative note: procedures performed (description, laterality, therapeutic vs diagnostic),
     assistant surgeon present, devices/implants (type, model, quantity, lens type), quantities.
4. `gold.document_element` — exploded parse elements (id, page, type, text, bbox) for evidence
   highlighting on the original scan.

Fraud checks per document (`claim_context` temporary view = billed lines, MBS fees, prosthesis
benefits, accommodation per-diem, patient age from silver):
- **Rule findings** (`silver.document_rule_finding`, SQL): same_day_overnight, los_overbilling,
  quantity_overstatement, duplicate_line, age_eligibility, bilateral_for_unilateral,
  device_phantom, assistant_phantom.
- **LLM findings** (`silver.document_llm_review`, streaming, `ai_query` with `responseFormat`
  JSON schema, model from pipeline config): item_substitution,
  drg_upcoding, procedure_phantom, device_substitution, premium_iol_exploit. Each finding returns
  verdict ∈ {contradiction, supported, not_documented}, quoted evidence, reasoning, confidence.
- `gold.claim_finding` — union of both, one row per (claim, discrepancy type, billed line),
  recovery computed in SQL from the reference fee/benefit tables, evidence quote matched to a
  `document_element` for highlighting, outcome ∈ {confirmed_discrepancy, needs_more_info, supported}.
- `gold.claim_document_review` — per-claim roll-up (deterministic): outcome, identified recovery,
  primary discrepancy, combined narrative.

Triage (claim data only, no documents — the "before audit" view):
- `gold.claim_triage` — streaming from `gold.flagged_claim_queue`; `ai_query` structured verdict
  mirroring the DSPy Investigator signature: is_integrity_issue, discrepancy_type (13 types + none),
  confidence, est_impact_aud, doc_to_request, recommendation ∈ {dismiss, investigate, escalate},
  reasoning.

AI-native analytics:
- `gold.hospital_risk_profile`, `gold.provider_risk_profile` — flag rate, finding rate, identified
  recovery, finding mix, peer z-scores; hospital rows get an `ai_query` risk narrative.
- `gold.claims_fact` — all 50k claims de-identified (exec metrics source).
- `gold.integrity_case_fact` — one row per flagged or documented claim (funnel source).
- `gold.integrity_finding_fact` — one row per finding (recovery source); left-joins
  `gold.auditor_decision` (empty placeholder now, replaced by Lakebase write-back later).

Evaluation (`integrity_eval`): `ai_eval_finding_match` (TP/FP/FN per claim × discrepancy type,
gap-trap handling) and `ai_eval_summary` (precision/recall per type, triage accuracy).

### 5.3 Job `claims_integrity_etl`

`setup` (SQL: placeholder tables) → `ingest` pipeline → `ai` pipeline → `semantic` (SQL on
warehouse: metric views + `ai_forecast` table). Manual trigger (demo).

### 5.4 Metric views (`integrity_gold`, YAML 1.1)

| View | Source | Measures (examples) | Dimensions (examples) |
|---|---|---|---|
| `mv_claims_overview` | claims_fact | claims, total charged, benefit paid, member gap, avg benefit/claim, rejection rate | service month/week, claim type, status, channel, state, product tier, hospital |
| `mv_integrity_funnel` | integrity_case_fact | flagged, triaged, audit recommended, docs reviewed, confirmed discrepancy, needs info, supported, AI-auditor agreement | discrepancy type, recommendation, hospital, archetype-free DRG, month |
| `mv_recovery` | integrity_finding_fact | identified recovery, confirmed recovery, recovery % of benefit paid, avg recovery/finding | discrepancy type, audit type, evidence method (rule/LLM), hospital, provider, month |
| `mv_document_ai` | document facts + reviews | docs processed, extraction confidence, contradictions found, gaps flagged | document type, discrepancy type |

### 5.5 Lakebase readiness

Gold tables for the auditor app declare a primary key and set `delta.enableChangeDataFeed = true`:
`flagged_claim_queue`, `claim_triage`, `claim_finding`, `claim_document_review`, `document_element`,
`claim_detail` (de-normalised claim header for the claim page).

## 6. Builder's calls (made without the user)

- SQL for silver/gold/AI; Python only for the manifest-driven bronze loop.
- Models: `system.ai.gpt-5-5` for every structured `ai_query` step (triage, document review) because
  it honours strict `json_schema` response formats; on this workspace Claude endpoints reject
  structured output ("requires forced tool use"). `system.ai.claude-sonnet-5-5` writes the free-text
  hospital risk narratives. Both are bundle variables. `system.ai.*` names are used (Unity Gateway).
- `ai_forecast` runs in the job's SQL warehouse task (it requires a Pro/Serverless warehouse).
- Schemas created by CLI, not bundle-managed. Bundle target `dev` → `field_east`.
- Legacy repo code is left untouched (contains uncommitted work).
- Timestamps: the exports are tz-naive (`TIMESTAMP_NTZ`); bronze casts them to `TIMESTAMP`.
- Every AI call is preceded by a `REPARTITION(${ai_partitions})` hint: AI functions run per partition,
  and small inputs otherwise land in one partition and call the model serially.
- Recovery formula validated against ground truth: `line benefit x (1 - supported fraction)` reproduces
  12/13 discrepancy types exactly. DRG upcoding uses a seeded AR-DRG CC-split price table
  (`silver.drg_price_delta`). Device/lens substitution has no exact reference price (claims carry generic
  category codes), so it is estimated against the archetype category benefit floor and flagged
  `recovery_basis = estimated_device_floor`.
- Bilateral billing is detected as a fee loading (~1.5x the item's modal fee across all claims) because
  several billed items are missing from the MBS reference.
- Metric views are deployed by `src/semantic/deploy_semantic.py` (Statement Execution API) because YAML
  bodies cannot take parameters; the same task builds `gold.claims_forecast` with `ai_forecast` (needs a
  SQL warehouse). Claims span 2021-01 to 2023-12 (ramp-up in 2021, steady from 2022).

## 7. Build checklist

- [x] Bundle skeleton, schemas, placeholder tables
- [x] Ingest pipeline: bronze, silver, claim scoring — run, inspect, fix
- [x] AI pipeline: documents → facts → findings → triage → gold — run, inspect, fix
- [x] Evaluate against ground truth; iterate prompts/schemas/rules (see docs/evaluation.md)
- [x] Metric views + forecast — deploy, query-test, iterate
- [x] Job wiring; end-to-end run from the job (green: setup -> ingest -> ai -> semantic)

## 8. Consumers and governance (phase 2)

| Component | Decision |
|---|---|
| Unity Catalog governance | `data_classification` tags on schemas/tables, governed `pii` + `class.*` tags on PII columns (`class.au_medicare`, `class.name`, `class.date_of_birth`, …), column masks `mask_pii_string` / `mask_pii_date` on `gold.claim_detail` (admins / `claims_integrity_auditors` see values), ground truth isolated in `integrity_eval`, app service principals granted SELECT only on what they read. Hospitals pseudonymised at silver because the synthetic reference data used real facility names. |
| Lakebase | Autoscaling project `claims-integrity`; 11 gold tables synced (streaming tables CONTINUOUS, materialized views SNAPSHOT — MV change feeds need a pipeline setting not used here); app-owned schema `auditor` (decisions, document requests, feedback) with Lakehouse Sync to `integrity_app`; `gold.auditor_decision` becomes a latest-state view over the synced history so metric views show auditor-confirmed recovery. Snapshot synced tables are refreshed by a job task after the AI pipeline. |
| Auditor app | apx (FastAPI + React) ported from the earlier demo; all reads/writes via Lakebase (no SQL warehouse); scans served from the volume by the app service principal with the evidence bounding box drawn over the image; Genie panel runs as the signed-in user. |
| Insights app | AppKit; all aggregates from the 4 metric views (same definitions as Genie); hospital risk narratives labelled AI-generated with their inputs; evidence explorer; `ai_forecast` chart; Genie chat (on-behalf-of user). |
| Genie | One space over the 4 metric views + `hospital_risk_profile`, `provider_risk_profile`, `claims_forecast`; no PII or eval sources; trusted SQL + benchmarks; definition as code in `genie/build_space.py`. |
