"""Bronze: one Auto Loader streaming table per landed Parquet export.

Each export file in <raw_volume_path>/exports/ becomes a streaming table named after the file stem
(e.g. claims__claim.parquet -> integrity_bronze.claims__claim). Rows are kept exactly as delivered,
plus lineage columns. Ground-truth exports (integrity.* labels, the image->claim map that carries
episode labels) are written to the restricted eval schema instead of bronze, so no downstream
silver/gold dataset can read labels by accident.
"""

from pyspark import pipelines as dp
from pyspark.sql import functions as F
from pyspark.sql.types import NullType, TimestampNTZType

BRONZE = spark.conf.get("bronze_schema")
EVAL = spark.conf.get("eval_schema")
EXPORTS = spark.conf.get("raw_volume_path").rstrip("/") + "/exports"

# file stem -> (target schema, description). Mirrors exports/_manifest.json.
EXPORT_TABLES = {
    # claims
    "claims__claim": (BRONZE, "Claim headers (includes simulator fraud labels; silver strips them)"),
    "claims__claim_line": (BRONZE, "Claim line items (MBS items, accommodation, theatre, prostheses)"),
    "claims__claim_assessment": (BRONZE, "Claim assessment outcomes"),
    "claims__hospital_admission": (BRONZE, "Hospital admission episodes"),
    "claims__admission_diagnosis": (BRONZE, "ICD-10-AM diagnoses coded on admissions"),
    "claims__admission_procedure": (BRONZE, "ACHI procedures coded on admissions"),
    "claims__prosthesis_claim": (BRONZE, "Prescribed List prosthesis claims"),
    "claims__medical_service": (BRONZE, "In-hospital medical services (MBS items)"),
    "claims__benefit_usage": (BRONZE, "Benefit usage against annual limits"),
    # policy
    "policy__member": (BRONZE, "Members (PII)"),
    "policy__policy": (BRONZE, "Policies"),
    "policy__policy_member": (BRONZE, "Policy membership"),
    "policy__coverage": (BRONZE, "Policy coverage"),
    # reference
    "reference__product": (BRONZE, "Insurance products"),
    "reference__hospital": (BRONZE, "Hospitals"),
    "reference__provider": (BRONZE, "Providers"),
    "reference__mbs_item": (BRONZE, "MBS item schedule"),
    "reference__prosthesis_list_item": (BRONZE, "Prescribed List of medical devices"),
    "reference__admission_archetype": (BRONZE, "Admission archetypes (procedure, DRG base/CC split, CC drivers)"),
    "reference__integrity_discrepancy_type": (BRONZE, "Integrity discrepancy taxonomy (13 types)"),
    # document registry (render metadata, no labels)
    "integrity__rendered_document": (BRONZE, "Registry of rendered clinical document scans"),
    # ground truth -> eval only
    "integrity__episode_ground_truth": (EVAL, "GROUND TRUTH: episode labels"),
    "integrity__integrity_finding": (EVAL, "GROUND TRUTH: planted integrity findings + recovery"),
    "integrity__evidence_span": (EVAL, "GROUND TRUTH: evidence spans for findings"),
    "integrity__clinical_document": (EVAL, "GROUND TRUTH: source text the scans were rendered from"),
    "integrity__clinical_document_pending": (EVAL, "GROUND TRUTH: document generation queue with label context"),
    "image_claim_map": (EVAL, "GROUND TRUTH: image -> claim map with episode labels"),
}


def _define_bronze(stem: str, schema: str, description: str) -> None:
    @dp.table(
        name=f"{schema}.{stem}",
        comment=f"Bronze (raw, as delivered): {description}. Source: exports/{stem}.parquet",
        table_properties={"quality": "bronze" if schema == BRONZE else "eval", "project": "claims_integrity"},
    )
    def _bronze():
        df = (
            spark.readStream.format("cloudFiles")
            .option("cloudFiles.format", "parquet")
            .option("pathGlobFilter", f"{stem}.parquet")
            .load(EXPORTS)
        )
        for field in df.schema.fields:
            # Arrow null-typed (all-null) columns arrive as VOID, which Delta cannot store.
            if isinstance(field.dataType, NullType):
                df = df.withColumn(field.name, F.col(field.name).cast("string"))
            # Exporter wrote tz-naive timestamps (TIMESTAMP_NTZ); normalise to TIMESTAMP so no table
            # needs the timestampNtz Delta feature and downstream consumers (Lakebase, BI) agree.
            elif isinstance(field.dataType, TimestampNTZType):
                df = df.withColumn(field.name, F.col(field.name).cast("timestamp"))
        return df.withColumn("_source_file", F.col("_metadata.file_path")).withColumn(
            "_ingested_at", F.current_timestamp()
        )


for _stem, (_schema, _desc) in EXPORT_TABLES.items():
    _define_bronze(_stem, _schema, _desc)
