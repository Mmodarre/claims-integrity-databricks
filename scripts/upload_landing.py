"""Upload the raw dataset to the landing volume: reconciles local Data/ against the volume by
(relative path, size) and uploads only missing or changed files, with retries.

Usage: python upload_landing.py <local_data_dir> <volume_root> [--dry-run]   (profile: DATABRICKS_CONFIG_PROFILE)
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from databricks.sdk import WorkspaceClient

local_root, vol_root = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
dry_run = "--dry-run" in sys.argv
SUBDIRS = ["exports", "rendered_docs"]

import os
w = WorkspaceClient(profile=os.environ.get("DATABRICKS_CONFIG_PROFILE"))

# --- local inventory (skip macOS cruft) ---
local = {}
for sub in SUBDIRS:
    for dirpath, _, files in os.walk(os.path.join(local_root, sub)):
        for f in files:
            if f == ".DS_Store":
                continue
            p = os.path.join(dirpath, f)
            local[os.path.relpath(p, local_root)] = os.path.getsize(p)


# --- remote inventory (recursive, directories listed in parallel) ---
def list_dir(path):
    out, subdirs = {}, []
    try:
        for e in w.files.list_directory_contents(path):
            if e.is_directory:
                subdirs.append(e.path)
            else:
                out[os.path.relpath(e.path, vol_root)] = e.file_size
    except Exception as ex:  # missing dir -> nothing remote
        if "NOT_FOUND" not in str(ex) and "does not exist" not in str(ex):
            raise
    return out, subdirs


remote, frontier = {}, [f"{vol_root}/{s}" for s in SUBDIRS]
with ThreadPoolExecutor(16) as ex:
    while frontier:
        results = list(ex.map(list_dir, frontier))
        frontier = []
        for files, subdirs in results:
            remote.update(files)
            frontier.extend(subdirs)

todo = sorted(k for k, sz in local.items() if remote.get(k) != sz)
extra = sorted(set(remote) - set(local))
print(f"local={len(local)} files ({sum(local.values())/1e9:.2f} GB)  remote={len(remote)}  "
      f"to_upload={len(todo)}  remote_only={len(extra)}", flush=True)
for k in extra[:10]:
    print("  remote-only:", k)
if dry_run or not todo:
    sys.exit(0)


def upload(rel):
    for attempt in range(1, 6):
        try:
            with open(os.path.join(local_root, rel), "rb") as fh:
                w.files.upload(f"{vol_root}/{rel}", fh, overwrite=True)
            return rel, None
        except Exception as ex:
            if attempt == 5:
                return rel, repr(ex)[:200]
            time.sleep(2 ** attempt)


failed = []
with ThreadPoolExecutor(6) as ex:
    futs = [ex.submit(upload, r) for r in todo]
    for i, fut in enumerate(as_completed(futs), 1):
        rel, err = fut.result()
        if err:
            failed.append((rel, err))
            print(f"FAIL {rel}: {err}", flush=True)
        if i % 25 == 0 or i == len(todo):
            print(f"progress {i}/{len(todo)} failed={len(failed)}", flush=True)
sys.exit(1 if failed else 0)
