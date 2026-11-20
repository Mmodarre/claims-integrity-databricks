"""Lakebase Autoscaling connectivity: OAuth token refresh, connection pool, startup DDL.

In the deployed app the `postgres` app resource injects PGHOST / PGUSER (the app service
principal's client id) / PGDATABASE, and grants the SP CAN_CONNECT_AND_CREATE. Passwords
are short-lived OAuth credentials minted with `w.postgres.generate_database_credential`
(1h lifetime); each new pooled connection gets a fresh-enough token, and connections are
recycled before the token would matter. Locally the same code runs as the CLI profile user.
"""

from __future__ import annotations

import os
import re
import threading
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Annotated, Any, AsyncGenerator, LiteralString, TypeAlias, cast

import psycopg
from databricks.sdk import WorkspaceClient
from fastapi import FastAPI, HTTPException, Request
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from ._base import LifespanDependency
from ._config import AppConfig, logger

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")
_TOKEN_TTL_S = 30 * 60  # re-mint well inside the 1h credential lifetime


class _TokenProvider:
    """Thread-safe cache of the Lakebase OAuth credential for one endpoint."""

    def __init__(self, ws: WorkspaceClient, endpoint: str) -> None:
        self._ws = ws
        self._endpoint = endpoint
        self._lock = threading.Lock()
        self._token: str | None = None
        self._minted_at = 0.0

    def __call__(self) -> str:
        with self._lock:
            if self._token is None or time.monotonic() - self._minted_at > _TOKEN_TTL_S:
                cred = self._ws.postgres.generate_database_credential(endpoint=self._endpoint)
                if not cred.token:
                    raise RuntimeError("Lakebase returned an empty database credential")
                self._token = cred.token
                self._minted_at = time.monotonic()
            return self._token


def _connection_class(token: _TokenProvider) -> type[psycopg.Connection]:
    class _OAuthConnection(psycopg.Connection):  # type: ignore[type-arg]
        @classmethod
        def connect(cls, conninfo: str = "", **kwargs: Any):  # type: ignore[override]
            kwargs["password"] = token()
            return super().connect(conninfo, **kwargs)

    return _OAuthConnection


class Db:
    """Thin query helper over the pool. SQL may reference `{synced}` / `{app}` for the
    configured schema names (validated identifiers); values always go through psycopg
    parameters (`%(name)s`)."""

    def __init__(self, pool: ConnectionPool, cfg: AppConfig) -> None:
        self.pool = pool
        self.synced = cfg.synced_schema
        self.app = cfg.app_schema

    def sql(self, text: str) -> LiteralString:
        # Schema names are validated identifiers (see _IDENT); values never go through here.
        return cast(LiteralString, text.replace("{synced}", self.synced).replace("{app}", self.app))

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection]:
        try:
            with self.pool.connection() as conn:
                yield conn
        except (psycopg.OperationalError, TimeoutError) as exc:
            logger.error("Lakebase connection error: %s", exc)
            raise HTTPException(status_code=503, detail=f"Lakebase is unavailable: {exc}") from exc

    def all(self, text: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        with self.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(self.sql(text), params or {})
            return list(cur.fetchall())

    def one(self, text: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        rows = self.all(text, params)
        return rows[0] if rows else None


def _resolve_endpoint(cfg: AppConfig) -> str:
    return os.environ.get("LAKEBASE_ENDPOINT") or cfg.lakebase_endpoint


def _resolve_conninfo(cfg: AppConfig, ws: WorkspaceClient, endpoint: str) -> dict[str, Any]:
    host = os.environ.get("PGHOST")
    if not host:
        ep = ws.postgres.get_endpoint(name=endpoint)
        host = ep.status.hosts.host if ep.status and ep.status.hosts else None
    if not host:
        raise RuntimeError(f"Could not resolve a host for Lakebase endpoint {endpoint}")
    user = os.environ.get("PGUSER") or ws.config.client_id or ws.current_user.me().user_name
    return {
        "host": host,
        "port": int(os.environ.get("PGPORT", "5432")),
        "dbname": os.environ.get("PGDATABASE") or cfg.lakebase_database,
        "user": user,
        "sslmode": os.environ.get("PGSSLMODE", "require"),
        "application_name": cfg.app_name,
    }


def _run_migrations(db: Db, statements: list[str]) -> None:
    with db.pool.connection() as conn:
        with conn.transaction():
            for stmt in statements:
                conn.execute(db.sql(stmt))


class _LakebaseDependency(LifespanDependency):
    @asynccontextmanager
    async def lifespan(self, app: FastAPI) -> AsyncGenerator[None, None]:
        from ..schema import MIGRATIONS  # local import: schema imports nothing from core

        cfg: AppConfig = app.state.config
        ws: WorkspaceClient = app.state.workspace_client
        for field in ("synced_schema", "app_schema"):
            ident = getattr(cfg, field)
            if not _IDENT.match(ident):
                raise ValueError(
                    f"AUDITOR_APP_{field.upper()} must be a lowercase Postgres identifier, got {ident!r} "
                    "(set it via the bundle variables / app.yml)"
                )

        endpoint = _resolve_endpoint(cfg)
        if not endpoint:
            raise ValueError("AUDITOR_APP_LAKEBASE_ENDPOINT is not set (bundle variables / app.yml)")
        conninfo = _resolve_conninfo(cfg, ws, endpoint)
        logger.info(
            "Lakebase: endpoint=%s host=%s db=%s user=%s (env PGHOST set: %s)",
            endpoint, conninfo["host"], conninfo["dbname"], conninfo["user"], "PGHOST" in os.environ,
        )
        pool = ConnectionPool(
            kwargs=conninfo,
            connection_class=_connection_class(_TokenProvider(ws, endpoint)),
            min_size=1,
            max_size=cfg.pool_max_size,
            max_lifetime=45 * 60,
            max_idle=10 * 60,
            check=ConnectionPool.check_connection,
            open=False,
            name="lakebase",
        )
        pool.open(wait=False)
        db = Db(pool, cfg)
        app.state.db = db
        app.state.db_error = None

        if cfg.run_migrations:
            for attempt in range(1, 6):
                try:
                    _run_migrations(db, MIGRATIONS)
                    app.state.db_error = None
                    logger.info("Lakebase schema %s is ready", cfg.app_schema)
                    break
                except Exception as exc:  # noqa: BLE001 — keep serving reads; surface via /api/health
                    app.state.db_error = f"{type(exc).__name__}: {exc}"
                    logger.error("Schema migration attempt %d failed: %s", attempt, exc)
                    time.sleep(min(2 * attempt, 8))
            if app.state.db_error:
                logger.error("Giving up on migrations; writes will fail until fixed: %s", app.state.db_error)
        try:
            yield
        finally:
            pool.close()

    @staticmethod
    def __call__(request: Request) -> Db:
        return request.app.state.db


LakebaseDependency: TypeAlias = Annotated[Db, _LakebaseDependency.depends()]
