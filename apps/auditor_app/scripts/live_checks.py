"""Live verification of the deployed auditor app (prints evidence; never prints credentials).

Checks: app RUNNING, /api/health, queue, one claim's triage + review + finding bbox, scan
image, Genie status + ask; then records ONE decision through the app API and shows it in
Postgres (app_schema.auditor_decision) and in the Lakehouse Sync history table in UC.

    uv run --no-project --with 'psycopg[binary]' python scripts/live_checks.py --profile <p> \
        --warehouse-id <id> --claim-id <uuid> --item-code <billed item> \
        --recovery <aud> --note "<note>" [--var k=v]
"""

from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.request

from _common import Cli, base_args, pg_connect


def show(title: str, obj: object) -> None:
    print(f"\n### {title}")
    print(obj if isinstance(obj, str) else json.dumps(obj, indent=1, default=str))


def main() -> None:
    p = base_args(__doc__)
    p.add_argument("--warehouse-id", required=True, help="SQL warehouse used to read the UC history table")
    p.add_argument("--claim-id", required=True)
    p.add_argument("--item-code", required=True)
    p.add_argument("--recovery", type=float, required=True)
    p.add_argument("--note", required=True)
    p.add_argument("--question", default="Which 5 hospitals have the highest identified recovery?")
    args = p.parse_args()
    cli = Cli(args.profile, args.target, args.var)
    v = cli.bundle_vars()

    _, app = cli.run("apps", "get", v["app_name"])
    url = app["url"].rstrip("/")
    show("App", {"name": app["name"], "url": url, "app_status": app.get("app_status"),
                 "compute_status": app.get("compute_status"),
                 "service_principal_client_id": app.get("service_principal_client_id"),
                 "active_deployment": (app.get("active_deployment") or {}).get("status")})

    _, tok = cli.run("auth", "token")
    token = tok["access_token"]  # used only in the Authorization header below

    def call(method: str, path: str, body: dict | None = None, raw: bool = False):
        req = urllib.request.Request(url + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None)
        req.add_header("Authorization", f"Bearer {token}")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
                status, ctype = r.status, r.headers.get("Content-Type")
        except urllib.error.HTTPError as e:
            data, status, ctype = e.read(), e.code, e.headers.get("Content-Type")
        meta = {"status": status, "content_type": ctype, "bytes": len(data), "seconds": round(time.time() - t0, 2)}
        return (meta, data) if raw else (meta, json.loads(data) if data else None)

    show("GET /api/health", call("GET", "/api/health"))
    meta, q = call("GET", "/api/queue?page_size=3")
    show("GET /api/queue?page_size=3", {**meta, "total": q["total"], "top": [
        {k: i[k] for k in ("claim_number", "hospital_name", "ml_fraud_score", "recommendation",
                           "review_outcome", "review_status")} for i in q["items"]]})
    show("GET /api/queue/facets", call("GET", "/api/queue/facets"))

    c = args.claim_id
    meta, d = call("GET", f"/api/claims/{c}")
    show(f"GET /api/claims/{c}", {**meta, "claim_number": d["claim"]["claim_number"],
                                  "hospital": (d.get("hospital") or {}).get("hospital_name"),
                                  "lines": len(d["lines"]), "diagnoses": len(d["diagnoses"]),
                                  "procedures": len(d["procedures"])})
    meta, t = call("GET", f"/api/claims/{c}/triage")
    show(f"GET /api/claims/{c}/triage", {**meta, **{k: t.get(k) for k in (
        "recommendation", "discrepancy_type", "confidence", "est_impact_aud", "doc_to_request",
        "triage_model")}, "key_signals": len(t.get("key_signals") or []), "reasoning": (t.get("reasoning") or "")[:300]})
    meta, r = call("GET", f"/api/claims/{c}/review")
    show(f"GET /api/claims/{c}/review", {**meta, "status": r["status"],
         "review_outcome": (r.get("summary") or {}).get("review_outcome"),
         "identified_recovery_aud": (r.get("summary") or {}).get("identified_recovery_aud"),
         "documents": [{k: x[k] for k in ("document_type", "image_url", "image_width", "image_height")}
                       for x in r["documents"]],
         "findings": [{k: f.get(k) for k in ("finding_id", "billed_item_code", "verdict", "outcome",
                                            "recovery_aud", "evidence_bbox", "evidence_page", "evidence_quote")}
                      for f in r["findings"]]})
    for doc in r["documents"]:
        show(f"GET {doc['image_url']}?width=1600", call("GET", f"{doc['image_url']}?width=1600", raw=True)[0])
    if r["documents"]:
        doc_id = r["documents"][0]["document_id"]
        meta, els = call("GET", f"/api/documents/{doc_id}/elements")
        show(f"GET /api/documents/{doc_id}/elements", {**meta, "elements": len(els), "first": els[0] if els else None})

    show("GET /api/genie/status", call("GET", "/api/genie/status"))
    meta, g = call("POST", "/api/genie/ask", {"question": args.question})
    show(f"POST /api/genie/ask {args.question!r}", {**meta, **{k: (g or {}).get(k) for k in (
        "status", "error", "detail", "answer_text", "sql")}, "result_columns": ((g or {}).get("result") or {}).get("columns"),
        "result_rows": (((g or {}).get("result") or {}).get("rows") or [])[:5]})

    finding = next(f for f in r["findings"] if f.get("billed_item_code") == args.item_code)
    body = {"decision": "confirmed", "confirmed_recovery_aud": args.recovery, "note": args.note}
    meta, dec = call("PUT", f"/api/claims/{c}/findings/{finding['finding_id']}/decision", body)
    show(f"PUT /api/claims/{c}/findings/{finding['finding_id']}/decision {json.dumps(body)}", {**meta, **(dec or {})})
    meta, wf = call("GET", f"/api/claims/{c}/workflow")
    show(f"GET /api/claims/{c}/workflow", {**meta, **{k: wf.get(k) for k in (
        "review_status", "actionable_findings", "actionable_decided", "confirmed_recovery_aud")}})

    with pg_connect(cli, v) as conn:
        cur = conn.execute(
            f'SELECT decision_id, claim_id, finding_id, decision, confirmed_recovery_aud, decided_by, decided_at, note '
            f'FROM "{v["app_schema"]}".auditor_decision WHERE decision_id = %s', (dec["decision_id"],))
        cols = [d.name for d in cur.description]
        show(f"Postgres {v['app_schema']}.auditor_decision", [dict(zip(cols, row)) for row in cur.fetchall()])

    hist = f"{v['catalog']}.{v['app_sync_schema']}.lb_auditor_decision_history"
    sql = (f"SELECT _pg_change_type, _pg_lsn, _timestamp, decision_id, claim_id, finding_id, decision, "
           f"confirmed_recovery_aud, decided_by, decided_at, note FROM {hist} "
           f"WHERE decision_id = '{dec['decision_id']}' ORDER BY _sort_by")
    env = {**os.environ, "DATABRICKS_WAREHOUSE_ID": args.warehouse_id}
    rows: list = []
    for _ in range(30):
        out = subprocess.run(["databricks", "experimental", "aitools", "tools", "query", "--profile", args.profile,
                              "-o", "json", sql], capture_output=True, text=True, env=env).stdout
        try:
            rows = json.loads(out)
        except json.JSONDecodeError:
            rows = []
        if rows:
            break
        time.sleep(5)
    show(f"UC {hist} (Lakehouse Sync)", rows or "not visible yet")


if __name__ == "__main__":
    main()
