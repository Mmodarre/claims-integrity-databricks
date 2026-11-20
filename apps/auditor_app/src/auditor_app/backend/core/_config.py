from __future__ import annotations

import logging
from importlib import resources
from pathlib import Path
from typing import ClassVar

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from ..._metadata import app_name, app_slug

# --- Config ---

project_root = Path(__file__).parent.parent.parent.parent.parent
env_file = project_root / ".env"

if env_file.exists():
    load_dotenv(dotenv_path=env_file)


class AppConfig(BaseSettings):
    """Runtime config. Every field reads env var AUDITOR_APP_<FIELD> (set in app.yml)."""

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=env_file,
        env_prefix=f"{app_slug.upper()}_",
        extra="ignore",
        env_nested_delimiter="__",
    )
    app_name: str = Field(default=app_name)

    # ── Lakebase (Autoscaling) ─────────────────────────────────────────────────────
    # All names come from app.yml, rendered from the bundle variables (databricks.yml) by
    # scripts/build_app.py; nothing is hard-coded here. Empty required values fail startup.
    # Endpoint resource path used to mint OAuth database credentials. The Databricks Apps
    # `postgres` resource injects PGHOST/PGUSER/PGDATABASE; an injected LAKEBASE_ENDPOINT,
    # when present, takes precedence.
    lakebase_endpoint: str = Field(default="")
    lakebase_database: str = Field(default="databricks_postgres")
    # Postgres schema holding the read-only Lakebase synced tables (copies of the gold tables).
    synced_schema: str = Field(default="")
    # App-owned schema (decisions, document requests, feedback). Created and owned by the
    # app service principal at startup; Lakehouse Sync replicates it to Unity Catalog.
    app_schema: str = Field(default="")
    # Run the idempotent DDL for app_schema at startup. Disable for local dev so the schema
    # is never created by (and owned by) a developer identity instead of the app SP.
    run_migrations: bool = Field(default=True)
    pool_max_size: int = Field(default=10)

    # ── Member PII ─────────────────────────────────────────────────────────────────
    # Comma-separated groups allowed to see member PII (mirrors the UC column masks on
    # claim_detail, which do not apply inside Lakebase). Empty = always masked.
    pii_groups: str = Field(default="")

    # ── Scanned documents ──────────────────────────────────────────────────────────
    # Native pixel size of the rendered scans (bbox coordinates are in this space). Used
    # only when document_element carries no image size for a document.
    scan_width_px: int = Field(default=3584)
    scan_height_px: int = Field(default=4800)
    image_cache_entries: int = Field(default=96)

    # ── Genie ("Ask the data") ─────────────────────────────────────────────────────
    # Empty -> the panel shows a "not configured" state instead of failing. Genie runs
    # on behalf of the signed-in user (user authorization scope dashboards.genie).
    genie_space_id: str = Field(default="")

    # ── Document-request drafting ──────────────────────────────────────────────────
    # Foundation Model API endpoint (app service principal, CAN_QUERY via app resource).
    # A templated draft is used if the endpoint is unreachable.
    draft_model: str = Field(default="databricks-claude-sonnet-5-5")

    @property
    def static_assets_path(self) -> Path:
        return Path(str(resources.files(app_slug))).joinpath("__dist__")

    def __hash__(self) -> int:
        return hash(self.app_name)


# --- Logger ---

logger = logging.getLogger(app_name)
