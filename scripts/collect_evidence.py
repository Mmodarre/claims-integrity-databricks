#!/usr/bin/env python3
"""Collect text evidence that the claims-integrity build actually ran.

Queries the live workspace (job/pipeline run history, table contents, Unity Catalog metadata,
Lakebase, Genie, the two apps) and writes Markdown + JSON into evidence/. Run locally:

    uv run --no-project --with databricks-sdk --with 'psycopg[binary]' python scripts/collect_evidence.py \
        --profile field_east --warehouse-id 148ccb90800933a1

The workspace host and the operator's e-mail are redacted from every output file.
"""

from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

ROOT = Path(__file__).resolve().parent.parent
SHOWCASE_CLAIM = "CLM-W0-2021-00000082"
SHOWCASE_CLAIM_ID = "68ce3ffe-cf9d-4485-8ab3-f50273f03bf0"

args: argparse.Namespace
w: WorkspaceClient
REDACT: list[tuple[str, str]] = []


# ── helpers ────────────────────────────────────────────────────────────────────────────────
def redact(text: str) -> str:
    for a, b in REDACT:
        text = text.replace(a, b)
    return text


def write(rel: str, text: str) -> None:
    p = ROOT / "evidence" / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(redact(text))
    print(f"  wrote evidence/{rel}")


def cli(*a: str) -> Any:
    proc = subprocess.run(["databricks", *a, "-p", args.profile, "-o", "json"], capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": (proc.stderr or proc.stdout).strip()[:500]}
    try:
        return json.loads(proc.stdout) if proc.stdout.strip() else None
    except json.JSONDecodeError:
        return proc.stdout


def sql(query: str) -> tuple[list[str], list[list[Any]]]:
    r = w.statement_execution.execute_statement(statement=query, warehouse_id=args.warehouse_id, wait_timeout="50s")
    while r.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(2)
        r = w.statement_execution.get_statement(r.statement_id)
    if r.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"{r.status.error.message if r.status.error else r.status.state}\nSQL: {query[:300]}")
    cols = [c.name for c in r.manifest.schema.columns] if r.manifest and r.manifest.schema else []
    return cols, (r.result.data_array or []) if r.result else []


def md_table(cols: list[str], rows: list[list[Any]], max_rows: int = 50, width: int = 140) -> str:
    def cell(v: Any) -> str:
        s = "" if v is None else str(v)
        s = s.replace("|", "\\|").replace("\n", " ")
        return s if len(s) <= width else s[: width - 1] + "…"
    out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    out += ["| " + " | ".join(cell(v) for v in r) + " |" for r in rows[:max_rows]]
    if len(rows) > max_rows:
        out.append(f"\n_{len(rows) - max_rows} more rows not shown._")
    return "\n".join(out)


def q(title: str, query: str, max_rows: int = 50, width: int = 140) -> str:
    try:
        cols, rows = sql(query)
        body = md_table(cols, rows, max_rows, width)
    except Exception as exc:  # keep collecting; record the failure honestly
        body = f"_query failed: {str(exc)[:300]}_"
    return f"### {title}\n\n```sql\n{query.strip()}\n```\n\n{body}\n"


def header(title: str, intro: str) -> str:
    return (f"# {title}\n\n_Collected {dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from the live "
            f"workspace by `scripts/collect_evidence.py`._\n\n{intro}\n\n")


C = ""  # catalog, set in main
S = {}  # schemas


# ── 1. Lakeflow ────────────────────────────────────────────────────────────────────────────
def lakeflow() -> None:
    out = header("Lakeflow: pipelines and job runs",
                 "Two Spark Declarative Pipelines and one Lakeflow job (setup → ingest → ai → governance + semantic).")
    jobs = [j for j in w.jobs.list() if (j.settings.name or "").endswith("claims_integrity_etl")]
    raw: dict[str, Any] = {}
    if jobs:
        job = jobs[0]
        runs = list(w.jobs.list_runs(job_id=job.job_id, limit=5, expand_tasks=True))
        rows = []
        for r in runs:
            for t in r.tasks or []:
                dur = (t.end_time - t.start_time) / 60000 if t.end_time and t.start_time else None
                rows.append([r.run_id, dt.datetime.fromtimestamp(r.start_time / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%M"),
                             t.task_key, t.state.result_state.value if t.state and t.state.result_state else
                             (t.state.life_cycle_state.value if t.state else None), f"{dur:.1f}" if dur else None])
        out += "## Job `claims_integrity_etl` — recent runs (task level)\n\n"
        out += md_table(["run_id", "start (UTC)", "task", "result", "minutes"], rows, 60) + "\n\n"
        raw["job_runs"] = [r.as_dict() for r in runs]

    for pname in ("claims_integrity_ingest", "claims_integrity_ai"):
        pl = [p for p in w.pipelines.list_pipelines(filter=f"name LIKE '%{pname}%'")]
        if not pl:
            continue
        pid = pl[0].pipeline_id
        updates = w.pipelines.list_updates(pipeline_id=pid, max_results=8).updates or []
        out += f"## Pipeline `{pname}` — recent updates\n\n"
        out += md_table(["update_id", "state", "cause", "full_refresh", "created (UTC)"],
                        [[u.update_id, u.state.value if u.state else None, u.cause.value if u.cause else None,
                          u.full_refresh, dt.datetime.fromtimestamp(u.creation_time / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%M")]
                         for u in updates]) + "\n\n"
        # Flow-level rows written + data-quality expectations, from the pipeline event log (SQL event_log TVF):
        # the last two completed updates (typically the initial full load and the latest incremental run).
        completed = [u.update_id for u in updates if u.state and u.state.value == "COMPLETED"]
        # latest run + the initial full load (oldest completed update in the window)
        done = list(dict.fromkeys(completed[:1] + completed[-1:]))
        for uid in done:
            out += q(f"Flows in update `{uid}` (rows written, from event_log)", f"""
SELECT split(origin.flow_name, '\\\\.')[2] AS flow,
       max(details:flow_progress.status::STRING) FILTER (WHERE details:flow_progress.status::STRING = 'COMPLETED') AS status,
       sum(details:flow_progress.metrics.num_output_rows::BIGINT) AS rows_written
FROM event_log('{pid}')
WHERE event_type = 'flow_progress' AND origin.update_id = '{uid}'
GROUP BY 1 ORDER BY 1""", 60)
        if done:
            out += q(f"Data-quality expectations in update `{done[-1]}` (event_log)", f"""
SELECT split(origin.flow_name, '\\\\.')[2] AS dataset, e.name AS expectation,
       sum(e.passed_records) AS passed, sum(e.failed_records) AS failed
FROM event_log('{pid}')
LATERAL VIEW explode(from_json(details:flow_progress.data_quality.expectations::STRING,
     'ARRAY<STRUCT<name: STRING, dataset: STRING, passed_records: BIGINT, failed_records: BIGINT>>')) x AS e
WHERE event_type = 'flow_progress' AND origin.update_id = '{done[-1]}'
GROUP BY 1, 2 ORDER BY 1, 2""", 80)
        raw[pname] = {"pipeline_id": pid, "updates": [u.as_dict() for u in updates]}

    out += "## Row counts by layer\n\n"
    out += q("Bronze, silver, gold and eval row counts", f"""
SELECT 'bronze' layer, 'claims__claim' tbl, count(*) n FROM {C}.{S['bronze']}.claims__claim
UNION ALL SELECT 'bronze', 'claims__claim_line', count(*) FROM {C}.{S['bronze']}.claims__claim_line
UNION ALL SELECT 'bronze', 'policy__member', count(*) FROM {C}.{S['bronze']}.policy__member
UNION ALL SELECT 'silver', 'claim', count(*) FROM {C}.{S['silver']}.claim
UNION ALL SELECT 'silver', 'claim_line', count(*) FROM {C}.{S['silver']}.claim_line
UNION ALL SELECT 'silver', 'claim_episode', count(*) FROM {C}.{S['silver']}.claim_episode
UNION ALL SELECT 'silver', 'document_parsed', count(*) FROM {C}.{S['silver']}.document_parsed
UNION ALL SELECT 'silver', 'operative_note_facts', count(*) FROM {C}.{S['silver']}.operative_note_facts
UNION ALL SELECT 'silver', 'discharge_summary_facts', count(*) FROM {C}.{S['silver']}.discharge_summary_facts
UNION ALL SELECT 'silver', 'document_llm_review', count(*) FROM {C}.{S['silver']}.document_llm_review
UNION ALL SELECT 'gold', 'claims_fact', count(*) FROM {C}.{S['gold']}.claims_fact
UNION ALL SELECT 'gold', 'flagged_claim_queue', count(*) FROM {C}.{S['gold']}.flagged_claim_queue
UNION ALL SELECT 'gold', 'claim_triage', count(*) FROM {C}.{S['gold']}.claim_triage
UNION ALL SELECT 'gold', 'claim_finding', count(*) FROM {C}.{S['gold']}.claim_finding
UNION ALL SELECT 'gold', 'claim_document_review', count(*) FROM {C}.{S['gold']}.claim_document_review
UNION ALL SELECT 'gold', 'document_element', count(*) FROM {C}.{S['gold']}.document_element
UNION ALL SELECT 'gold', 'hospital_risk_profile', count(*) FROM {C}.{S['gold']}.hospital_risk_profile
UNION ALL SELECT 'gold', 'claims_forecast', count(*) FROM {C}.{S['gold']}.claims_forecast
UNION ALL SELECT 'eval', 'integrity__integrity_finding', count(*) FROM {C}.{S['eval']}.integrity__integrity_finding
""", 40)
    write("01_lakeflow.md", out)
    write("raw/01_lakeflow_runs.json", json.dumps(raw, indent=1, default=str))


# ── 2. Unity Catalog ───────────────────────────────────────────────────────────────────────
def unity_catalog() -> None:
    schemas = "', '".join(S.values())
    out = header("Unity Catalog: governance",
                 "Medallion schemas with classification tags, PII column tags and masks, restricted ground truth, "
                 "least-privilege grants to app service principals, and lineage.")
    out += q("Schemas, comments and classification tags", f"""
SELECT s.schema_name, s.comment, t.tag_name, t.tag_value
FROM {C}.information_schema.schemata s
LEFT JOIN {C}.information_schema.schema_tags t ON t.schema_name = s.schema_name
WHERE s.schema_name IN ('{schemas}', 'integrity_synced', 'integrity_app') ORDER BY 1""")
    out += q("Table-level classification tags", f"""
SELECT schema_name, table_name, tag_name, tag_value FROM {C}.information_schema.table_tags
WHERE schema_name IN ('{schemas}') ORDER BY 1, 2""")
    out += q("Column-level PII tags (governed tag policies: pii, class.*)", f"""
SELECT schema_name, table_name, column_name, tag_name, tag_value FROM {C}.information_schema.column_tags
WHERE schema_name IN ('{schemas}') ORDER BY 1, 2, 3, 4""", 60)
    out += q("Column masks on member PII", f"""
SELECT table_schema, table_name, column_name, mask_name FROM {C}.information_schema.column_masks
WHERE table_schema IN ('{schemas}') ORDER BY 1, 2, 3""")
    out += q("Mask function definition", f"DESCRIBE FUNCTION EXTENDED {C}.{S['gold']}.mask_pii_string", 40, 200)
    out += q("Grants on the gold schema objects (app service principals get SELECT on exactly what they read)", f"""
SELECT grantee, table_schema, table_name, privilege_type FROM {C}.information_schema.table_privileges
WHERE table_schema IN ('{S['gold']}', 'integrity_synced', 'integrity_app') AND grantee <> current_user()
ORDER BY 1, 2, 3""", 80)
    out += q("Ground truth is isolated: who can read the eval schema", f"""
SELECT grantee, privilege_type FROM {C}.information_schema.schema_privileges
WHERE schema_name = '{S['eval']}'""")
    out += q("Lineage: upstream tables feeding gold.claim_finding (system.access.table_lineage)", f"""
SELECT DISTINCT source_table_full_name, target_table_full_name
FROM system.access.table_lineage
WHERE target_table_full_name LIKE '{C}.{S['gold']}.claim_finding' AND source_table_full_name IS NOT NULL
ORDER BY 1""")
    out += q("Lineage: what reads the parsed documents", f"""
SELECT DISTINCT source_table_full_name, target_table_full_name
FROM system.access.table_lineage
WHERE source_table_full_name = '{C}.{S['silver']}.document_parsed' AND target_table_full_name IS NOT NULL
ORDER BY 2""")
    write("02_unity_catalog.md", out)


# ── 3. Gen AI ──────────────────────────────────────────────────────────────────────────────
def genai() -> None:
    G, SV, E = S["gold"], S["silver"], S["eval"]
    out = header("Gen AI: AI Functions inside the pipelines",
                 f"Real model output from the pipeline tables. Showcase claim: `{SHOWCASE_CLAIM}` "
                 "(planted phantom procedure: add-on item 34992 billed, operative note says diagnostic only).")
    out += q("AI function volume per stage", f"""
SELECT 'ai_parse_document' fn, count(*) calls FROM {C}.{SV}.document_parsed
UNION ALL SELECT 'ai_mask + ai_classify + ai_summarize', count(*) FROM {C}.{SV}.document_text
UNION ALL SELECT 'ai_extract (operative notes)', count(*) FROM {C}.{SV}.operative_note_facts
UNION ALL SELECT 'ai_extract (discharge summaries)', count(*) FROM {C}.{SV}.discharge_summary_facts
UNION ALL SELECT 'ai_query document review', count(*) FROM {C}.{SV}.document_llm_review
UNION ALL SELECT 'ai_query claim triage', count(*) FROM {C}.{G}.claim_triage
UNION ALL SELECT 'ai_query hospital narrative', count(risk_narrative) FROM {C}.{G}.hospital_risk_profile
UNION ALL SELECT 'ai_forecast rows (forecast series)', count(*) FROM {C}.{G}.claims_forecast WHERE series = 'forecast'""")
    out += q("ai_parse_document: layout elements with bounding boxes (showcase operative note)", f"""
SELECT element_index, element_type, round(confidence, 3) AS confidence, bbox, content
FROM {C}.{G}.document_element
WHERE claim_number = '{SHOWCASE_CLAIM}' AND document_type = 'operative_note' AND element_type <> 'text' OR
      (claim_number = '{SHOWCASE_CLAIM}' AND document_type = 'operative_note' AND element_index IN (4, 6, 8, 14))
ORDER BY element_index""", 20, 160)
    out += q("ai_extract v2.1 (citations + confidence): structured facts from the showcase operative note", f"""
SELECT operation_date, laterality, diagnostic_only_statement, assistant_surgeon_present, no_implant_statement,
       to_json(procedures) AS procedures,
       extracted:response:diagnostic_only_statement AS diagnostic_only_with_citation
FROM {C}.{SV}.operative_note_facts WHERE claim_number = '{SHOWCASE_CLAIM}'""", 5, 400)
    out += q("ai_mask + ai_classify + ai_summarize (PII-masked text, type check, summary)", f"""
SELECT document_type, classified_document_type, substring(masked_text, 1, 300) AS masked_text_start, clinical_summary
FROM {C}.{SV}.document_text WHERE claim_number = '{SHOWCASE_CLAIM}'""", 5, 320)
    out += q("ai_query claim triage (claim data only, strict JSON schema, GPT-5.5)", f"""
SELECT claim_number, ml_flag_reason, recommendation, discrepancy_type, confidence, doc_to_request,
       to_json(key_signals) AS key_signals, reasoning
FROM {C}.{G}.claim_triage WHERE claim_number = '{SHOWCASE_CLAIM}'""", 5, 600)
    out += q("ai_query document review + SQL recovery: findings for the showcase claim", f"""
SELECT discrepancy_type, detection_method, verdict, outcome, billed_item_code, recovery_aud, evidence_quote,
       evidence_bbox, reasoning
FROM {C}.{G}.claim_finding WHERE claim_number = '{SHOWCASE_CLAIM}' ORDER BY outcome""", 10, 500)
    out += q("Rule checks on extracted facts: one example per rule type (discrepancies)", f"""
SELECT discrepancy_type, claim_number, billed_item_code, recovery_aud, documented_detail, reasoning
FROM (SELECT *, row_number() OVER (PARTITION BY discrepancy_type ORDER BY recovery_aud DESC) rn
      FROM {C}.{G}.claim_finding WHERE detection_method = 'rule' AND outcome = 'discrepancy') WHERE rn = 1""", 20, 260)
    out += q("Document review outcomes across the 200 claims with scans", f"""
SELECT review_outcome, count(*) AS claims, sum(identified_recovery_aud) AS identified_recovery_aud
FROM {C}.{G}.claim_document_review GROUP BY 1 ORDER BY 2 DESC""")
    out += q("AI accuracy vs ground truth (restricted eval schema): per discrepancy type", f"""
SELECT * FROM {C}.{E}.ai_eval_summary ORDER BY discrepancy_type""", 20)
    out += q("Claim-level confusion: planted episode label vs AI document review outcome", f"""
SELECT g.episode_label, r.review_outcome, count(*) n
FROM {C}.{G}.claim_document_review r
JOIN (SELECT claim_id, episode_label FROM {C}.{E}.integrity__episode_ground_truth
      QUALIFY row_number() OVER (PARTITION BY claim_id ORDER BY created_at DESC) = 1) g USING (claim_id)
GROUP BY 1, 2 ORDER BY 1, 2""")
    out += q("Triage accuracy vs ground truth", f"""
SELECT round(avg(CAST(recommendation_correct AS INT)), 3) AS recommendation_accuracy,
       round(avg(CASE WHEN planted THEN CAST(recommendation_correct AS INT) END), 3) AS planted_kept_for_audit,
       round(avg(CASE WHEN planted THEN CAST(type_in_ground_truth AS INT) END), 3) AS type_accuracy_planted,
       count(*) AS triaged
FROM {C}.{E}.ai_eval_triage""")
    out += q("AI-written hospital risk narratives (hospitals are pseudonymised)", f"""
SELECT hospital_name, flagged_claims, round(flag_rate_peer_z, 2) AS peer_z, identified_recovery_aud, narrative_model, risk_narrative
FROM {C}.{G}.hospital_risk_profile WHERE risk_narrative IS NOT NULL ORDER BY identified_recovery_aud DESC LIMIT 3""", 3, 900)
    out += q("ai_forecast: next weeks of benefit paid by claim type (90% interval)", f"""
SELECT week, claim_type, round(claims, 1) claims, round(benefit_paid) benefit_paid, round(benefit_paid_lower) lower, round(benefit_paid_upper) upper
FROM {C}.{G}.claims_forecast WHERE series = 'forecast' ORDER BY week, claim_type LIMIT 9""")
    out += q("Metric views answer with governed definitions", f"""
SELECT claim_type, MEASURE(claim_count) claims, MEASURE(benefit_paid) benefit_paid, MEASURE(rejection_rate) rejection_rate
FROM {C}.{G}.mv_claims_overview GROUP BY 1 ORDER BY 2 DESC""")
    out += q("Recovery by discrepancy type and detection method (mv_recovery)", f"""
SELECT discrepancy_type, detection_method, MEASURE(discrepancy_findings) discrepancies, MEASURE(identified_recovery) identified_recovery
FROM {C}.{G}.mv_recovery GROUP BY 1, 2 ORDER BY 4 DESC NULLS LAST""", 30)
    write("04_genai.md", out)


# ── 4. Lakebase ────────────────────────────────────────────────────────────────────────────
def lakebase() -> None:
    out = header("Lakebase: operational serving and write-back",
                 "Gold tables are synced into Lakebase Postgres for the auditor app; auditor decisions are written to "
                 "Postgres and flow back to Unity Catalog through Lakehouse Sync, feeding the metric views.")
    proj = args.lakebase_project
    out += "## Project\n\n```json\n" + json.dumps(cli("postgres", "get-project", f"projects/{proj}"), indent=1, default=str)[:2500] + "\n```\n\n"
    rows = []
    for t in ("flagged_claim_queue", "claim_triage", "claim_finding", "claim_detail", "claim_line_detail", "admission_coding",
              "claim_document_review", "document_element", "document_ai_fact", "hospital_risk_profile", "provider_risk_profile"):
        st = cli("postgres", "get-synced-table", f"synced_tables/{C}.integrity_synced.{t}")
        if isinstance(st, dict) and "error" not in st:
            status = st.get("status") or {}
            state = status.get("detailed_state") or ""
            rows.append([t, f"{C}.{S['gold']}.{t}", "CONTINUOUS" if "CONTINUOUS" in state else "SNAPSHOT",
                         state, status.get("pipeline_id")])
        else:
            rows.append([t, None, None, str(st)[:120]])
    out += "## Synced tables (Unity Catalog gold → Lakebase Postgres)\n\n" + md_table(["synced table", "source (UC gold)", "mode", "state", "sync pipeline"], rows) + "\n\n"
    try:
        import psycopg
        ep = cli("postgres", "get-endpoint", f"projects/{proj}/branches/production/endpoints/primary")
        cred = cli("postgres", "generate-database-credential", f"projects/{proj}/branches/production/endpoints/primary")
        me = cli("current-user", "me")
        conn = psycopg.connect(host=ep["status"]["hosts"]["host"], dbname="databricks_postgres", user=me["userName"],
                               password=cred["token"], sslmode="require", autocommit=True)
        with conn.cursor() as cur:
            def pq(title: str, query: str, max_rows: int = 20) -> str:
                cur.execute(query)
                cols = [d.name for d in cur.description]
                return f"### {title}\n\n```sql\n{query.strip()}\n```\n\n{md_table(cols, [list(r) for r in cur.fetchall()], max_rows, 160)}\n"
            out += "## Live Postgres queries (as the project owner)\n\n"
            out += pq("Row counts of synced tables in Postgres", """
SELECT 'flagged_claim_queue' t, count(*) FROM integrity_synced.flagged_claim_queue
UNION ALL SELECT 'claim_triage', count(*) FROM integrity_synced.claim_triage
UNION ALL SELECT 'claim_finding', count(*) FROM integrity_synced.claim_finding
UNION ALL SELECT 'claim_detail', count(*) FROM integrity_synced.claim_detail
UNION ALL SELECT 'document_element', count(*) FROM integrity_synced.document_element""")
            out += pq("Queue query the auditor app runs (top flagged claims with AI triage)", """
SELECT q.claim_number, q.hospital_name, round(q.ml_fraud_score::numeric, 3) score, t.recommendation, t.discrepancy_type,
       round(t.confidence::numeric, 2) confidence
FROM integrity_synced.flagged_claim_queue q JOIN integrity_synced.claim_triage t USING (claim_id)
ORDER BY q.ml_fraud_score DESC LIMIT 8""")
            out += pq("App-owned tables written by the auditor app (schema auditor)", """
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from auditor.%I', table_name), false, true, '')))[1]::text::int AS rows
FROM information_schema.tables WHERE table_schema = 'auditor' ORDER BY 1""")
            out += pq("Latest auditor decisions in Postgres", """
SELECT claim_id, finding_id IS NOT NULL AS finding_level, decision, confirmed_recovery_aud, decided_at
FROM auditor.auditor_decision ORDER BY decided_at DESC LIMIT 10""")
        conn.close()
    except Exception as exc:
        out += f"_Postgres connection failed: {str(exc)[:300]}_\n\n"
    out += "## Write-back in Unity Catalog (Lakehouse Sync → gold)\n\n"
    out += q("Change feed landed in UC by Lakehouse Sync", f"""
SELECT _pg_change_type, count(*) n, max(_timestamp) latest FROM {C}.integrity_app.lb_auditor_decision_history GROUP BY 1""")
    out += q("gold.auditor_decision view (latest state per decision) consumed by the pipelines", f"""
SELECT decision, count(*) n, sum(confirmed_recovery_aud) confirmed_recovery_aud FROM {C}.{S['gold']}.auditor_decision GROUP BY 1""")
    out += q("Confirmed recovery flowing into the metric view", f"""
SELECT MEASURE(identified_recovery) identified, MEASURE(confirmed_recovery) confirmed, MEASURE(auditor_decisions) decisions
FROM {C}.{S['gold']}.mv_integrity_funnel""")
    write("03_lakebase.md", out)


# ── 5. Genie ───────────────────────────────────────────────────────────────────────────────
def genie() -> None:
    out = header("Genie Agent: natural-language questions",
                 f"Space `{args.genie_space_id}` over the four metric views plus risk-profile and forecast tables. "
                 "Live answers below; the full benchmark is in genie/benchmark_results.json and genie/README.md.")
    for question in ("What is the identified recovery by discrepancy type?",
                     "Which 5 hospitals have the highest identified recovery and why?",
                     "What share of flagged claims did the AI triage dismiss?",
                     "What is the forecast benefit paid for hospital claims next quarter?"):
        try:
            msg = w.genie.start_conversation_and_wait(args.genie_space_id, question)
            out += f"## Q: {question}\n\n"
            for att in msg.attachments or []:
                if att.text and att.text.content:
                    out += f"**Answer:** {att.text.content}\n\n"
                if att.query:
                    out += f"**Generated SQL:**\n\n```sql\n{att.query.query}\n```\n\n"
                    try:
                        res = w.genie.get_message_attachment_query_result(args.genie_space_id, msg.conversation_id,
                                                                         msg.id, att.attachment_id)
                        sr = res.statement_response
                        cols = [c.name for c in sr.manifest.schema.columns]
                        out += md_table(cols, sr.result.data_array or [], 12) + "\n\n"
                    except Exception as exc:
                        out += f"_result fetch failed: {str(exc)[:200]}_\n\n"
        except Exception as exc:
            out += f"## Q: {question}\n\n_Genie call failed: {str(exc)[:300]}_\n\n"
    write("05_genie.md", out)


# ── 6. Apps ────────────────────────────────────────────────────────────────────────────────
def apps() -> None:
    out = header("Databricks Apps: surfaced to the business", "Two apps deployed on the workspace.")
    token = cli("auth", "token")["access_token"]
    for name, checks in (
        ("claims-integrity-auditor", ["/api/health", "/api/queue/facets", f"/api/claims/{SHOWCASE_CLAIM_ID}/triage",
                                      f"/api/claims/{SHOWCASE_CLAIM_ID}/review", "/api/genie/status"]),
        ("claims-integrity-insights", ["/health", "/api/app-config"]),
    ):
        info = cli("apps", "get", name)
        out += f"## `{name}`\n\n"
        if isinstance(info, dict) and "error" not in info:
            out += md_table(["field", "value"], [
                ["app status", (info.get("app_status") or {}).get("state")],
                ["compute", (info.get("compute_status") or {}).get("state")],
                ["active deployment", ((info.get("active_deployment") or {}).get("status") or {}).get("state")],
                ["resources", ", ".join(r.get("name", "") for r in info.get("resources") or [])],
                ["user API scopes", ", ".join(info.get("user_api_scopes") or [])],
            ]) + "\n\n"
            for path in checks:
                try:
                    req = urllib.request.Request(info["url"] + path, headers={"Authorization": f"Bearer {token}"})
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        body = resp.read().decode("utf-8", "replace")
                        out += f"`GET {path}` → {resp.status}\n\n```json\n{body[:1500]}\n```\n\n"
                except Exception as exc:
                    out += f"`GET {path}` → {str(exc)[:200]}\n\n"
        else:
            out += f"_{info}_\n\n"
    write("06_apps.md", out)


def main() -> None:
    global args, w, C, S
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True)
    ap.add_argument("--warehouse-id", required=True)
    ap.add_argument("--catalog", default="mehdidatalake_catalog")
    ap.add_argument("--prefix", default="integrity")
    ap.add_argument("--lakebase-project", default="claims-integrity")
    ap.add_argument("--genie-space-id", default="")
    ap.add_argument("--sections", default="lakeflow,unity_catalog,genai,lakebase,genie,apps")
    args = ap.parse_args()
    w = WorkspaceClient(profile=args.profile)
    C = args.catalog
    S = {k: f"{args.prefix}_{k}" for k in ("raw", "bronze", "silver", "gold", "eval")}
    me = w.current_user.me().user_name
    host = w.config.host.replace("https://", "").rstrip("/")
    ws_id = str(w.get_workspace_id())
    REDACT.extend([(me, "<operator>"), (host, "<workspace-host>"), (host.split(".")[0], "<workspace>"),
                   (ws_id, "<workspace-id>"), (me.split("@")[0], "<operator>")])
    for sec in args.sections.split(","):
        print(f"[{sec}]")
        globals()[sec]()


if __name__ == "__main__":
    main()
