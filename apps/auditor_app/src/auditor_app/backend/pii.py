"""Member-PII policy applied by the app.

The gold claim_detail table protects member PII with UC column masks (visible only to
privileged groups). Masks do not travel into Lakebase synced tables, so the app re-applies
the same rule to every response: PII is returned only when the signed-in user belongs to one
of AUDITOR_APP_PII_GROUPS (looked up on behalf of the user, scope iam.current-user:read).
Anything else — including a failed lookup — gets the masked values the UC functions return.
"""

from __future__ import annotations

import threading
import time

from databricks.sdk import WorkspaceClient

from .core._config import AppConfig, logger
from .core._headers import DatabricksAppsHeaders

MASKED = "***MASKED***"  # same literal as the UC mask function for strings (dates -> NULL)
_TTL_S = 300
_cache: dict[str, tuple[bool, float]] = {}
_lock = threading.Lock()


def can_view_pii(headers: DatabricksAppsHeaders, ws: WorkspaceClient, cfg: AppConfig) -> bool:
    allowed_groups = {g.strip() for g in cfg.pii_groups.split(",") if g.strip()}
    if not allowed_groups:
        return False
    key = headers.user_email or headers.user_name or "local"
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
    try:
        client = (
            WorkspaceClient(token=headers.token.get_secret_value(), auth_type="pat") if headers.token else ws
        )
        me = client.current_user.me()
        groups = {g.display for g in (me.groups or []) if g.display}
        allowed = bool(groups & allowed_groups)
    except Exception as exc:  # noqa: BLE001 — fail closed
        logger.warning("PII group lookup failed for %s; masking PII: %s", key, exc)
        allowed = False
    with _lock:
        _cache[key] = (allowed, now + _TTL_S)
    return allowed
