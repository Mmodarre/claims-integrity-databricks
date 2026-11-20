# Raw dataset (synthetic)

The journey starts from a fully **synthetic** Australian private-health-insurance dataset for a fictional insurer
("Brickwell Health"): 27 Parquet exports (claims, policies, members, providers, hospitals, MBS items, Prescribed-List
devices, planted integrity findings) plus **396 rendered clinical-document scans** (discharge summaries and operative
notes, JPG 3584x4800) for 200 hospital claims. Nothing in it is real customer data.

The files are landed in a Unity Catalog volume (`<catalog>.integrity_raw.landing/{exports,rendered_docs}`) and ingested
by the `claims_integrity_ingest` pipeline. They are **not committed** here: the scans are 3.3 GB, and the synthetic
hospital reference table was generated with real Australian facility names and contact details, which this build
pseudonymises at the silver layer (`src/ingest/silver/hospital.sql`). The schema, row counts and sample rows below are
read from the actual files (sensitive or identifying columns blanked).

Upload helper: `scripts/upload_landing.py` (size-checked, resumable upload of `exports/` and `rendered_docs/`).

## Manifest (`exports/_manifest.json`)

| table | rows | file | landed in |
|---|---|---|---|
| `claims.claim` | 50,220 | `claims__claim.parquet` | bronze |
| `claims.claim_line` | 124,386 | `claims__claim_line.parquet` | bronze |
| `claims.claim_assessment` | 50,220 | `claims__claim_assessment.parquet` | bronze |
| `claims.hospital_admission` | 7,910 | `claims__hospital_admission.parquet` | bronze |
| `claims.admission_diagnosis` | 4,282 | `claims__admission_diagnosis.parquet` | bronze |
| `claims.admission_procedure` | 1,851 | `claims__admission_procedure.parquet` | bronze |
| `claims.prosthesis_claim` | 952 | `claims__prosthesis_claim.parquet` | bronze |
| `claims.medical_service` | 36,664 | `claims__medical_service.parquet` | bronze |
| `claims.benefit_usage` | 32,224 | `claims__benefit_usage.parquet` | bronze |
| `integrity.episode_ground_truth` | 1,496 | `integrity__episode_ground_truth.parquet` | eval (ground truth) |
| `integrity.integrity_finding` | 820 | `integrity__integrity_finding.parquet` | eval (ground truth) |
| `integrity.evidence_span` | 471 | `integrity__evidence_span.parquet` | eval (ground truth) |
| `integrity.clinical_document` | 995 | `integrity__clinical_document.parquet` | eval (ground truth) |
| `integrity.clinical_document_pending` | 1,496 | `integrity__clinical_document_pending.parquet` | eval (ground truth) |
| `integrity.rendered_document` | 396 | `integrity__rendered_document.parquet` | bronze |
| `policy.member` | 12,773 | `policy__member.parquet` | bronze |
| `policy.policy` | 5,919 | `policy__policy.parquet` | bronze |
| `policy.policy_member` | 12,773 | `policy__policy_member.parquet` | bronze |
| `policy.coverage` | 12,367 | `policy__coverage.parquet` | bronze |
| `reference.admission_archetype` | 15 | `reference__admission_archetype.parquet` | bronze |
| `reference.integrity_discrepancy_type` | 13 | `reference__integrity_discrepancy_type.parquet` | bronze |
| `reference.mbs_item` | 584 | `reference__mbs_item.parquet` | bronze |
| `reference.prosthesis_list_item` | 436 | `reference__prosthesis_list_item.parquet` | bronze |
| `reference.product` | 46 | `reference__product.parquet` | bronze |
| `reference.hospital` | 295 | `reference__hospital.parquet` | bronze |
| `reference.provider` | 3,263 | `reference__provider.parquet` | bronze |
| `image_claim_map` | 396 | `image_claim_map.parquet` | eval (ground truth) |

Scans: `rendered_docs/<claim_number>/{discharge_summary,operative_note}.jpg` — 396 files, 200 claims (196 with both).

## Schemas and sample rows

### `claims.claim` (50,220 rows)

Columns: `claim_id` string, `claim_number` string, `policy_id` string, `member_id` string, `coverage_id` string, `claim_type` string, `claim_status` string, `service_date` date32[day], `lodgement_date` date32[day], `assessment_date` date32[day], `payment_date` date32[day], `provider_id` double, `hospital_id` double, `total_charge` decimal128(7, 2), `total_benefit` decimal128(7, 2), `total_gap` decimal128(7, 2), `excess_applied` decimal128(5, 2), `co_payment_applied` decimal128(2, 2), `rejection_reason_id` double, `rejection_notes` string, `claim_channel` string, `pay_to` string, `created_at` timestamp[us], `created_by` string, `modified_at` timestamp[us], `modified_by` string, `is_fraud` bool, `fraud_type` string, `fraud_original_charge` decimal128(7, 2), `fraud_inflation_amount` decimal128(7, 2), `fraud_inflation_ratio` decimal128(4, 3), `fraud_source_claim_id` string, `fraud_ring_id` string

| claim_id | claim_number | policy_id | member_id | coverage_id | claim_type | claim_status | service_date | lodgement_date | assessment_date | payment_date | provider_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 22fc9ae9-7c63-4a6d-96cd-9b1c7aeb18a3 | CLM-W0-2021-00000001 | de49d4ba-0cde-4757-8dae-c679ea1368d7 | e76c54e2-42b3-4de0-9861-6c242880cdb5 | 00000000-0000-0000-0000-000000000000 | Extras | Rejected | 2021-03-05 | 2021-03-05 | 2021-03-06 |  | 3562.0 |
| 8145723e-cbc3-4aec-853a-c7f9117d791e | CLM-W2-2021-00000044 | 0252d46c-16ff-4b12-babf-03357728a49a | 597a41b5-9454-4704-9797-d7d80621f2dc | 509fee5a-6e32-4727-8e7f-d4e1224ffa9c | Extras | Paid | 2021-05-14 | 2021-05-14 | 2021-05-15 | 2021-05-19 | 3730.0 |
| 31481333-ee35-4270-9721-3c35e434f304 | CLM-W3-2021-00000001 | 59ad942c-6b63-4c58-8dca-45c720bfc763 | 34ee0965-20d9-46a7-9997-1e45d5e5266a | 00000000-0000-0000-0000-000000000000 | Extras | Rejected | 2021-03-04 | 2021-03-04 | 2021-03-04 |  | 1580.0 |

### `claims.claim_line` (124,386 rows)

Columns: `claim_line_id` string, `claim_id` string, `line_number` int64, `item_code` string, `item_description` string, `clinical_category_id` double, `benefit_category_id` double, `service_date` date32[day], `quantity` int64, `charge_amount` decimal128(7, 2), `schedule_fee` decimal128(6, 2), `benefit_amount` decimal128(7, 2), `medicare_benefit` decimal128(6, 2), `gap_amount` decimal128(7, 2), `line_status` string, `rejection_reason_id` double, `provider_id` double, `provider_number` string, `tooth_number` string, `body_part` null, `created_at` timestamp[us], `created_by` string, `modified_at` timestamp[us], `modified_by` string

| claim_line_id | claim_id | line_number | item_code | item_description | clinical_category_id | benefit_category_id | service_date | quantity | charge_amount | schedule_fee | benefit_amount |
|---|---|---|---|---|---|---|---|---|---|---|---|
| db0150b8-f5fd-455d-a3b4-8628f3b830e2 | 22fc9ae9-7c63-4a6d-96cd-9b1c7aeb18a3 | 1 | 712 | Physiotherapy service (rejected) |  | 8.0 | 2021-03-05 | 1 | 50.00 |  | 0.00 |
| 89f2870e-81ec-46a0-b380-3e73bf2f8f10 | 31481333-ee35-4270-9721-3c35e434f304 | 1 | 375 | Optical service (rejected) |  | 7.0 | 2021-03-04 | 1 | 150.00 |  | 0.00 |
| 2488bf02-194a-4945-95f0-abf9c98e1804 | fd581571-f44d-4855-aef9-26f359421af4 | 1 | 662 | Physiotherapy service (rejected) |  | 8.0 | 2021-03-05 | 1 | 50.00 |  | 0.00 |

### `claims.claim_assessment` (50,220 rows)

Columns: `assessment_id` string, `claim_id` string, `assessment_type` string, `assessment_date` timestamp[us], `assessed_by` string, `original_benefit` decimal128(7, 2), `adjusted_benefit` decimal128(7, 2), `adjustment_reason` string, `waiting_period_check` bool, `benefit_limit_check` bool, `eligibility_check` bool, `outcome` string, `notes` string, `created_at` timestamp[us], `created_by` string

| assessment_id | claim_id | assessment_type | assessment_date | assessed_by | original_benefit | adjusted_benefit | adjustment_reason | waiting_period_check | benefit_limit_check | eligibility_check | outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8876863e-2c91-4cc6-9756-e5ecb189e1c6 | 22fc9ae9-7c63-4a6d-96cd-9b1c7aeb18a3 | Auto | 2021-03-06 00:00:00 | AUTO_RULES_ENGINE | 0.00 | 0.00 |  | True | True | False | Rejected |
| 4310dfd8-2f5d-4675-a294-fe3a17e77d31 | 31481333-ee35-4270-9721-3c35e434f304 | Auto | 2021-03-05 00:00:00 | AUTO_RULES_ENGINE | 0.00 | 0.00 |  | True | True | False | Rejected |
| d46e0889-eef3-474d-a7b0-7e4e6f280453 | fd581571-f44d-4855-aef9-26f359421af4 | Auto | 2021-03-06 00:00:00 | AUTO_RULES_ENGINE | 0.00 | 0.00 |  | True | True | False | Rejected |

### `claims.hospital_admission` (7,910 rows)

Columns: `admission_id` string, `claim_id` string, `hospital_id` int64, `admission_number` string, `admission_date` date32[day], `discharge_date` date32[day], `admission_type` string, `accommodation_type` string, `drg_code` string, `clinical_category_id` int64, `principal_diagnosis` string, `principal_procedure` string, `same_day_flag` bool, `care_type` string, `separation_mode` string, `hours_ventilation` null, `length_of_stay` int64, `theatre_minutes` double, `accommodation_charge` decimal128(7, 2), `theatre_charge` decimal128(7, 2), `prosthesis_charge` decimal128(7, 2), `other_charges` null, `accommodation_benefit` decimal128(7, 2), `theatre_benefit` decimal128(7, 2), `excess_applicable` bool, `excess_amount` decimal128(5, 2), `co_payment_amount` decimal128(2, 2), `contracted_hospital` bool, `informed_financial_consent` bool, `created_at` timestamp[us], `created_by` string, `modified_at` null, `modified_by` null

| admission_id | claim_id | hospital_id | admission_number | admission_date | discharge_date | admission_type | accommodation_type | drg_code | clinical_category_id | principal_diagnosis | principal_procedure |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2c918d16-9be5-4b26-af06-2b456d3704a1 | 7ed26a53-a51a-40a5-8501-94fa9f04ea96 | 299 | ADM551234 | 2021-03-27 | 2021-03-27 | Elective | DaySurgery | E11B | 5 | J35.01 | 41789-00 |
| 0cbe4f6d-879c-4a11-8dfe-fc1018fb4b81 | 5228f590-6398-447f-bbe6-8c33db270514 | 160 | ADM538977 | 2021-03-27 | 2021-03-27 | Elective | DaySurgery | E11B | 5 | J35.01 | 41789-00 |
| 427296de-9405-40ea-8789-d4b32d6fce55 | 0a0ae2e3-d6d3-46fd-9fed-91f9a6dcbbcf | 5 | ADM471861 | 2021-03-26 | 2021-03-27 | Elective | DaySurgery | I04Z | 21 |  |  |

### `claims.admission_diagnosis` (4,282 rows)

Columns: `admission_diagnosis_id` string, `admission_id` string, `sequence_no` int64, `icd10am_code` string, `description` string, `is_principal` bool, `condition_onset_flag` string, `ccl` int64, `created_at` timestamp[us], `created_by` string

| admission_diagnosis_id | admission_id | sequence_no | icd10am_code | description | is_principal | condition_onset_flag | ccl | created_at | created_by |
|---|---|---|---|---|---|---|---|---|---|
| 91c14a1e-d28f-4a90-a34c-e31277dabf3a | 2c918d16-9be5-4b26-af06-2b456d3704a1 | 1 | J35.01 | Chronic tonsillitis | True | 2 | 0 | 2026-06-24 14:23:35.982149 | SIMULATION |
| 238a9f27-1e7e-4e98-bac1-6cbb50b1855d | 2c918d16-9be5-4b26-af06-2b456d3704a1 | 2 | J35.3 | Hypertrophy of tonsils with hypertrophy  | False | 2 | 0 | 2026-06-24 14:23:35.982149 | SIMULATION |
| c7871649-f470-42c9-8d91-64b0c76bf280 | 2c918d16-9be5-4b26-af06-2b456d3704a1 | 3 | G47.33 | Obstructive sleep apnoea | False | 2 | 1 | 2026-06-24 14:23:35.982149 | SIMULATION |

### `claims.admission_procedure` (1,851 rows)

Columns: `admission_procedure_id` string, `admission_id` string, `sequence_no` int64, `achi_code` string, `description` string, `is_principal` bool, `created_at` timestamp[us], `created_by` string

| admission_procedure_id | admission_id | sequence_no | achi_code | description | is_principal | created_at | created_by |
|---|---|---|---|---|---|---|---|
| 968e5098-0497-41f2-a1dd-50f236f4b4f6 | 2c918d16-9be5-4b26-af06-2b456d3704a1 | 1 | 41789-00 | Tonsillectomy (tonsils +/- adenoids), pa | True | 2026-06-24 14:23:35.984845 | SIMULATION |
| c16330cd-ac5f-4612-97ca-d457a3b6a42f | 0cbe4f6d-879c-4a11-8dfe-fc1018fb4b81 | 1 | 41789-00 | Tonsillectomy (tonsils +/- adenoids), pa | True | 2026-06-24 14:23:35.984845 | SIMULATION |
| fec7db3b-931f-4aa8-ac7d-3f87489a2c7a | d6aa363b-3fed-43ac-84e7-d2be471daa4e | 1 | 32222-00 | Colonoscopy to caecum (diagnostic) | True | 2026-06-24 14:23:37.633656 | SIMULATION |

### `claims.prosthesis_claim` (952 rows)

Columns: `prosthesis_claim_id` string, `claim_id` string, `admission_id` string, `prosthesis_item_id` int64, `billing_code` string, `item_description` string, `quantity` int64, `charge_amount` decimal128(7, 2), `benefit_amount` decimal128(7, 2), `gap_amount` decimal128(2, 2), `implant_date` date32[day], `created_at` timestamp[us], `created_by` string

| prosthesis_claim_id | claim_id | admission_id | prosthesis_item_id | billing_code | item_description | quantity | charge_amount | benefit_amount | gap_amount | implant_date | created_at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 36fd66f1-187d-435e-83cf-1bdc2c7ef1a3 | 0a0ae2e3-d6d3-46fd-9fed-91f9a6dcbbcf | 427296de-9405-40ea-8789-d4b32d6fce55 | 166 | KP567890 | Polyethylene Tibial Insert CR Size 3 10m | 1 | 1425.52 | 1425.52 | 0.00 | 2021-03-26 | 2021-03-26 00:00:00 |
| ce45587b-d328-4ecd-b8c3-e2701afe481a | c50a1dac-4b63-4d9d-8c37-9c2b79b012aa | 076e99ba-e886-499d-a23c-ac30583ddcb2 | 70 | SR567890 | Comprehensive Reverse Shoulder Glenosphe | 1 | 4760.21 | 4760.21 | 0.00 | 2021-04-02 | 2021-04-02 00:00:00 |
| 79df2d9c-a5fe-4ca5-93ae-79a58ab78e2a | 4d467e2e-74f8-4fc7-9e28-91f9abc15e90 | 90ae406a-b810-49cd-b3de-768c9270140a | 68 | TK456791 | Persona Knee Femoral Component Size 6 | 1 | 3639.99 | 3639.99 | 0.00 | 2021-04-25 | 2021-04-25 00:00:00 |

### `claims.medical_service` (36,664 rows)

Columns: `medical_service_id` string, `claim_id` string, `admission_id` string, `mbs_item_number` string, `mbs_item_description` string, `mbs_schedule_fee` decimal128(6, 2), `provider_id` int64, `provider_type` string, `provider_number` string, `service_date` date32[day], `service_text` string, `charge_amount` decimal128(7, 2), `medicare_benefit` decimal128(6, 2), `fund_benefit` decimal128(6, 2), `gap_amount` decimal128(6, 2), `no_gap_indicator` bool, `gap_cover_scheme` string, `clinical_category_id` int64, `body_part` null, `procedure_laterality` string, `multiple_service_rule_applied` bool, `multiple_service_percentage` null, `created_at` timestamp[us], `created_by` string

| medical_service_id | claim_id | admission_id | mbs_item_number | mbs_item_description | mbs_schedule_fee | provider_id | provider_type | provider_number | service_date | service_text | charge_amount |
|---|---|---|---|---|---|---|---|---|---|---|---|
| be35b6db-7ded-42a5-8382-36ae2e31ca4a | 7ed26a53-a51a-40a5-8501-94fa9f04ea96 | 2c918d16-9be5-4b26-af06-2b456d3704a1 | 41789 | Tonsils +/- adenoids removal, patient un | 344.95 | 3866 | Surgeon | · | 2021-03-27 | Surgeon - Tonsils +/- adenoids removal,  | 344.95 |
| c1f489c1-3196-4146-aca6-4febdbee8f30 | 5228f590-6398-447f-bbe6-8c33db270514 | 0cbe4f6d-879c-4a11-8dfe-fc1018fb4b81 | 41789 | Tonsils +/- adenoids removal, patient un | 344.95 | 421 | Surgeon | · | 2021-03-27 | Surgeon - Tonsils +/- adenoids removal,  | 344.95 |
| 051cc254-33a2-4d4a-a1aa-5e5ef76d56b4 | 5228f590-6398-447f-bbe6-8c33db270514 | 0cbe4f6d-879c-4a11-8dfe-fc1018fb4b81 | 32633 | Intraoperative diagnostic procedure | 403.40 | 2567 | Surgeon | · | 2021-03-27 |  | 403.40 |

### `claims.benefit_usage` (32,224 rows)

Columns: `benefit_usage_id` string, `policy_id` string, `member_id` string, `claim_id` string, `benefit_category_id` int64, `benefit_year` string, `usage_date` date32[day], `usage_amount` decimal128(6, 2), `usage_count` int64, `annual_limit` decimal128(7, 2), `remaining_limit` decimal128(7, 2), `limit_type` string, `created_at` timestamp[us], `created_by` string

| benefit_usage_id | policy_id | member_id | claim_id | benefit_category_id | benefit_year | usage_date | usage_amount | usage_count | annual_limit | remaining_limit | limit_type |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ce8ae61c-4cf7-4f83-802c-3f75a607c0f5 | b9f75493-d1d0-4db8-ba2b-b5f6292154bf | 920906bb-15c3-4bc6-84f5-eea965cf0047 | 655d59c2-475a-42f8-a689-de3d70fb082d | 8 | 2020-2021 | 2021-03-18 | 39.32 | 1 | 800.00 | 760.68 | Dollar |
| edfeb268-3ed8-4666-b76e-15572f92293b | bff16b85-1c30-41ca-b2f4-83c2482a59c0 | dca4fb4f-7675-4975-be23-2448ceea760c | 1ba492ab-47e6-483e-b390-e5f3b1bac15b | 7 | 2020-2021 | 2021-03-26 | 198.24 | 1 | 400.00 | 201.76 | Dollar |
| 9c998668-2f7e-4f93-a6d0-0be8dbaad6b6 | 07733f2a-ea2d-4d2d-9d43-518b2873bc65 | f8b6f7f8-5b82-4472-b513-e46d848178d4 | c1326ef2-fb49-466f-ac98-8d176122c691 | 7 | 2020-2021 | 2021-03-23 | 288.33 | 1 | 350.00 | 61.67 | Dollar |

### `integrity.episode_ground_truth` (1,496 rows)

Columns: `episode_id` string, `claim_id` string, `admission_id` string, `episode_archetype` string, `episode_label` string, `planted` bool, `difficulty` double, `dataset_split` string, `matched_clean_episode_id` string, `created_at` timestamp[us], `created_by` string

| episode_id | claim_id | admission_id | episode_archetype | episode_label | planted | difficulty | dataset_split | matched_clean_episode_id | created_at | created_by |
|---|---|---|---|---|---|---|---|---|---|---|
| 49d39d14-5393-478e-9658-9f594572265e | 7ed26a53-a51a-40a5-8501-94fa9f04ea96 | 2c918d16-9be5-4b26-af06-2b456d3704a1 | TONSILLECTOMY | clean | False |  | demo |  | 2026-06-24 14:23:35.990602 | SIMULATION |
| 40195454-0f56-4786-b5cd-ade8788c5d7c | 5228f590-6398-447f-bbe6-8c33db270514 | 0cbe4f6d-879c-4a11-8dfe-fc1018fb4b81 | TONSILLECTOMY | hard_discrepancy | True | 2.0 | demo | 49d39d14-5393-478e-9658-9f594572265e | 2026-06-24 14:23:35.990602 | SIMULATION |
| c3314e9c-ef5a-474b-b5fd-c39a9a4dfd8b | cb8ec962-3e8f-41c0-8755-f6f0a7a4533c | d6aa363b-3fed-43ac-84e7-d2be471daa4e | COLONOSCOPY | clean | False |  | demo |  | 2026-06-24 14:23:37.639683 | SIMULATION |

### `integrity.integrity_finding` (820 rows)

Columns: `finding_id` string, `episode_id` string, `claim_id` string, `claim_line_id` string, `finding_type` string, `evidence_class` string, `billed_code` string, `billed_quantity` decimal128(3, 2), `billed_amount` decimal128(7, 2), `supported_code` string, `supported_quantity` decimal128(3, 2), `supported_amount` decimal128(6, 2), `recovery_amount` decimal128(7, 2), `audit_type` string, `difficulty` int64, `created_at` timestamp[us], `created_by` string

| finding_id | episode_id | claim_id | claim_line_id | finding_type | evidence_class | billed_code | billed_quantity | billed_amount | supported_code | supported_quantity | supported_amount |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4732fa3c-70fe-4a80-b281-a11d130d2f9e | 40195454-0f56-4786-b5cd-ade8788c5d7c | 5228f590-6398-447f-bbe6-8c33db270514 | 6e33ea11-28ec-41d8-93b1-fc91223a81c6 | procedure_phantom | documentary_contradiction | 32633 | 1.00 | 403.40 |  | 0.00 | 0.00 |
| 21600a7c-0ecf-44a8-963e-4cc04ea727f7 | 7cd2230a-a86b-4146-9f67-a1f492724b99 | 80311c51-cafb-42e6-8474-bb9d4b490312 | 62d08964-ba9b-44cc-b13b-ada527762749 | device_phantom | documentary_contradiction | PHX82041 | 1.00 | 1682.20 |  | 0.00 | 0.00 |
| 25b6f2bd-cbe5-4654-9481-ac1617e64cdf | 57e5d986-08c8-4cdf-a197-5d55d5d3143f | b5ac50a3-b13a-46c9-b3ec-7b07b96588c8 | cc2b928d-eb03-4fc1-9e0a-fb4479986b69 | device_substitution | documentation_gap_trap | PLSPI00 | 1.00 | 4943.58 | PLSPI00 | 1.00 | 3413.42 |

### `integrity.evidence_span` (471 rows)

Columns: `span_id` string, `finding_id` string, `document_id` string, `document_type` string, `start_char` double, `end_char` double, `text_excerpt` string, `span_role` string, `located` bool, `created_at` timestamp[us]

| span_id | finding_id | document_id | document_type | start_char | end_char | text_excerpt | span_role | located | created_at |
|---|---|---|---|---|---|---|---|---|---|
| 90b6e6a3-faf6-4a23-9d33-5038fe095961 | 4732fa3c-70fe-4a80-b281-a11d130d2f9e |  | operative_note |  |  | Diagnostic only; no therapeutic interven | contradicts_claim | False | 2026-06-24 14:23:36.001057 |
| cb6e4567-5da7-4b66-a25c-2ccc72b7bdf8 | 21600a7c-0ecf-44a8-963e-4cc04ea727f7 |  | operative_note |  |  | Implants/Prostheses: Nil. | absence_marker | False | 2026-06-24 14:23:40.806444 |
| 30dc72a6-4df2-42de-82e6-1989018b3fd7 | 98adf6aa-452d-43af-b00f-ee8d5802fc8e | 4be958ee-20a8-4205-acca-ad1d739f48a0 | operative_note | 1318.0 | 1413.0 | Procedure performed: PCI, 1 coronary ter | contradicts_claim | True | 2026-06-24 14:28:10.095039 |

### `integrity.clinical_document` (995 rows)

Columns: `document_id` string, `pending_id` string, `episode_id` string, `claim_id` string, `admission_id` string, `document_type` string, `document_text` string, `authored_date` date32[day], `author_name` null, `author_role` string, `generation_model` string, `created_at` timestamp[us]

| document_id | pending_id | episode_id | claim_id | admission_id | document_type | document_text | authored_date | author_name | author_role | generation_model | created_at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c2c46766-31f0-484a-90cd-ed530d7384d1 | d1dbf45c-06c9-449d-8f02-52b05eee67b7 | 04a2f78f-fc3b-4888-8caa-bf22725a15c9 | 821717fc-1079-4d3c-896e-fb3c65c61a42 | 5d42a80e-55ae-44b5-8fc3-1c4d1b32a931 | discharge_summary | · | 2021-05-05 |  | JMO | databricks-qwen3-next-80b-a3b-instruct | 2026-06-24 14:33:23.678775 |
| 323fe98a-7876-4b72-a8b4-f1e05e1adc9e | d1dbf45c-06c9-449d-8f02-52b05eee67b7 | 04a2f78f-fc3b-4888-8caa-bf22725a15c9 | 821717fc-1079-4d3c-896e-fb3c65c61a42 | 5d42a80e-55ae-44b5-8fc3-1c4d1b32a931 | operative_note | · | 2021-05-05 |  | Registrar | databricks-qwen3-next-80b-a3b-instruct | 2026-06-24 14:34:11.040748 |
| 1a71564e-ddc6-4670-9600-4a0b634cf9c9 | 0f29e391-aac9-49f6-b1ba-3642263a63cd | 19e51b94-9846-4837-a646-85f85057c573 | 27857c67-8148-4ed8-88a6-aeab9519821e | 06a5d2a3-bacf-4de4-9e04-8792c3c036aa | discharge_summary | · | 2021-05-25 |  | JMO | databricks-qwen3-next-80b-a3b-instruct | 2026-06-24 14:34:11.045001 |

### `integrity.clinical_document_pending` (1,496 rows)

Columns: `pending_id` string, `episode_id` string, `claim_id` string, `admission_id` string, `member_id` string, `policy_id` string, `episode_archetype` string, `document_types` list<element: string>, `llm_context` string, `processing_status` string, `processing_order` int64, `processed_at` timestamp[us], `error_message` null, `retry_count` int64, `created_at` timestamp[us]

| pending_id | episode_id | claim_id | admission_id | member_id | policy_id | episode_archetype | document_types | llm_context | processing_status | processing_order | processed_at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0049fd71-4663-4e1a-a23f-7e5fde3a61b0 | d20b0c10-6858-4572-a759-7f9b8cc694c5 | 7153c2e7-76f5-47e4-894c-c27165bbd475 | faf115d3-0531-4aa9-8f50-3faa16476f6d | f45d52a2-4e2b-4e80-989d-20e6723310b5 | 475edb9a-ed3d-4c4c-96e2-441feeac557d | HERNIA | ['discharge_summary', 'operative_note'] | · | deferred | 650 |  |
| 004db815-4a42-460c-891d-7d6c951f2edc | c4fb5030-54b2-4804-a789-99af4eafda12 | 35d0e30c-475f-47ee-a7ad-3a7ff40d3482 | e66e5bfe-c7c2-4819-89e9-c7cf84eb813f | ff9aa2b1-defa-4a6e-a2b9-8137d1eb30c7 | dfc152e0-e320-4eed-84bc-938ad37e5961 | CORONARY_ANGIO | ['discharge_summary', 'operative_note'] | · | deferred | 343 |  |
| 00a3412c-6600-415a-b1d2-6dca0288dda8 | 4bb0e8ab-3c8f-4700-8acb-330f67fbcf6e | f0b795f4-e94f-49c3-9d0f-02e0ae3f74c8 | b55daa7b-4e38-46aa-91e5-f06d697051ad | ebd78003-2ab2-4dd2-b835-8039e02e4e99 | d3488aae-8c1c-4986-b876-8c0da796f76c | HERNIA | ['discharge_summary', 'operative_note'] | · | deferred | 976 |  |

### `integrity.rendered_document` (396 rows)

Columns: `render_id` string, `document_id` string, `episode_id` string, `claim_id` string, `document_type` string, `provider` string, `model` string, `file_path` string, `image_format` string, `image_bytes` int64, `width` int64, `height` int64, `status` string, `error_message` null, `created_at` timestamp[us]

| render_id | document_id | episode_id | claim_id | document_type | provider | model | file_path | image_format | image_bytes | width | height |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fe34134c-b64d-4612-93f4-7bf036b23541 | 1fc87997-1ce6-4799-a43e-21bf35936ff1 | 78434f16-aca1-4f88-8fea-1006aea0cd3a | 68ce3ffe-cf9d-4485-8ab3-f50273f03bf0 | discharge_summary | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000082/ | jpg | 9072534 | 3584 | 4800 |
| 300a7f93-22ee-41c7-86cd-3a0a7fc8f38c | 47e909cb-9c3b-4e28-94e4-524792501fac | 78434f16-aca1-4f88-8fea-1006aea0cd3a | 68ce3ffe-cf9d-4485-8ab3-f50273f03bf0 | operative_note | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000082/ | jpg | 9085846 | 3584 | 4800 |
| 44cfea33-89f5-4332-a71d-429ce77f5e65 | 735e3cdd-a7cc-470f-8cf2-e099180af404 | 3aa7c42d-74f7-4fc8-b174-bfe2e3c79569 | 61d3d6b9-734b-44c3-97f2-a79b427379a4 | discharge_summary | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000214/ | jpg | 8476471 | 3584 | 4800 |

### `policy.member` (12,773 rows)

Columns: `member_id` string, `member_number` string, `title` string, `first_name` string, `middle_name` string, `last_name` string, `preferred_name` string, `date_of_birth` date32[day], `gender` string, `medicare_number` string, `medicare_irn` string, `medicare_expiry_date` date32[day], `address_line_1` string, `address_line_2` string, `suburb` string, `state` string, `postcode` string, `country` string, `email` string, `mobile_phone` string, `home_phone` string, `australian_resident` bool, `tax_file_number_provided` bool, `lhc_applicable` bool, `marital_status` string, `comm_preferences` string, `deceased_flag` bool, `deceased_date` date32[day], `created_at` timestamp[us], `created_by` string, `modified_at` timestamp[us], `modified_by` string

| member_id | member_number | title | first_name | middle_name | last_name | preferred_name | date_of_birth | gender | medicare_number | medicare_irn | medicare_expiry_date |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bbcce08a-0d12-46bc-b79a-eea6cce925b4 | · | · | · |  | · |  | · | Male | · | · | 2024-09-01 |
| a6238571-0aa1-4514-bd54-b7eabd074afe | · | · | · |  | · |  | · | Male | · | · | 2023-03-01 |
| 624b74d5-8e91-4102-bb54-6ad504fea29c | · | · | · |  | · |  | · | Male | · | · | 2025-08-01 |

### `policy.policy` (5,919 rows)

Columns: `policy_id` string, `policy_number` string, `application_id` string, `product_id` int64, `policy_status` string, `policy_type` string, `effective_date` date32[day], `end_date` date32[day], `cancellation_reason` string, `payment_frequency` string, `premium_amount` decimal128(6, 2), `excess_amount` decimal128(5, 2), `government_rebate_tier` string, `rebate_claimed_as` string, `distribution_channel` string, `state_of_residence` string, `original_join_date` date32[day], `previous_fund_code` null, `transfer_certificate_date` null, `created_at` timestamp[us], `created_by` string, `modified_at` timestamp[us], `modified_by` string, `ifrs17_cohort_id` string

| policy_id | policy_number | application_id | product_id | policy_status | policy_type | effective_date | end_date | cancellation_reason | payment_frequency | premium_amount | excess_amount |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 00000000-0000-0000-0000-000000000000 | SYSTEM-NO-COVERAGE |  | 0 | System | System | 1900-01-01 |  |  | None | 0.00 |  |
| acb5a28d-a10f-4fa5-b8f9-88eb58faef1d | POL-W0-2021-000122 | 5996a79e-0d08-4b80-a4cf-705462d48b3a | 38 | Cancelled | Single | 2021-04-05 | 2022-01-03 | Premium too expensive | Monthly | 238.50 | 250.00 |
| 335765f8-cdf9-488d-a1d5-d7780f474257 | POL-W1-2021-000002 | 9e695648-a6e9-44fd-b1a6-fa362c16f285 | 18 | Active | Couple | 2021-01-19 |  |  | Monthly | 271.20 | 500.00 |

### `policy.policy_member` (12,773 rows)

Columns: `policy_member_id` string, `policy_id` string, `member_id` string, `member_role` string, `relationship_to_primary` string, `effective_date` date32[day], `end_date` date32[day], `is_active` bool, `created_at` timestamp[us], `created_by` string

| policy_member_id | policy_id | member_id | member_role | relationship_to_primary | effective_date | end_date | is_active | created_at | created_by |
|---|---|---|---|---|---|---|---|---|---|
| 0ceaa19f-fe5b-4598-aad0-6ab5dadefc0d | 40d3db96-214e-4c6f-9c04-72a51cdd7e1e | f6cf65b2-cb0d-415f-aae9-ff29dd63547a | Primary | Self | 2022-01-11 |  | True | 2021-12-28 11:57:43.796350 | SIMULATION |
| 6a5cdb24-30d7-4f67-a937-870512c4cc5e | 335765f8-cdf9-488d-a1d5-d7780f474257 | 35b29c34-d6a5-4047-b0e6-029c64e87d63 | Primary | Self | 2021-01-19 |  | True | 2021-01-05 17:20:43.544487 | SIMULATION |
| 42ee261d-8ea2-4820-a9f8-31573a0834d3 | 335765f8-cdf9-488d-a1d5-d7780f474257 | b2b5d77c-c144-492f-a445-f53727e9fdcc | Partner | Spouse | 2021-01-19 |  | True | 2021-01-05 17:20:43.544487 | SIMULATION |

### `policy.coverage` (12,367 rows)

Columns: `coverage_id` string, `policy_id` string, `coverage_type` string, `product_id` int64, `effective_date` date32[day], `end_date` date32[day], `status` string, `tier` string, `excess_amount` decimal128(5, 2), `created_at` timestamp[us], `created_by` string, `modified_at` timestamp[us], `modified_by` string

| coverage_id | policy_id | coverage_type | product_id | effective_date | end_date | status | tier | excess_amount | created_at | created_by | modified_at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 00000000-0000-0000-0000-000000000000 | 00000000-0000-0000-0000-000000000000 | None | 0 | 1900-01-01 |  | Placeholder |  |  | 2026-06-24 14:23:18.146891 | SYSTEM |  |
| 494769f1-efbe-4e31-8523-25dda8da8672 | e468ff44-3a04-42f3-87ae-2b1641908580 | Hospital | 38 | 2021-08-17 | 2021-12-31 | Terminated | Silver | 750.00 | 2021-08-03 03:09:44.747638 | SIMULATION | 2021-12-31 00:00:00 |
| c9eaa7cb-757e-4165-a4b4-33f49bf4925a | 335765f8-cdf9-488d-a1d5-d7780f474257 | Hospital | 18 | 2021-01-19 |  | Active | Bronze | 500.00 | 2021-01-05 17:20:43.544487 | SIMULATION |  |

### `reference.admission_archetype` (15 rows)

Columns: `archetype_id` string, `name` string, `scenario` string, `principal_diagnosis_code` string, `principal_procedure_code` string, `drg_base` string, `drg_cc` string, `drg_in_repo_catalog` bool, `same_day` bool, `theatre_band` string, `typical_los_min` int64, `typical_los_max` int64, `detail` string, `created_date` timestamp[us]

| archetype_id | name | scenario | principal_diagnosis_code | principal_procedure_code | drg_base | drg_cc | drg_in_repo_catalog | same_day | theatre_band | typical_los_min | typical_los_max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TKR | Total knee replacement (unilateral) | · | M17.11 | 49518-00 | I04B | I04A | True | False | T4 | 3 | 5 |
| THR | Total hip replacement (unilateral, cemen | · | M16.11 | 49318-00 | I03B | I03A | True | False | T4 | 3 | 5 |
| KNEE_ARTHRO | Knee arthroscopy + partial meniscectomy  | · | S83.21 | 49580-00 | I08B | I08A | False | True | T2 | 0 | 0 |

### `reference.integrity_discrepancy_type` (13 rows)

Columns: `type` string, `title` string, `evidence_class` string, `primary_document` string, `intended_span_role` string, `audit_type` string, `difficulty` int64, `recovery` string, `detail` string, `created_date` timestamp[us]

| type | title | evidence_class | primary_document | intended_span_role | audit_type | difficulty | recovery | detail | created_date |
|---|---|---|---|---|---|---|---|---|---|
| same_day_overnight | · | documentary_contradiction | discharge_summary | contradicts_claim | postpayment | 1 | one overnight ACCOM per-diem (~$1,200-$1 | · | 2020-12-31 00:00:00 |
| los_overbilling | · | documentary_contradiction | discharge_summary | contradicts_claim | postpayment | 2 | extra nights * ACCOM per-diem | · | 2020-12-31 00:00:00 |
| device_phantom | · | documentary_contradiction | operative_note | absence_marker | postpayment | 2 | full PL benefit of the phantom device | · | 2020-12-31 00:00:00 |

### `reference.mbs_item` (584 rows)

Columns: `mbs_item_id` int64, `item_number` string, `item_description` string, `category_id` int64, `schedule_fee` decimal128(6, 2), `benefit_75` decimal128(6, 2), `benefit_85` decimal128(6, 2), `is_anaes_applicable` bool, `is_assist_applicable` bool, `multiple_procedure_rule` string, `is_derived_fee` bool, `derived_fee_rule` string, `effective_date` date32[day], `end_date` null, `is_active` bool, `created_date` timestamp[us], `created_by` string

| mbs_item_id | item_number | item_description | category_id | schedule_fee | benefit_75 | benefit_85 | is_anaes_applicable | is_assist_applicable | multiple_procedure_rule | is_derived_fee | derived_fee_rule |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 105 | Professional attendance by a specialist  | 1 | 89.30 | 66.98 | 75.91 | False | False |  | False |  |
| 2 | 110 | Professional attendance by a specialist  | 1 | 44.65 | 33.49 | 37.95 | False | False |  | False |  |
| 3 | 104 | Professional attendance by a consultant  | 1 | 153.90 | 115.43 | 130.82 | False | False |  | False |  |

### `reference.prosthesis_list_item` (436 rows)

Columns: `prosthesis_item_id` int64, `prosthesis_category_id` int64, `billing_code` string, `item_name` string, `manufacturer` string, `brand_name` string, `minimum_benefit` decimal128(7, 2), `maximum_benefit` decimal128(7, 2), `no_gap_benefit` decimal128(7, 2), `effective_date` date32[day], `end_date` date32[day], `is_current` bool, `requires_clinical_justification` bool, `created_date` timestamp[us], `created_by` string

| prosthesis_item_id | prosthesis_category_id | billing_code | item_name | manufacturer | brand_name | minimum_benefit | maximum_benefit | no_gap_benefit | effective_date | end_date | is_current |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | AA001234 | · | · | · | 8500.00 | 9200.00 | 9000.00 | 2023-01-01 |  | True |
| 2 | 1 | AA001235 | · | · | · | 6200.00 | 6800.00 | 6500.00 | 2023-01-01 |  | True |
| 3 | 1 | AA001236 | · | · | · | 9100.00 | 9800.00 | 9500.00 | 2023-03-01 |  | True |

### `reference.product` (46 rows)

Columns: `product_id` int64, `product_code` string, `product_name` string, `product_type_id` int64, `product_tier_id` double, `description` string, `is_hospital` bool, `is_extras` bool, `is_ambulance` bool, `default_excess` decimal128(5, 2), `status` string, `effective_date` date32[day], `end_date` date32[day], `min_age` double, `max_age` double, `available_policy_types` string, `is_community_rated` bool, `government_rebate_eligible` bool, `created_date` timestamp[us], `created_by` string, `modified_date` timestamp[us], `modified_by` string

| product_id | product_code | product_name | product_type_id | product_tier_id | description | is_hospital | is_extras | is_ambulance | default_excess | status | effective_date |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | SYSTEM-PLACEHOLDER | System Placeholder Product | 0 |  |  | False | False | False |  | System |  |
| 1 | GOLD-HOSP-0 | Gold Hospital No Excess | 1 | 1.0 | Comprehensive Gold hospital cover with n | True | False | True | 0.00 | Active | 2019-04-01 |
| 2 | GOLD-HOSP-250 | Gold Hospital $250 Excess | 1 | 1.0 | Comprehensive Gold hospital cover with $ | True | False | True | 250.00 | Active | 2019-04-01 |

### `reference.hospital` (295 rows)

Columns: `hospital_id` int64, `hospital_code` string, `hospital_name` string, `hospital_type_id` int64, `abn` string, `address_line_1` string, `address_line_2` string, `suburb` string, `state` string, `postcode` string, `phone` string, `fax` string, `email` string, `latitude` decimal128(10, 8), `longitude` decimal128(11, 8), `total_beds` int64, `emergency_department` bool, `icu_available` bool, `maternity_available` bool, `is_contracted` bool, `status` string, `created_date` timestamp[us], `created_by` string, `modified_date` null, `modified_by` null

| hospital_id | hospital_code | hospital_name | hospital_type_id | abn | address_line_1 | address_line_2 | suburb | state | postcode | phone | fax |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | · | · | 1 | · | · |  | · | WA | · | · | · |
| 2 | · | · | 1 | · | · |  | · | QLD | · | · | · |
| 3 | · | · | 1 | · | · |  | · | NSW | · | · | · |

### `reference.provider` (3,263 rows)

Columns: `provider_id` int64, `provider_number` string, `provider_type_id` int64, `provider_category` string, `title` string, `first_name` string, `last_name` string, `practice_name` string, `abn` string, `ahpra_number` string, `specialty_id` double, `email` string, `phone` string, `fax` string, `preferred_provider` bool, `network_id` double, `status` string, `registration_date` date32[day], `created_date` timestamp[us], `created_by` string, `modified_date` timestamp[us], `modified_by` string

| provider_id | provider_number | provider_type_id | provider_category | title | first_name | last_name | practice_name | abn | ahpra_number | specialty_id | email |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | · | 4 | Individual | · | · | · | · | · | · | 51.0 | · |
| 2 | · | 4 | Individual | · | · | · | · | · | · | 51.0 | · |
| 3 | · | 2 | Individual | · | · | · | · | · | · | 1.0 | · |

### `image_claim_map` (396 rows)

Columns: `render_id` string, `document_id` string, `document_type` string, `provider` string, `model` string, `file_path` string, `image_format` string, `image_bytes` int64, `width` int64, `height` int64, `render_status` string, `pending_id` string, `episode_id` string, `claim_id` string, `claim_number` string, `member_id` string, `policy_id` string, `admission_id` string, `drg_code` string, `principal_diagnosis` string, `principal_procedure` string, `same_day_flag` bool, `length_of_stay` int64, `episode_label` string, `episode_archetype` string, `difficulty` double, `authored_date` date32[day], `author_name` null, `author_role` string, `generation_model` string

| render_id | document_id | document_type | provider | model | file_path | image_format | image_bytes | width | height | render_status | pending_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fe34134c-b64d-4612-93f4-7bf036b23541 | 1fc87997-1ce6-4799-a43e-21bf35936ff1 | discharge_summary | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000082/ | jpg | 9072534 | 3584 | 4800 | rendered | 3b70eaf0-47da-4b43-80b7-167fe788df7a |
| 300a7f93-22ee-41c7-86cd-3a0a7fc8f38c | 47e909cb-9c3b-4e28-94e4-524792501fac | operative_note | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000082/ | jpg | 9085846 | 3584 | 4800 | rendered | 3b70eaf0-47da-4b43-80b7-167fe788df7a |
| 44cfea33-89f5-4332-a71d-429ce77f5e65 | 735e3cdd-a7cc-470f-8cf2-e099180af404 | discharge_summary | gemini_aistudio | gemini-3-pro-image-preview | data/rendered_docs/CLM-W0-2021-00000214/ | jpg | 8476471 | 3584 | 4800 | rendered | a694bd49-e864-465c-a323-d4e748b253e0 |
