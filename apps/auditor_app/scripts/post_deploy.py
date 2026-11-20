"""Step 3 of 3 — after `databricks bundle deploy` + `databricks bundle run auditor_app` (idempotent).

  * Grants the app service principal USAGE + SELECT on the synced-table schema. (The app
    SP already owns app_schema: it creates it at startup. Synced tables are owned by a
    managed role whose reader role cannot be granted, so the grant is per table; re-run this
    script if a synced table is ever deleted and recreated.)
  * Creates the Lakehouse Sync (CDF) config: Postgres app_schema -> UC catalog.app_sync_schema,
    producing lb_<table>_history Delta tables, and prints their status.

    uv run --no-project --with 'psycopg[binary]' python scripts/post_deploy.py --profile <p> [--var k=v]
"""

from __future__ import annotations

import json
import sys

from _common import Cli, base_args, names, pg_connect, wait_for


def main() -> None:
    args = base_args(__doc__).parse_args()
    cli = Cli(args.profile, args.target, args.var)
    v = cli.bundle_vars()
    n = names(v)

    _, app = cli.run("apps", "get", v["app_name"])
    sp = app["service_principal_client_id"]
    print(f"App {v['app_name']} ({app.get('app_status', {}).get('state')}), service principal {sp}")

    with pg_connect(cli, v) as conn:
        synced, app_schema = v["synced_schema"], v["app_schema"]
        conn.execute(f'GRANT USAGE ON SCHEMA "{synced}" TO "{sp}"')
        conn.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA "{synced}" TO "{sp}"')
        owner = conn.execute(
            "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = %s", (app_schema,)
        ).fetchone()
        tables = [r[0] for r in conn.execute(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace "
            "WHERE ns.nspname = %s AND c.relkind = 'r' AND c.relreplident = 'f' ORDER BY 1", (app_schema,)
        ).fetchall()]
    if not owner:
        sys.exit(f"Postgres schema {app_schema} does not exist yet — start the app first (it runs the DDL).")
    print(f"Granted SELECT on {synced}.* to {sp}; {app_schema} owned by {owner[0]}, "
          f"REPLICA IDENTITY FULL tables: {tables}")

    cfg_id = f"{v['app_schema']}_to_{v['app_sync_schema']}"
    cfg_name = f"{n['database']}/cdf-configs/{cfg_id}"
    rc, _ = cli.run("postgres", "get-cdf-config", cfg_name, check=False)
    if rc != 0:
        cli.run("postgres", "create-cdf-config", n["database"], v["catalog"], v["app_sync_schema"],
                v["app_schema"], "--cdf-config-id", cfg_id)
        print(f"Created Lakehouse Sync config {cfg_name}")

    def streaming():
        rc, statuses = cli.run("postgres", "list-cdf-statuses", cfg_name, check=False)
        if rc != 0 or not isinstance(statuses, list) or len(statuses) < len(tables):
            return None
        return statuses if all(s.get("state") == "CDF_STATE_STREAMING" for s in statuses) else None
    for s in wait_for("Lakehouse Sync streaming", streaming, timeout_s=900):
        print(f"  {s['postgres_table']:<20} {s['state']:<22} -> {s['uc_table']}")
    print(json.dumps({"app_url": app.get("url"), "service_principal": sp, "cdf_config": cfg_name}, indent=1))


if __name__ == "__main__":
    main()
