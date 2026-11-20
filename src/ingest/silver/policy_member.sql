CREATE OR REFRESH MATERIALIZED VIEW policy_member
COMMENT 'Policy membership (member role on each policy).'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT policy_member_id, policy_id, member_id, member_role, relationship_to_primary,
          effective_date, end_date, is_active
FROM ${bronze_schema}.policy__policy_member
QUALIFY row_number() OVER (PARTITION BY policy_member_id ORDER BY _ingested_at DESC) = 1;
