"""Step 1 of 3 — provision Lakebase for the auditor app (idempotent; run BEFORE the app deploy).

  * Lakebase Autoscaling project (Postgres 17), endpoint autoscaling 2-8 CU
  * UC schemas: synced_schema (synced-table entries) and app_sync_schema (Lakehouse Sync target)
  * Synced tables gold_schema.<t> -> Postgres synced_schema.<t>. Primary key from the source
    table property `lakebase.primary_key`. Streaming tables sync CONTINUOUS (one shared
    pipeline); materialized views sync SNAPSHOT (one shared pipeline) because CDF reads from
    a materialized view need pipeline-level "external metadata".
  * Sources with UC column masks / row filters (e.g. PII masks on claim_detail) cannot back a
    synced table directly; they are synced from a plain view <synced_schema>.<t>_sync_source
    (SNAPSHOT). UC masks do not travel to Postgres — the app re-applies the same PII policy
    (AUDITOR_APP_PII_GROUPS) to every response.
  * Lookup indexes on the synced tables.

    uv run --no-project --with 'psycopg[binary]' python scripts/provision_lakebase.py --profile <p> [--var k=v]
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

from _common import Cli, base_args, names, pg_connect, wait_for

# Gold tables the app reads (all carry `lakebase.primary_key` and have CDF enabled).
TABLES = [
    "flagged_claim_queue", "claim_triage", "claim_finding", "claim_detail", "claim_line_detail",
    "admission_coding", "claim_document_review", "document_element", "document_ai_fact",
    "hospital_risk_profile", "provider_risk_profile",
]

INDEXES = {
    "claim_line_detail": "claim_id",
    "admission_coding": "admission_id",
    "claim_finding": "claim_id",
    "document_element": "document_id",
    "document_ai_fact": "claim_id",
}


def run_sql(profile: str, warehouse_id: str, sql: str) -> None:
    env = {**os.environ, "DATABRICKS_WAREHOUSE_ID": warehouse_id}
    proc = subprocess.run(["databricks", "experimental", "aitools", "tools", "query", "--profile", profile, sql],
                          capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        sys.exit(f"SQL failed: {sql}\n{proc.stderr or proc.stdout}")


def main() -> None:
    args = base_args(__doc__).parse_args()
    cli = Cli(args.profile, args.target, args.var)
    v = cli.bundle_vars()
    n = names(v)
    print(json.dumps({k: v[k] for k in sorted(v)}, indent=1))

    # 1. Project + endpoint sizing
    rc, _ = cli.run("postgres", "get-project", n["project"], check=False)
    if rc != 0:
        print(f"Creating Lakebase project {v['lakebase_project']} ...")
        cli.run("postgres", "create-project", v["lakebase_project"], "--json",
                json.dumps({"spec": {"display_name": "Claims Integrity Auditor", "pg_version": 17}}))
    cli.run("postgres", "update-endpoint", n["endpoint"],
            "spec.autoscaling_limit_min_cu,spec.autoscaling_limit_max_cu",
            "--json", json.dumps({"spec": {"autoscaling_limit_min_cu": 2.0, "autoscaling_limit_max_cu": 8.0}}))

    # 2. UC schemas
    for schema in (v["synced_schema"], v["app_sync_schema"]):
        rc, _ = cli.run("schemas", "get", f"{v['catalog']}.{schema}", check=False)
        if rc != 0:
            cli.run("schemas", "create", schema, v["catalog"])
            print(f"Created UC schema {v['catalog']}.{schema}")

    # 3. Synced tables
    pipelines: dict[str, str] = {}  # scheduling policy -> pipeline id
    created_snapshot = False
    for t in TABLES:
        synced = f"{v['catalog']}.{v['synced_schema']}.{t}"
        gold = f"{v['catalog']}.{v['gold_schema']}.{t}"
        _, src = cli.run("tables", "get", gold)
        pk = [c.strip() for c in src["properties"]["lakebase.primary_key"].split(",")]
        policy = "CONTINUOUS" if src.get("table_type") == "STREAMING_TABLE" else "SNAPSHOT"
        masked = [c["name"] for c in src.get("columns", []) if c.get("mask")]
        source = gold
        if masked or src.get("row_filter"):
            # Synced tables cannot read a table with row/column security; sync a plain view
            # (SNAPSHOT only). The sync runs as this script's user, so masks evaluate for that
            # user; the app enforces the PII policy itself (AUDITOR_APP_PII_GROUPS).
            source = f"{v['catalog']}.{v['synced_schema']}.{t}_sync_source"
            policy = "SNAPSHOT"
            run_sql(args.profile, v["warehouse_id"],
                    f"CREATE OR REPLACE VIEW {source} COMMENT 'Sync source for Lakebase synced table "
                    f"{v['synced_schema']}.{t} (source has UC masks/row filters; the app re-applies the PII "
                    f"policy).' AS SELECT * FROM {gold}")
            print(f"NOTE    {gold} has column masks {masked} / row filter {bool(src.get('row_filter'))}: "
                  f"syncing via view {source}; UC masks do not apply in Postgres, the app enforces PII access")
        rc, existing = cli.run("postgres", "get-synced-table", f"synced_tables/{synced}", check=False)
        if rc == 0:
            if not pipelines.get(policy):
                pipelines[policy] = existing.get("status", {}).get("pipeline_id", "")
            print(f"exists  {synced} ({policy})")
            continue
        spec = {
            "source_table_full_name": source,
            "primary_key_columns": pk,
            "scheduling_policy": policy,
            "branch": n["branch"],
            "postgres_database": v["postgres_database"],
            "create_database_objects_if_missing": True,
        }
        if pipelines.get(policy):
            spec["existing_pipeline_id"] = pipelines[policy]
        cli.run("postgres", "create-synced-table", synced, "--no-wait", "--json", json.dumps({"spec": spec}))
        created_snapshot |= policy == "SNAPSHOT"
        if not pipelines.get(policy):
            def pipeline_id(name=synced):
                _, s = cli.run("postgres", "get-synced-table", f"synced_tables/{name}", check=False)
                return (s or {}).get("status", {}).get("pipeline_id") if isinstance(s, dict) else None
            pipelines[policy] = wait_for(f"pipeline of {synced}", pipeline_id, every_s=5)
        print(f"created {synced} ({policy}, pk={pk}, pipeline={pipelines[policy]})")

    # Tables bin-packed into the snapshot pipeline after its first update need one more run.
    if created_snapshot and pipelines.get("SNAPSHOT"):
        def idle():
            _, p = cli.run("pipelines", "get", pipelines["SNAPSHOT"])
            return p.get("state") == "IDLE"
        wait_for("snapshot pipeline idle", idle)
        cli.run("pipelines", "start-update", pipelines["SNAPSHOT"])

    def all_online():
        states = {}
        for t in TABLES:
            _, s = cli.run("postgres", "get-synced-table", f"synced_tables/{v['catalog']}.{v['synced_schema']}.{t}")
            states[t] = s.get("status", {}).get("detailed_state", "")
        pending = {t: st for t, st in states.items() if "ONLINE" not in st or "FAILED" in st}
        print("waiting:", pending or "none")
        return not pending
    wait_for("synced tables online", all_online, every_s=20)

    # 4. Indexes (allowed on synced tables)
    with pg_connect(cli, v) as conn:
        for table, col in INDEXES.items():
            idx = f"{table}_{col.removesuffix('_id')}_idx"
            conn.execute(f'CREATE INDEX IF NOT EXISTS {idx} ON "{v["synced_schema"]}".{table} ({col})')
    print("Pipelines:", json.dumps(pipelines))
    print("Done. Next: databricks bundle deploy && databricks bundle run auditor_app, then scripts/post_deploy.py")


if __name__ == "__main__":
    main()
