"""Shared helpers for the Lakebase provisioning scripts.

Names come from databricks.yml (resolved with `databricks bundle validate -o json`), so the
bundle variables are the single source of truth for the app and its infrastructure.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import psycopg

ROOT = Path(__file__).resolve().parent.parent


def base_args(description: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--profile", required=True, help="Databricks CLI profile")
    p.add_argument("--target", default=None, help="bundle target (default: the bundle's default target)")
    p.add_argument("--var", action="append", default=[], help="bundle variable override, name=value")
    return p


class Cli:
    def __init__(self, profile: str, target: str | None, overrides: list[str]) -> None:
        self.profile = profile
        self.target = target
        self.overrides = overrides

    def run(self, *args: str, check: bool = True) -> tuple[int, Any]:
        cmd = ["databricks", *args, "-p", self.profile, "-o", "json"]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        out: Any = proc.stdout
        try:
            out = json.loads(proc.stdout) if proc.stdout.strip() else None
        except json.JSONDecodeError:
            pass
        if check and proc.returncode != 0:
            sys.exit(f"FAILED: {' '.join(cmd)}\n{proc.stderr.strip() or proc.stdout.strip()}")
        return proc.returncode, out if proc.returncode == 0 else (proc.stderr or proc.stdout)

    def bundle_vars(self) -> dict[str, str]:
        cmd = ["bundle", "validate"]
        if self.target:
            cmd += ["-t", self.target]
        for o in self.overrides:
            cmd.append(f"--var={o}")
        proc = subprocess.run(["databricks", *cmd, "-p", self.profile, "-o", "json"],
                              capture_output=True, text=True, cwd=ROOT)
        if proc.returncode != 0:
            sys.exit(f"bundle validate failed:\n{proc.stderr}")
        data = json.loads(proc.stdout)
        return {k: str(v.get("value", "")) for k, v in data["variables"].items()}


def names(v: dict[str, str]) -> dict[str, str]:
    """Derived resource paths from the bundle variables."""
    branch = f"projects/{v['lakebase_project']}/branches/{v['lakebase_branch']}"
    return {
        "project": f"projects/{v['lakebase_project']}",
        "branch": branch,
        "endpoint": f"{branch}/endpoints/{v['lakebase_endpoint']}",
        "database": f"{branch}/databases/{v['lakebase_database_id']}",
    }


def pg_connect(cli: Cli, v: dict[str, str]) -> psycopg.Connection:
    """Connect to Lakebase as the CLI user (project owner) with an OAuth credential."""
    n = names(v)
    _, ep = cli.run("postgres", "get-endpoint", n["endpoint"])
    _, cred = cli.run("postgres", "generate-database-credential", n["endpoint"])
    _, me = cli.run("current-user", "me")
    return psycopg.connect(host=ep["status"]["hosts"]["host"], dbname=v["postgres_database"],
                           user=me["userName"], password=cred["token"], sslmode="require", autocommit=True)


def wait_for(what: str, fn, timeout_s: int = 1800, every_s: int = 10):
    start = time.time()
    while True:
        result = fn()
        if result:
            return result
        if time.time() - start > timeout_s:
            sys.exit(f"Timed out waiting for {what}")
        time.sleep(every_s)
