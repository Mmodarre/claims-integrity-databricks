-- MODEL-INTERNAL ONLY (temporary view, never published): the mock fraud model is a stand-in for
-- the insurer's existing ML model, so it is allowed to "know" which episodes were planted.
-- Labels are used to compute score + reason and are dropped before anything is published.
CREATE TEMPORARY VIEW model_label_features AS
SELECT
  g.claim_id,
  g.planted,
  g.episode_label,
  f.finding_type AS primary_finding_type
FROM ${eval_schema}.integrity__episode_ground_truth g
LEFT JOIN (
  SELECT episode_id, finding_type
  FROM ${eval_schema}.integrity__integrity_finding
  QUALIFY row_number() OVER (PARTITION BY episode_id ORDER BY recovery_amount DESC NULLS LAST, finding_id) = 1
) f ON f.episode_id = g.episode_id
QUALIFY row_number() OVER (PARTITION BY g.claim_id ORDER BY g.created_at DESC) = 1;
