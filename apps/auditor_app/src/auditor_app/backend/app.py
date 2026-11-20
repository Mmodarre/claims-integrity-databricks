import psycopg
from fastapi import Request
from fastapi.responses import JSONResponse

from .core import create_app, logger
from .router import router

app = create_app(routers=[router])


@app.exception_handler(psycopg.Error)
async def _postgres_error(_: Request, exc: psycopg.Error) -> JSONResponse:
    """Map Lakebase errors to clear HTTP errors (permission problems surface as 403)."""
    logger.error("Lakebase error: %s", exc)
    status = 403 if isinstance(exc, psycopg.errors.InsufficientPrivilege) else 500
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.OperationalError)):
        status = 503
    return JSONResponse({"detail": f"Lakebase error: {exc}"}, status_code=status)
