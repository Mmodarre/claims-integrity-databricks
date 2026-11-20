"""Benchmark the Genie space through the Conversation API against ground-truth SQL.

For every benchmark in build_space.BENCHMARKS this script asks the question in a fresh
conversation, fetches Genie's SQL, text answer and result rows, runs the ground-truth SQL on the
same warehouse, and checks that every ground-truth cell appears in Genie's result (numbers within a
relative tolerance, fractions also accepted as percentages; strings case-insensitive).

    uv run --no-project --with databricks-sdk python run_benchmark.py              # all benchmarks
    uv run --no-project --with databricks-sdk python run_benchmark.py b04 b11      # a subset
    uv run --no-project --with databricks-sdk python run_benchmark.py --recheck    # re-score stored answers

Writes benchmark_results.json (full detail) and prints a markdown table. Benchmarks with a
"manual" note also need a human read of the text answer (the script flags them).
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import pathlib
import re
import sys
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

import build_space as spec

HERE = pathlib.Path(__file__).resolve().parent
C = "mehdidatalake_catalog.integrity_gold"
w = WorkspaceClient(profile=spec.PROFILE)
API = f"/api/2.0/genie/spaces/{spec.SPACE_ID}"


def run_sql(sql: str):
    r = w.statement_execution.execute_statement(statement=sql, warehouse_id=spec.WAREHOUSE_ID, wait_timeout="50s")
    while r.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(2)
        r = w.statement_execution.get_statement(r.statement_id)
    if r.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(r.status.error.message if r.status.error else str(r.status.state))
    return (r.result.data_array or []) if r.result else []


def call(method: str, path: str, body=None, retries: int = 8):
    for attempt in range(retries):
        try:
            return w.api_client.do(method, path, body=body)
        except Exception as exc:  # rate limits / transient errors
            if attempt == retries - 1:
                raise
            if "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc) or "Too many" in str(exc) or "TEMPORARILY" in str(exc):
                time.sleep(15 * (attempt + 1))
            else:
                time.sleep(3)


def ask(question: str, timeout_s: int = 600) -> dict:
    start = call("POST", f"{API}/start-conversation", {"content": question})
    cid, mid = start["conversation_id"], start["message_id"]
    t0 = time.time()
    while True:
        msg = call("GET", f"{API}/conversations/{cid}/messages/{mid}")
        if msg.get("status") in ("COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"):
            break
        if time.time() - t0 > timeout_s:
            msg["status"] = "TIMEOUT"
            break
        time.sleep(4)
    out = {"conversation_id": cid, "message_id": mid, "status": msg.get("status"),
           "error": msg.get("error"), "sql": None, "description": None, "text": [], "rows": [], "columns": []}
    for att in msg.get("attachments") or []:
        if att.get("text"):
            out["text"].append(att["text"].get("content", ""))
        if att.get("query"):
            out["sql"] = att["query"].get("query")
            out["description"] = att["query"].get("description")
            try:
                res = call("GET", f"{API}/conversations/{cid}/messages/{mid}/attachments/{att['attachment_id']}/query-result")
                sr = res.get("statement_response", {})
                out["columns"] = [c["name"] for c in sr.get("manifest", {}).get("schema", {}).get("columns", [])]
                out["rows"] = (sr.get("result") or {}).get("data_array") or []
            except Exception as exc:
                out["error"] = f"result fetch failed: {exc}"
    return out


def as_num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").replace("$", "").replace("%", ""))
    except ValueError:
        return None


def close(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= max(tol * abs(b), 0.011)


def compare(gt_rows, genie_rows, tol: float):
    nums = [n for r in genie_rows for v in r if (n := as_num(v)) is not None]
    strs = [str(v).lower() for r in genie_rows for v in r if v is not None and as_num(v) is None]
    missing = []
    for row in gt_rows:
        for v in row:
            g = as_num(v)
            if g is not None:
                if not any(close(n, g, tol) or close(n, g * 100, tol) for n in nums):
                    missing.append(v)
            elif v is not None:
                s = str(v).lower()
                if not any(s == x or s in x for x in strs):
                    missing.append(v)
    return missing


def verdict(b: dict, g: dict) -> dict:
    """Score a Genie answer. check_sql (key cells only) may be a list of acceptable alternatives."""
    checks = b.get("check_sql") or b["sql"]
    checks = checks if isinstance(checks, list) else [checks] if checks else []
    best_gt, best_missing = [], ["<no result>"] if g["status"] != "COMPLETED" else []
    if g["status"] == "COMPLETED" and checks:
        for i, chk in enumerate(checks):
            gt = run_sql(chk.replace("{C}", C))
            missing = compare(gt, g["rows"], b.get("tol", 0.005))
            if i == 0 or len(missing) < len(best_missing):
                best_gt, best_missing = gt, missing
            if not missing:
                break
    uses_measure = bool(g["sql"] and re.search(r"\bMEASURE\s*\(", g["sql"], re.I))
    result = "PASS" if not best_missing else "FAIL"
    if not b["sql"] and g["status"] == "COMPLETED":
        result = "REVIEW"  # text-only check (guardrail / caveat): judge the answer by hand
    elif result == "PASS" and b.get("manual"):
        result = "PASS*"  # numbers right; text needs the manual check
    return {**{k: b.get(k) for k in ("key", "question", "held_out", "manual")}, "gt_rows": best_gt,
            "genie": g, "missing": best_missing, "uses_measure": uses_measure, "result": result}


def evaluate(b: dict) -> dict:
    return verdict(b, ask(b["question"]))


def main() -> None:
    args = sys.argv[1:]
    recheck = "--recheck" in args  # re-score the stored Genie answers (no new questions asked)
    keys = {a for a in args if not a.startswith("--")}
    todo = [b for b in spec.BENCHMARKS if not keys or b["key"] in keys]
    path = HERE / "benchmark_results.json"
    if recheck:
        stored = {r["key"]: r for r in json.loads(path.read_text())["results"]}
        results = [verdict(b, stored[b["key"]]["genie"]) for b in todo if b["key"] in stored]
    else:
        with cf.ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(evaluate, todo))
    prev = json.loads(path.read_text()) if path.exists() and (keys or recheck) else {}
    merged = {r["key"]: r for r in prev.get("results", [])} if prev else {}
    merged.update({r["key"]: r for r in results})
    ordered = [merged[k] for k in sorted(merged)]
    run_at = prev.get("run_at") if recheck else time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps({"space_id": spec.SPACE_ID, "run_at": run_at,
                                "results": ordered}, indent=2, default=str) + "\n")
    print("| # | Question | Held out | Result | MEASURE() | Missing |")
    print("|---|---|---|---|---|---|")
    for r in ordered:
        print(f"| {r['key']} | {r['question']} | {'yes' if r['held_out'] else ''} | {r['result']} | "
              f"{'yes' if r['uses_measure'] else ''} | {', '.join(map(str, r['missing'])) if r['missing'] else ''} |")
    passed = sum(r["result"].startswith("PASS") for r in ordered)
    review = sum(r["result"] == "REVIEW" for r in ordered)
    print(f"\n{passed}/{len(ordered) - review} automatic checks pass; {review} text-only answers to review")


if __name__ == "__main__":
    main()
