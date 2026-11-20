-- Step 3b: structured facts from discharge summaries with ai_extract (v2.1 citations + confidence).
CREATE OR REFRESH STREAMING TABLE discharge_summary_facts (
  CONSTRAINT extracted_without_error EXPECT (extraction_error IS NULL),
  CONSTRAINT has_admission_date EXPECT (admission_date IS NOT NULL)
)
COMMENT 'ai_extract facts per discharge summary: admission/separation dates and times, same-day, age, diagnoses, procedures, investigations. With citations.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  volume_path,
  claim_number,
  x                                                                         AS extracted,
  x:error_message::STRING                                                   AS extraction_error,
  x:response:patient_age_years:value::INT                                   AS patient_age_years,
  x:response:age_category_stated:value::STRING                              AS age_category_stated,
  try_to_date(x:response:patient_dob:value::STRING, 'yyyy-MM-dd')          AS patient_dob,
  x:response:patient_sex:value::STRING                                      AS patient_sex,
  try_to_date(x:response:admission_date:value::STRING, 'yyyy-MM-dd')       AS admission_date,
  x:response:admission_time:value::STRING                                   AS admission_time,
  try_to_date(x:response:separation_date:value::STRING, 'yyyy-MM-dd')      AS separation_date,
  x:response:separation_time:value::STRING                                  AS separation_time,
  x:response:stated_length_of_stay_days:value::INT                          AS stated_length_of_stay_days,
  x:response:same_day_stated:value::STRING                                  AS same_day_stated,
  x:response:separation_mode:value::STRING                                  AS separation_mode,
  x:response:principal_diagnosis_code:value::STRING                         AS principal_diagnosis_code,
  x:response:principal_diagnosis:value::STRING                              AS principal_diagnosis,
  transform(CAST(x:response:secondary_diagnoses AS ARRAY<VARIANT>), d -> named_struct(
    'code', d:code:value::STRING, 'description', d:description:value::STRING)) AS secondary_diagnoses,
  transform(CAST(x:response:procedures AS ARRAY<VARIANT>), p -> named_struct(
    'code',        p:code:value::STRING,
    'description', p:description:value::STRING,
    'laterality',  p:laterality:value::STRING,
    'date',        try_to_date(p:date:value::STRING, 'yyyy-MM-dd')))        AS procedures,
  x:response:complications_and_investigations:value::STRING                 AS complications_and_investigations,
  x:response:clinical_summary:value::STRING                                 AS clinical_summary,
  x:metadata:citations                                                      AS citations,
  current_timestamp()                                                       AS extracted_at
FROM (
  SELECT
    volume_path,
    claim_number,
    ai_extract(
      parsed,
      '{
  "patient_age_years": {
    "type": "integer",
    "description": "Patient age in years ONLY if a number is explicitly written in the body (e.g. Age: 18, 34M, 84F, 16 yrs). Null when the body gives no number, e.g. it only says the patient is an adult or a child. Never infer an age from the procedure or diagnosis."
  },
  "age_category_stated": {
    "type": "enum",
    "labels": [
      "adult",
      "child",
      "not_stated"
    ],
    "description": "adult or child only if the body explicitly says so in words (e.g. Patient is an adult, paediatric patient); else not_stated."
  },
  "patient_dob": {
    "type": "string",
    "description": "Date of birth as YYYY-MM-DD if stated (source DD/MM/YYYY)."
  },
  "patient_sex": {
    "type": "enum",
    "labels": [
      "male",
      "female",
      "other",
      "not_stated"
    ]
  },
  "admission_date": {
    "type": "string",
    "description": "Admission date as YYYY-MM-DD (source DD/MM/YYYY)."
  },
  "admission_time": {
    "type": "string",
    "description": "Admission time HH:MM (24h) if stated."
  },
  "separation_date": {
    "type": "string",
    "description": "Discharge/separation date as YYYY-MM-DD (source DD/MM/YYYY)."
  },
  "separation_time": {
    "type": "string",
    "description": "Discharge/separation time HH:MM (24h) if stated."
  },
  "stated_length_of_stay_days": {
    "type": "integer",
    "description": "Length of stay in days/nights only if explicitly written (e.g. Length of Stay: 1 day). Null otherwise."
  },
  "same_day_stated": {
    "type": "enum",
    "labels": [
      "yes",
      "no",
      "not_stated"
    ],
    "description": "yes if the summary explicitly says same-day, day case or discharged the same day; no if it explicitly documents an overnight stay; else not_stated."
  },
  "separation_mode": {
    "type": "string",
    "description": "Separation/discharge mode as written (e.g. Day Case, Home, Transfer)."
  },
  "principal_diagnosis_code": {
    "type": "string",
    "description": "ICD-10-AM code of the principal diagnosis."
  },
  "principal_diagnosis": {
    "type": "string",
    "description": "Principal diagnosis description."
  },
  "secondary_diagnoses": {
    "type": "array",
    "description": "All secondary/additional diagnoses listed.",
    "items": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "description": {
          "type": "string"
        }
      }
    }
  },
  "procedures": {
    "type": "array",
    "description": "Procedures listed in the summary.",
    "items": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "laterality": {
          "type": "enum",
          "labels": [
            "left",
            "right",
            "bilateral",
            "not_applicable",
            "not_stated"
          ]
        },
        "date": {
          "type": "string",
          "description": "YYYY-MM-DD"
        }
      }
    }
  },
  "complications_and_investigations": {
    "type": "string",
    "description": "Any statements about complications, comorbidities, abnormal or normal investigation results, or specialist consults (e.g. renal function within normal limits, creatinine 141), verbatim."
  },
  "clinical_summary": {
    "type": "string",
    "description": "The clinical summary paragraph, verbatim."
  }
}',
      map('version', '2.1', 'enableCitations', 'true', 'enableConfidenceScores', 'true',
          'instructions', 'Australian private hospital discharge summary. Dates are DD/MM/YYYY. Extract only what is documented in the body of the summary; never infer. Header DOB and name may disagree with the body; prefer the body for age.')
    ) AS x
  FROM (
    SELECT /*+ REPARTITION(${ai_partitions}) */ volume_path, claim_number, parsed
    FROM STREAM(document_parsed)
    WHERE document_type = 'discharge_summary' AND parse_error IS NULL
  )
);
