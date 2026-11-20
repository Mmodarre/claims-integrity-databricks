-- Idempotent setup run by the job before the pipelines (SQL warehouse task; :catalog, :gold_schema).

-- 1. Column-mask functions for member PII (Unity Catalog fine-grained access control).
--    Workspace admins and the claims_integrity_auditors group see real values; everyone else is masked.
--    Applied to gold.claim_detail by the ingest pipeline (MASK clause). Lakebase synced tables are
--    created by an admin, so the auditor app keeps real identities for authorised auditors.
CREATE OR REPLACE FUNCTION IDENTIFIER(:catalog || '.' || :gold_schema || '.mask_pii_string')(value STRING)
  RETURNS STRING
  COMMENT 'Column mask: reveal member PII only to admins and the claims_integrity_auditors group.'
  RETURN CASE WHEN is_member('admins') OR is_account_group_member('claims_integrity_auditors') THEN value
              ELSE '***MASKED***' END;

CREATE OR REPLACE FUNCTION IDENTIFIER(:catalog || '.' || :gold_schema || '.mask_pii_date')(value DATE)
  RETURNS DATE
  COMMENT 'Column mask for PII dates (date of birth): NULL unless admin or claims_integrity_auditors.'
  RETURN CASE WHEN is_member('admins') OR is_account_group_member('claims_integrity_auditors') THEN value
              ELSE CAST(NULL AS DATE) END;

-- 2. Auditor decisions consumed by the AI pipeline's integrity facts. Starts as an empty typed view;
--    once the auditor app's Lakebase project and Lakehouse Sync exist, auditor_decision_from_lakebase.sql
--    replaces it with the latest-state view over the synced history. IF NOT EXISTS keeps that upgrade.
CREATE VIEW IF NOT EXISTS IDENTIFIER(:catalog || '.' || :gold_schema || '.auditor_decision')
  COMMENT 'Auditor decisions (empty until the Lakebase write-back is connected).'
AS SELECT
  CAST(NULL AS STRING)         AS decision_id,
  CAST(NULL AS STRING)         AS claim_id,
  CAST(NULL AS STRING)         AS finding_id,
  CAST(NULL AS STRING)         AS decision,
  CAST(NULL AS DECIMAL(12, 2)) AS confirmed_recovery_aud,
  CAST(NULL AS STRING)         AS decided_by,
  CAST(NULL AS TIMESTAMP)      AS decided_at,
  CAST(NULL AS STRING)         AS note
WHERE false;
