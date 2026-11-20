CREATE OR REFRESH MATERIALIZED VIEW provider (
  CONSTRAINT provider_id_present EXPECT (provider_id IS NOT NULL) ON VIOLATION DROP ROW
)
COMMENT 'Providers (practitioners and practices).'
TBLPROPERTIES ('quality' = 'silver')
AS SELECT provider_id, provider_number, provider_type_id, provider_category, title, first_name,
          last_name, coalesce(practice_name, concat_ws(' ', title, first_name, last_name)) AS display_name,
          practice_name, abn, ahpra_number, CAST(specialty_id AS BIGINT) AS specialty_id,
          preferred_provider, CAST(network_id AS BIGINT) AS network_id, status, registration_date
FROM ${bronze_schema}.reference__provider
QUALIFY row_number() OVER (PARTITION BY provider_id ORDER BY _ingested_at DESC) = 1;
