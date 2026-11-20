-- Step 3a: structured facts from operative notes with ai_extract (v2.1: per-field citations with
-- bounding boxes + confidence). Facts drive the deterministic rule checks; citations drive evidence
-- highlighting. Runs once per document.
CREATE OR REFRESH STREAMING TABLE operative_note_facts (
  CONSTRAINT extracted_without_error EXPECT (extraction_error IS NULL),
  CONSTRAINT has_operation_date EXPECT (operation_date IS NOT NULL)
)
COMMENT 'ai_extract facts per operative note: operation, laterality, procedures (therapeutic vs diagnostic), assistant, implants. With citations.'
TBLPROPERTIES ('quality' = 'silver', 'delta.enableChangeDataFeed' = 'true')
AS SELECT
  volume_path,
  claim_number,
  x                                                                         AS extracted,
  x:error_message::STRING                                                   AS extraction_error,
  try_to_date(x:response:operation_date:value::STRING, 'yyyy-MM-dd')       AS operation_date,
  x:response:start_time:value::STRING                                       AS start_time,
  x:response:finish_time:value::STRING                                      AS finish_time,
  x:response:operation_title:value::STRING                                  AS operation_title,
  x:response:laterality:value::STRING                                       AS laterality,
  x:response:diagnostic_only_statement:value::BOOLEAN                       AS diagnostic_only_statement,
  x:response:assistant_surgeon_present:value::STRING                        AS assistant_surgeon_present,
  x:response:assistant_statement:value::STRING                              AS assistant_statement,
  x:response:no_implant_statement:value::BOOLEAN                            AS no_implant_statement,
  transform(CAST(x:response:procedures_performed AS ARRAY<VARIANT>), p -> named_struct(
    'description',  p:description:value::STRING,
    'code',         p:code:value::STRING,
    'laterality',   p:laterality:value::STRING,
    'intervention', p:intervention:value::STRING,
    'quantity',     p:quantity:value::INT))                                 AS procedures,
  transform(CAST(x:response:implants AS ARRAY<VARIANT>), d -> named_struct(
    'device_type',  d:device_type:value::STRING,
    'manufacturer', d:manufacturer:value::STRING,
    'brand_model',  d:brand_model:value::STRING,
    'size',         d:size:value::STRING,
    'quantity',     d:quantity:value::INT,
    'lens_type',    d:lens_type:value::STRING))                             AS implants,
  x:response:findings:value::STRING                                         AS findings,
  x:response:technique_summary:value::STRING                                AS technique_summary,
  x:metadata:citations                                                      AS citations,
  current_timestamp()                                                       AS extracted_at
FROM (
  SELECT
    volume_path,
    claim_number,
    ai_extract(
      parsed,
      '{
  "operation_date": {
    "type": "string",
    "description": "Date of operation as YYYY-MM-DD. Source dates are Australian DD/MM/YYYY."
  },
  "start_time": {
    "type": "string",
    "description": "Operation start time HH:MM (24h), if stated."
  },
  "finish_time": {
    "type": "string",
    "description": "Operation finish time HH:MM (24h), if stated."
  },
  "operation_title": {
    "type": "string",
    "description": "The operation performed as written (e.g. Operation performed: or Operation: line), verbatim."
  },
  "laterality": {
    "type": "enum",
    "labels": [
      "left",
      "right",
      "bilateral",
      "not_applicable",
      "not_stated"
    ],
    "description": "Side operated on, as documented for the main operation."
  },
  "procedures_performed": {
    "type": "array",
    "description": "Each distinct procedure actually performed, as described in the operation/technique sections.",
    "items": {
      "type": "object",
      "properties": {
        "description": {
          "type": "string",
          "description": "Procedure as described."
        },
        "code": {
          "type": "string",
          "description": "MBS/ACHI code if written next to it, else empty."
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
        "intervention": {
          "type": "enum",
          "labels": [
            "therapeutic",
            "diagnostic_only",
            "not_stated"
          ]
        },
        "quantity": {
          "type": "integer",
          "description": "Number of units/levels/lesions treated if stated, else 1."
        }
      }
    }
  },
  "diagnostic_only_statement": {
    "type": "boolean",
    "description": "True only if the note explicitly says the procedure was diagnostic only / no therapeutic intervention / no intervention performed."
  },
  "assistant_surgeon_present": {
    "type": "enum",
    "labels": [
      "yes",
      "no",
      "not_documented"
    ],
    "description": "yes if an assistant surgeon is named in the operating team (Assistant:/Assist:); no if the team is listed and explicitly has no assistant (Assistant: nil/none, or team listed without one); not_documented if the operating team is not recorded."
  },
  "assistant_statement": {
    "type": "string",
    "description": "The exact text about the assistant (e.g. Assistant: Dr L. Tran (Registrar)), empty if none."
  },
  "implants": {
    "type": "array",
    "description": "Every device, prosthesis, implant or lens recorded as implanted.",
    "items": {
      "type": "object",
      "properties": {
        "device_type": {
          "type": "string",
          "description": "Generic device type, e.g. drug-eluting coronary stent, knee tibial component, intraocular lens."
        },
        "manufacturer": {
          "type": "string"
        },
        "brand_model": {
          "type": "string"
        },
        "size": {
          "type": "string"
        },
        "quantity": {
          "type": "integer"
        },
        "lens_type": {
          "type": "enum",
          "labels": [
            "monofocal",
            "toric",
            "multifocal",
            "extended_depth_of_focus",
            "not_a_lens"
          ]
        }
      }
    }
  },
  "no_implant_statement": {
    "type": "boolean",
    "description": "True if the note explicitly states no implant/prosthesis/device was used."
  },
  "findings": {
    "type": "string",
    "description": "Operative findings section, verbatim or near-verbatim."
  },
  "technique_summary": {
    "type": "string",
    "description": "One or two sentences summarising the technique as documented."
  }
}',
      map('version', '2.1', 'enableCitations', 'true', 'enableConfidenceScores', 'true',
          'instructions', 'Australian private hospital operative note (operation record). Dates are DD/MM/YYYY. Extract only what is documented; never infer. A procedure is diagnostic_only when the note says no therapeutic intervention was performed.')
    ) AS x
  FROM (
    SELECT /*+ REPARTITION(${ai_partitions}) */ volume_path, claim_number, parsed
    FROM STREAM(document_parsed)
    WHERE document_type = 'operative_note' AND parse_error IS NULL
  )
);
