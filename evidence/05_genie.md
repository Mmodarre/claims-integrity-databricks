# Genie Agent: natural-language questions

_Collected 2026-11-20 07:02 UTC from the live workspace by `scripts/collect_evidence.py`._

Space `01f1e4ab2b7a1f3492e03099f81db7d7` over the four metric views plus risk-profile and forecast tables. Live answers below; the full benchmark is in genie/benchmark_results.json and genie/README.md.

## Q: What is the identified recovery by discrepancy type?

**Generated SQL:**

```sql
SELECT
  `discrepancy_type`,
  `discrepancy_title`,
  MEASURE(`discrepancy_findings`) AS `discrepancies`,
  MEASURE(`identified_recovery`) AS `identified_recovery_aud`,
  MEASURE(`confirmed_recovery`) AS `confirmed_recovery_aud`
FROM `mehdidatalake_catalog`.`integrity_gold`.`mv_recovery`
GROUP BY ALL
ORDER BY `identified_recovery_aud` DESC NULLS LAST
```

| discrepancy_type | discrepancy_title | discrepancies | identified_recovery_aud | confirmed_recovery_aud |
|---|---|---|---|---|
| drg_upcoding | AR-DRG up-split via an undocumented complication/comorbidity | 16 | 72382.59 | 0.00 |
| same_day_overnight | Same-day episode billed as overnight | 18 | 26885.88 | 0.00 |
| device_phantom | Prescribed-List device billed but not implanted | 8 | 24168.57 | 0.00 |
| procedure_phantom | Procedure/theatre line billed but not performed | 50 | 7974.25 | 198.82 |
| quantity_overstatement | Billed quantity exceeds documented quantity | 7 | 5344.00 | 0.00 |
| los_overbilling | Excess bed-days billed beyond documented discharge | 1 | 3929.88 | 0.00 |
| item_substitution | Higher-fee MBS item billed than the procedure performed | 10 | 2875.10 | 0.00 |
| age_eligibility | Age-restricted item billed for an out-of-range patient | 9 | 956.42 | 0.00 |
| bilateral_for_unilateral | Bilateral item billed for a unilateral procedure | 5 | 338.70 | 0.00 |
| assistant_phantom | Assistant-surgeon item billed with no assistant present | 10 | 259.80 | 0.00 |
| premium_iol_exploit | Premium IOL billed when a monofocal lens was implanted | 2 | 223.48 | 0.00 |
| device_substitution | Higher-tier / different device billed than implanted | 0 |  | 0.00 |

**Answer:** Across the **12 discrepancy types** shown, the highest AI-identified recovery is **AR-DRG up-split via an undocumented complication/comorbidity** at **AUD 72.4k**, followed by **Same-day episode billed as overnight** at **AUD 26.9k** and **Prescribed-List device billed but not implanted** at **AUD 24.2k**; these amounts are AI-identified and pending auditor confirmation.

Examples include:
- **AR-DRG up-split via an undocumented complication/comorbidity** — **AUD 72.4k** identified recovery
- **Same-day episode billed as overnight** — **AUD 26.9k** identified recovery
- **Prescribed-List device billed but not implanted** — **AUD 24.2k** identified recovery
- **Procedure/theatre line billed but not performed** — **AUD 8.0k** identified recovery
- **Billed quantity exceeds documented quantity** — **AUD 5.3k** identified recovery

Only **AUD 198.82** is confirmed so far across the rows shown, which is consistent with most findings still being pending auditor review.

## Q: Which 5 hospitals have the highest identified recovery and why?

**Generated SQL:**

```sql
WITH `ranked_hospitals` AS (
  SELECT
    `hospital_name`,
    `region`,
    `identified_recovery_aud`,
    `claims_with_discrepancy`,
    `discrepancy_mix`,
    `flag_rate`,
    `flag_rate_peer_z`,
    `risk_narrative`,
    RANK() OVER (ORDER BY `identified_recovery_aud` DESC) AS `recovery_rank_calc`
  FROM `mehdidatalake_catalog`.`integrity_gold`.`hospital_risk_profile`
  WHERE `identified_recovery_aud` IS NOT NULL
    AND `hospital_name` IS NOT NULL
)
SELECT
  `hospital_name`,
  `region`,
  `identified_recovery_aud`,
  `claims_with_discrepancy`,
  `discrepancy_mix`,
  `flag_rate`,
  `flag_rate_peer_z`,
  `risk_narrative`
FROM `ranked_hospitals`
WHERE `recovery_rank_calc` <= 5
ORDER BY `identified_recovery_aud` DESC, `hospital_name` ASC
```

| hospital_name | region | identified_recovery_aud | claims_with_discrepancy | discrepancy_mix | flag_rate | flag_rate_peer_z | risk_narrative |
|---|---|---|---|---|---|---|---|
| NSW Hospital 225 | NSW | 12091.04 | 1 | device_phantom x3 | 0.07317073170731707 | -0.5 | NSW Hospital 225 shows limited evidence for broad integrity attention, though one claim merits follow-up: of 41 claims, 3 (7.3%) were ML-fl… |
| NSW Hospital 235 | NSW | 11227.36 | 3 | drg_upcoding x2, procedure_phantom x2, assistant_phantom x1, item_substitution x1, same_day_overnight x1 | 0.19047619047619047 | 1.42 | NSW Hospital 235 warrants targeted, but not high-priority, integrity attention: document review confirmed discrepancies on 3 of 42 claims (… |
| SA Hospital 067 | SA | 10406.52 | 1 | device_phantom x4 | 0.047619047619047616 | -0.92 | SA Hospital 067 has a limited but specific basis for integrity attention: one of its 21 claims (4.8%) was ML-flagged, which is below the pe… |
| VIC Hospital 270 | VIC | 6432.92 | 1 | drg_upcoding x1, procedure_phantom x1, same_day_overnight x1 | 0.125 | 0.34 | VIC Hospital 270 warrants only limited integrity attention: 3 of its 24 claims (12.5%) were ML-flagged, but the peer z-score of 0.34 is clo… |
| NSW Hospital 230 | NSW | 5175.49 | 2 | age_eligibility x1, drg_upcoding x1 | 0.047619047619047616 | -0.92 | NSW Hospital 230 warrants limited, claim-level attention rather than a hospital-wide audit: 2 of 42 claims (4.8%) were ML-flagged, which is… |

**Answer:** For the hospitals returned by this ranking, the **top 5** by **AI-identified recovery pending auditor confirmation** are:
- **NSW Hospital 225** — **AUD 12.1k**; driven by **1 claim** with **device_phantom x3** findings, with follow-up focused on that claim and checking for similar device billing patterns.
- **NSW Hospital 235** — **AUD 11.2k**; driven by **3 claims** with a mix of **DRG upcoding, phantom procedures, assistant phantom, item substitution, and same-day/overnight** findings, with targeted auditor validation recommended.
- **SA Hospital 067** — **AUD 10.4k**; driven by **1 claim** with **device_phantom x4** findings, suggesting a specific device billing pattern to verify.
- **VIC Hospital 270** — **AUD 6.4k**; driven by **1 claim** with **DRG upcoding, phantom procedure, and same-day/overnight** findings, with claim-level review recommended.
- **NSW Hospital 230** — **AUD 5.2k**; driven by **2 claims** with **age eligibility** and **DRG upcoding** findings, with no broader hospital escalation suggested.
Across these 5 hospitals, the identified recovery ranges from **AUD 5.2k to AUD 12.1k**, and the narratives consistently point to **claim-level issues rather than broad hospital-wide risk**.

## Q: What share of flagged claims did the AI triage dismiss?

**Generated SQL:**

```sql
SELECT MEASURE(`ai_dismissal_rate`) AS `ai_dismissal_rate`, MEASURE(`flagged_claims`) AS `flagged_claims`, MEASURE(`dismissed_by_ai`) AS `dismissed_by_ai` FROM `mehdidatalake_catalog`.`integrity_gold`.`mv_integrity_funnel` GROUP BY ALL
```

| ai_dismissal_rate | flagged_claims | dismissed_by_ai |
|---|---|---|
| 0.09179926560587515 | 817 | 75 |

**Answer:** Across **817 flagged claims**, the AI triage dismissed **75 claims**, which is an **AI dismissal rate of 9.2%**. This means roughly **1 in 11 flagged claims** were dismissed by the AI triage.

## Q: What is the forecast benefit paid for hospital claims next quarter?

**Generated SQL:**

```sql
SELECT
  ROUND(SUM(`benefit_paid`), 2) AS `forecast_benefit_paid_aud`,
  ROUND(SUM(`benefit_paid_lower`), 2) AS `forecast_benefit_paid_low_aud`,
  ROUND(SUM(`benefit_paid_upper`), 2) AS `forecast_benefit_paid_high_aud`
FROM `mehdidatalake_catalog`.`integrity_gold`.`claims_forecast`
WHERE `series` = 'forecast'
  AND `claim_type` = 'Hospital'
  AND `week` >= DATE'2024-01-01'
  AND `week` < DATE'2024-04-01'
```

| forecast_benefit_paid_aud | forecast_benefit_paid_low_aud | forecast_benefit_paid_high_aud |
|---|---|---|
| 4572119.68 | 3315152.84 | 5971234.74 |

**Answer:** For **2024 Q1**, the forecast benefit paid for **hospital claims** is **AUD 4.6M**, with a forecast range from **AUD 3.3M** to **AUD 6.0M**. Based on the single forecast result returned for next quarter, the central estimate is **AUD 4,572,119.68**.

