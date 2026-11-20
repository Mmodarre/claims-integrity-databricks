CREATE OR REFRESH MATERIALIZED VIEW policy (
  CONSTRAINT policy_id_present EXPECT (policy_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Policies.'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT policy_id, policy_number, product_id, policy_status, policy_type, effective_date, end_date,
          cancellation_reason, payment_frequency, premium_amount, excess_amount,
          government_rebate_tier, rebate_claimed_as, distribution_channel, state_of_residence,
          original_join_date
FROM ${bronze_schema}.policy__policy
QUALIFY row_number() OVER (PARTITION BY policy_id ORDER BY _ingested_at DESC) = 1;
