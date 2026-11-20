-- Hospital integrity risk profile: volume, flag rate vs peers (z-score), document-review outcomes,
-- identified recovery and discrepancy mix, plus an AI-written risk narrative for hospitals that
-- warrant attention (so team leads read an explanation, not just a ranking).
CREATE OR REFRESH MATERIALIZED VIEW ${gold_schema}.hospital_risk_profile
COMMENT 'Per-hospital integrity risk: flag rate and peer z-score, findings, identified recovery, discrepancy mix, AI narrative. PK: hospital_id.'
TBLPROPERTIES ('quality' = 'gold', 'delta.enableChangeDataFeed' = 'true', 'lakebase.primary_key' = 'hospital_id')
AS
WITH base AS (
  SELECT
    rs.hospital_id,
    first(rs.hospital_name)                                   AS hospital_name,
    first(rs.region)                                          AS region,
    count(*)                                                  AS hospital_claims,
    count_if(rs.ml_flagged)                                   AS flagged_claims,
    avg(rs.length_of_stay_days)                               AS avg_length_of_stay,
    sum(rs.benefit_paid_aud)                                  AS benefit_paid_aud
  FROM ${gold_schema}.claim_risk_score rs
  GROUP BY rs.hospital_id
),
findings AS (
  SELECT
    hospital_id,
    count(DISTINCT CASE WHEN outcome = 'discrepancy' THEN claim_id END)            AS claims_with_discrepancy,
    count_if(outcome = 'discrepancy')                                              AS discrepancy_findings,
    count_if(outcome = 'needs_information')                                        AS information_gaps,
    sum(CASE WHEN outcome = 'discrepancy' THEN coalesce(recovery_aud, 0) ELSE 0 END) AS identified_recovery_aud
  FROM ${gold_schema}.claim_finding
  GROUP BY hospital_id
),
mix AS (
  SELECT hospital_id,
         array_join(transform(array_sort(collect_list(named_struct('neg', -n, 'txt', concat(discrepancy_type, ' x', n)))), x -> x.txt), ', ') AS discrepancy_mix
  FROM (SELECT hospital_id, discrepancy_type, count(*) AS n
        FROM ${gold_schema}.claim_finding WHERE outcome = 'discrepancy' GROUP BY 1, 2)
  GROUP BY hospital_id
),
triage AS (
  SELECT ce.hospital_id, count_if(t.recommendation = 'escalate') AS triage_escalations
  FROM ${gold_schema}.claim_triage t
  JOIN ${silver_schema}.claim_episode ce ON ce.claim_id = t.claim_id
  GROUP BY ce.hospital_id
),
scored AS (
  SELECT
    b.*,
    b.flagged_claims / b.hospital_claims                                        AS flag_rate,
    coalesce(f.claims_with_discrepancy, 0)                                      AS claims_with_discrepancy,
    coalesce(f.discrepancy_findings, 0)                                         AS discrepancy_findings,
    coalesce(f.information_gaps, 0)                                             AS information_gaps,
    CAST(coalesce(f.identified_recovery_aud, 0) AS DECIMAL(12, 2))              AS identified_recovery_aud,
    m.discrepancy_mix,
    coalesce(t.triage_escalations, 0)                                           AS triage_escalations
  FROM base b
  LEFT JOIN findings f ON f.hospital_id = b.hospital_id
  LEFT JOIN mix m      ON m.hospital_id = b.hospital_id
  LEFT JOIN triage t   ON t.hospital_id = b.hospital_id
),
peer AS (
  SELECT *,
    CASE WHEN hospital_claims >= 10 THEN
      round((flag_rate - avg(CASE WHEN hospital_claims >= 10 THEN flag_rate END) OVER ())
            / nullif(stddev(CASE WHEN hospital_claims >= 10 THEN flag_rate END) OVER (), 0), 2)
    END AS flag_rate_peer_z
  FROM scored
),
ranked AS (
  SELECT *,
    rank() OVER (ORDER BY identified_recovery_aud DESC, flag_rate DESC) AS recovery_rank,
    (identified_recovery_aud > 0 OR coalesce(flag_rate_peer_z, 0) >= 1.5 OR triage_escalations >= 3) AS needs_attention
  FROM peer
)
SELECT
  r.* EXCEPT (narrative_resp),
  CASE WHEN r.needs_attention THEN r.narrative_resp.result END AS risk_narrative,
  CASE WHEN r.needs_attention THEN '${narrative_endpoint}' END AS narrative_model
FROM (
  SELECT
    *,
    CASE WHEN needs_attention THEN ai_query(
      '${narrative_endpoint}',
      concat(
        'You are briefing the payment-integrity team lead at an Australian private health insurer. In at most 3 ',
        'sentences, explain why this hospital does or does not warrant integrity attention, citing the numbers. Be ',
        'factual and neutral (findings are not yet auditor-confirmed), write in the third person (never I or we), ',
        'end with the recommended next step; no headings, no bullet points.\n',
        'Hospital: ', hospital_name, ' (', region, ')\n',
        'Hospital claims: ', hospital_claims, ' | ML-flagged: ', flagged_claims, ' (', round(flag_rate * 100, 1), '%',
        CASE WHEN flag_rate_peer_z IS NOT NULL THEN concat(', peer z-score ', flag_rate_peer_z) ELSE '' END, ')\n',
        'AI triage escalations: ', triage_escalations, '\n',
        'Claims with document-confirmed discrepancies: ', claims_with_discrepancy,
        ' | discrepancy findings: ', discrepancy_findings, ' | information gaps: ', information_gaps, '\n',
        'Identified recovery (AUD): ', identified_recovery_aud, ' | benefit paid on hospital claims (AUD): ', round(benefit_paid_aud, 2), '\n',
        'Discrepancy mix: ', coalesce(discrepancy_mix, 'none')
      ),
      failOnError => false
    ) END AS narrative_resp
  FROM (SELECT /*+ REPARTITION(${ai_partitions}) */ * FROM ranked)
) r;
