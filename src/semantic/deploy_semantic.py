"""Deploy the semantic layer on a SQL warehouse: metric views (YAML) and the ai_forecast table.

Metric-view YAML cannot take query parameters, so this script substitutes ${catalog} /
${gold_schema} into each definition and runs it through the Statement Execution API. Each metric
view is then smoke-tested with a MEASURE() query. Runs as a job task or locally:

    python deploy_semantic.py --catalog C --gold-schema S --warehouse-id W [--root DIR] [--profile P] [--skip-forecast]
"""

import argparse
import pathlib
import re
import sys
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState


def run_sql(w: WorkspaceClient, warehouse_id: str, sql: str, label: str):
    resp = w.statement_execution.execute_statement(statement=sql, warehouse_id=warehouse_id, wait_timeout="50s")
    while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(3)
        resp = w.statement_execution.get_statement(resp.statement_id)
    if resp.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"{label} failed: {resp.status.error.message if resp.status.error else resp.status.state}")
    return resp.result.data_array if resp.result else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--gold-schema", required=True)
    ap.add_argument("--warehouse-id", required=True)
    ap.add_argument("--root", default=None, help="Directory holding metric_views/ and claims_forecast.sql")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--skip-forecast", action="store_true")
    args = ap.parse_args()

    root = pathlib.Path(args.root) if args.root else pathlib.Path(sys.argv[0]).resolve().parent
    subs = {"${catalog}": args.catalog, "${gold_schema}": args.gold_schema}

    def render(text: str) -> str:
        for k, v in subs.items():
            text = text.replace(k, v)
        return text

    w = WorkspaceClient(profile=args.profile) if args.profile else WorkspaceClient()
    failures = []

    for yaml_path in sorted((root / "metric_views").glob("*.yaml")):
        name = f"{args.catalog}.{args.gold_schema}.{yaml_path.stem}"
        body = render(yaml_path.read_text())
        ddl = f"CREATE OR REPLACE VIEW {name}\nWITH METRICS\nLANGUAGE YAML\nAS $$\n{body}\n$$"
        try:
            run_sql(w, args.warehouse_id, ddl, f"create {name}")
            first_measure = re.search(r"^measures:\s*\n\s*-\s*name:\s*(\w+)", body, re.M).group(1)
            rows = run_sql(w, args.warehouse_id, f"SELECT MEASURE({first_measure}) FROM {name}", f"test {name}")
            print(f"OK   {name}  ({first_measure} = {rows[0][0] if rows else None})", flush=True)
        except Exception as exc:  # keep going so one bad view does not hide the others
            failures.append(name)
            print(f"FAIL {name}: {exc}", flush=True)

    if not args.skip_forecast:
        try:
            # Last complete week of history, and a 26-week horizon after it.
            weeks = run_sql(w, args.warehouse_id,
                            f"SELECT CAST(date_trunc('WEEK', max(service_date)) - INTERVAL 7 DAYS AS DATE), "
                            f"CAST(date_trunc('WEEK', max(service_date)) + INTERVAL 175 DAYS AS DATE) "
                            f"FROM {args.catalog}.{args.gold_schema}.claims_fact", "forecast window")
            subs["${last_full_week}"], subs["${horizon}"] = weeks[0][0], weeks[0][1]
            run_sql(w, args.warehouse_id, render((root / "claims_forecast.sql").read_text()), "claims_forecast")
            rows = run_sql(w, args.warehouse_id,
                           f"SELECT series, count(*) FROM {args.catalog}.{args.gold_schema}.claims_forecast GROUP BY 1",
                           "test claims_forecast")
            print(f"OK   claims_forecast {rows}", flush=True)
        except Exception as exc:
            failures.append("claims_forecast")
            print(f"FAIL claims_forecast: {exc}", flush=True)

    if failures:
        print(f"{len(failures)} failure(s): {failures}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    # Job runners treat any SystemExit (even 0) as a failure, so only raise when something failed.
    if main() != 0:
        raise SystemExit(1)
