-- Unity Catalog governance applied after the pipelines (idempotent; :catalog plus schema params).
-- ALTER ... SET TAGS does not accept IDENTIFIER(), so each statement is built and run with EXECUTE IMMEDIATE (double-quoted literals keep the inner quotes).
-- Classification tags use the workspace's governed tag policies (data_classification, pii, class.*).

-- Schema classification
EXECUTE IMMEDIATE "ALTER SCHEMA " || :catalog || "." || :raw_schema || " SET TAGS ('data_classification' = 'confidential')";
EXECUTE IMMEDIATE "ALTER SCHEMA " || :catalog || "." || :bronze_schema || " SET TAGS ('data_classification' = 'confidential')";
EXECUTE IMMEDIATE "ALTER SCHEMA " || :catalog || "." || :silver_schema || " SET TAGS ('data_classification' = 'confidential')";
EXECUTE IMMEDIATE "ALTER SCHEMA " || :catalog || "." || :gold_schema || " SET TAGS ('data_classification' = 'internal')";
EXECUTE IMMEDIATE "ALTER SCHEMA " || :catalog || "." || :eval_schema || " SET TAGS ('data_classification' = 'restricted')";

-- Tables holding member PII
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " SET TAGS ('data_classification' = 'pii')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :gold_schema || ".claim_detail" || " SET TAGS ('data_classification' = 'pii')";

-- Column-level PII classification (silver source)
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN first_name      SET TAGS ('pii' = 'true', 'class.name' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN last_name       SET TAGS ('pii' = 'true', 'class.name' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN date_of_birth   SET TAGS ('pii' = 'true', 'class.date_of_birth' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN medicare_number SET TAGS ('pii' = 'true', 'class.au_medicare' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN address_line_1  SET TAGS ('pii' = 'true', 'class.street_address' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN email           SET TAGS ('pii' = 'email', 'class.email_address' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :silver_schema || ".member" || " ALTER COLUMN mobile_phone    SET TAGS ('pii' = 'true', 'class.phone_number' = '')";

-- Column-level PII classification (gold, masked columns)
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :gold_schema || ".claim_detail" || " ALTER COLUMN member_full_name SET TAGS ('pii' = 'true', 'class.name' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :gold_schema || ".claim_detail" || " ALTER COLUMN member_dob       SET TAGS ('pii' = 'true', 'class.date_of_birth' = '')";
EXECUTE IMMEDIATE "ALTER TABLE " || :catalog || "." || :gold_schema || ".claim_detail" || " ALTER COLUMN medicare_number  SET TAGS ('pii' = 'true', 'class.au_medicare' = '')";
