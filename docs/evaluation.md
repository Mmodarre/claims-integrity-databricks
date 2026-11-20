# AI accuracy against ground truth

Numbers below are from the final end-to-end run under the published names. Source tables (restricted schema `integrity_eval`): `ai_eval_finding_match`, `ai_eval_summary`,
`ai_eval_triage`. Ground truth = the planted integrity findings and episode labels shipped with the
dataset; it is used only for evaluation (and inside the mock fraud model), never by an app-facing table.

## Claim-level document review (200 claims with scanned documents)

| Ground-truth episode | Discrepancy confirmed | Needs more information | Documents support claim |
|---|---|---|---|
| hard_discrepancy (80) | **71 (89%)** | 6 | 3 |
| ambiguous (60) | 36 | 16 | 8 |
| clean (60) | 4 (7%) | 8 | **48 (80%)** |

Identified recovery on true-positive findings: **AUD 105.6k vs 105.0k ground truth (within 0.5%)**. 126 of 136
discrepancy findings (93%) carry a bounding box locating the evidence on the original scan.

## Finding-level (line-level matching, label families)

A ground-truth finding is matched to an AI finding on the same billed line (or the same claim + type for
DRG upcoding). `procedure_phantom` and `item_substitution` are treated as one family because the planted
"item substitutions" are extra procedure lines with full-benefit recovery — exactly what a phantom
finding recovers.

| Type | TP | FP | FN | Precision | Recall | Gap traps routed to "needs info" | Method |
|---|---|---|---|---|---|---|---|
| same_day_overnight | 18 | 0 | 0 | 1.00 | 1.00 | 13 / 14 | rule |
| bilateral_for_unilateral | 5 | 0 | 0 | 1.00 | 1.00 | 5 / 5 | rule |
| los_overbilling | 1 | 0 | 0 | 1.00 | 1.00 | 0 / 2 | rule |
| assistant_phantom | 8 | 2 | 0 | 0.80 | 1.00 | 3 / 5 | rule |
| age_eligibility | 4 | 5 | 0 | 0.44 | 1.00 | – | rule |
| drg_upcoding | 14 | 2 | 6 | 0.88 | 0.70 | 8 / 10 | LLM |
| procedure_phantom | 14 | 6 | 0 | 0.70 | 1.00 | 1 / 9 | LLM |
| item_substitution | 17 | 23 | 3 | 0.43 | 0.85 | 1 / 18 | LLM |
| quantity_overstatement | 2 | 5 | 0 | 0.29 | 1.00 | 0 / 5 | LLM |
| device_phantom | 2 | 6 | 0 | 0.25 | 1.00 | 0 / 1 | rule + LLM |
| device_substitution | 0 | 0 | 4 | – | 0.00 | 2 / 5 | LLM |
| premium_iol_exploit | 0 | 2 | 0 | – | – | 1 / 1 | LLM |
| **overall** | **85** | **51** | **13** | **0.63** | **0.87** | **34 / 75** | |

## Triage (claim data only, 817 flagged claims)

- Planted episodes kept for audit (investigate/escalate): **92%**; recommendation accuracy 79%.
- Discrepancy type named correctly for planted episodes: 50% (claim data alone cannot reveal many
  document-only discrepancies; the document review then names the type).
- The model's non-planted "false positives" come from the base simulator and are often clinically
  incoherent (e.g. breast reconstruction billed for a 4-year-old), so the AI escalating them is defensible;
  ground truth treats them as clean, which understates triage accuracy.

## How we got here (tuning log)

| Round | Change | Precision / Recall |
|---|---|---|
| 1 | First end-to-end run | 0.50 / 0.67 |
| 2 | Rule fixes (bilateral fee loading excludes anaesthesia, exact 1.5x; DRG review on CC split); per-line LLM decisions; triage dismisses only when claim data explains the flag | 0.47 / 0.66 (type-strict eval) |
| 3 | Line-level evaluation; time-aware same-day rule; LLM prompt embeds the governed taxonomy playbook | 0.60 / 0.87 |
| 4 | DRG contradiction requires an explicit in-range statement (playbook); generic op-note wording -> needs info; age evidence conflicts -> needs info; typical stay and device benefit ranges in claim context | 0.63 / 0.84 |
| final | Clean re-run of the whole chain under the published names (all AI calls re-executed) | **0.63 / 0.87** |

## Known limitations

- **Device substitution (0/4):** the planted cases document the same device type as billed (e.g. a
  drug-eluting stent) and differ only in benefit; claims carry generic category codes and the Prescribed
  List prices are inconsistent with billed amounts, so documents cannot reveal them.
- **Age eligibility "false positives":** several unplanted claims bill an under-12 item for a patient the
  record shows as 16, or a ">= 10 years" item for a 9-year-old. These are real contradictions in the
  data that the generator did not label.
- **Gap traps for item/quantity/phantom:** the AI still calls many planted documentation gaps
  contradictions; most are judgment calls where the operative note genuinely does not describe the
  billed line.
- **DRG upcoding:** the planted "hard" cases rely partly on a pathology report that was not rendered as a
  scan; the AI can only use the discharge summary.
- Recovery for device/lens substitution is an estimate against the device category benefit floor
  (`recovery_basis = estimated_device_floor`).
