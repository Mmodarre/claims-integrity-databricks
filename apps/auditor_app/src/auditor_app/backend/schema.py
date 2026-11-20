"""DDL for the app-owned Postgres schema ({app}, default `auditor`).

Run idempotently at startup by the app service principal, which therefore owns the schema
and its tables. Lakehouse Sync (CDF config on this schema) streams every change into Unity
Catalog as `lb_<table>_history`, so every table needs REPLICA IDENTITY FULL and only
Lakehouse-Sync-supported types (text, numeric, smallint, boolean, timestamptz).

auditor_decision mirrors the Delta placeholder table `auditor_decision` in the gold schema
(bundle variable gold_schema) column-for-column. It holds the CURRENT decision per (claim_id, finding_id) — a re-decision
updates the row in place (decision_id is kept) and the UC history table keeps every version.
finding_id NULL = claim-level decision.
"""

MIGRATIONS: list[str] = [
    "CREATE SCHEMA IF NOT EXISTS {app}",
    """
    CREATE TABLE IF NOT EXISTS {app}.auditor_decision (
      decision_id            text PRIMARY KEY,
      claim_id               text NOT NULL,
      finding_id             text,
      decision               text NOT NULL
        CHECK (decision IN ('confirmed', 'rejected', 'needs_information', 'escalated')),
      confirmed_recovery_aud numeric(12, 2) CHECK (confirmed_recovery_aud IS NULL OR confirmed_recovery_aud >= 0),
      decided_by             text,
      decided_at             timestamptz NOT NULL DEFAULT now(),
      note                   text,
      CONSTRAINT auditor_decision_claim_finding_uq UNIQUE NULLS NOT DISTINCT (claim_id, finding_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS {app}.document_request (
      request_id    text PRIMARY KEY,
      claim_id      text NOT NULL,
      doc_type      text NOT NULL,
      recipient     text NOT NULL,
      subject       text NOT NULL,
      body          text NOT NULL,
      status        text NOT NULL DEFAULT 'awaiting_document'
        CHECK (status IN ('awaiting_document', 'received', 'cancelled')),
      drafted_by_ai boolean,
      draft_model   text,
      requested_by  text,
      requested_at  timestamptz NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS document_request_claim_idx ON {app}.document_request (claim_id)",
    """
    CREATE TABLE IF NOT EXISTS {app}.auditor_feedback (
      feedback_id      text PRIMARY KEY,
      claim_id         text NOT NULL,
      reasoning_rating smallint NOT NULL CHECK (reasoning_rating BETWEEN 1 AND 5),
      decision         text NOT NULL
        CHECK (decision IN ('confirmed', 'rejected', 'needs_information', 'escalated')),
      note             text,
      auditor_id       text,
      persona          text NOT NULL DEFAULT 'auditor',
      created_at       timestamptz NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS auditor_feedback_claim_idx ON {app}.auditor_feedback (claim_id)",
    "ALTER TABLE {app}.auditor_decision REPLICA IDENTITY FULL",
    "ALTER TABLE {app}.document_request REPLICA IDENTITY FULL",
    "ALTER TABLE {app}.auditor_feedback REPLICA IDENTITY FULL",
]
