#!/usr/bin/env python3
"""Save a command's raw output into evidence/logs/<name>.log with workspace host / operator redacted.

    <command> 2>&1 | python scripts/save_log.py <name> --profile <p> [--title "..."]

Passes the output through to stdout as well, so it can sit at the end of any pipeline.
"""

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("name")
ap.add_argument("--profile", required=True)
ap.add_argument("--title", default="")
a = ap.parse_args()

def cli(*args):
    out = subprocess.run(["databricks", *args, "-p", a.profile, "-o", "json"], capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else {}

me = cli("current-user", "me").get("userName", "")
host = subprocess.run(["databricks", "auth", "describe", "-p", a.profile, "-o", "json"], capture_output=True,
                      text=True).stdout
try:
    host = json.loads(host)["details"]["host"].replace("https://", "").rstrip("/")
except Exception:
    host = ""
pairs = [(me, "<operator>"), (me.split("@")[0], "<operator>")] if me else []
if host:
    pairs += [(host, "<workspace-host>"), (host.split(".")[0], "<workspace>")]
    ws_id = host.split(".")[0].replace("adb-", "")
    pairs.append((ws_id, "<workspace-id>"))

text = sys.stdin.read()
sys.stdout.write(text)
for x, y in pairs:
    if x:
        text = text.replace(x, y)
out = Path(__file__).resolve().parent.parent / "evidence" / "logs" / f"{a.name}.log"
out.parent.mkdir(parents=True, exist_ok=True)
stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
out.write_text(f"# {a.title or a.name}\n# captured {stamp}\n\n{text}")
print(f"\n[saved evidence/logs/{a.name}.log]", file=sys.stderr)
