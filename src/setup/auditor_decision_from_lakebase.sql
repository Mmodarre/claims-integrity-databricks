-- Connect the auditor app's write-back to the lakehouse (run once after Lakehouse Sync is enabled;
-- parameters :catalog, :gold_schema, :app_schema). The auditor app writes decisions to Lakebase
-- Postgres (schema `auditor`); Lakehouse Sync streams the change feed into
-- <catalog>.<app_schema>.lb_auditor_decision_history. This view keeps the latest state per decision
-- (pre/post images collapsed, deletes removed) so per-claim sums of confirmed recovery never double-count.
CREATE OR REPLACE VIEW IDENTIFIER(:catalog || '.' || :gold_schema || '.auditor_decision')
  COMMENT 'Auditor decisions: latest state per decision from the Lakebase write-back (Lakehouse Sync).'
AS SELECT decision_id, claim_id, finding_id, decision, confirmed_recovery_aud, decided_by, decided_at, note
FROM (
  SELECT *, row_number() OVER (PARTITION BY decision_id ORDER BY _sort_by DESC) AS rn
  FROM IDENTIFIER(:catalog || '.' || :app_schema || '.lb_auditor_decision_history')
  WHERE _pg_change_type IN ('insert', 'update_postimage', 'delete')
)
WHERE rn = 1 AND _pg_change_type <> 'delete';
