-- Follow 0111. SQLite/D1 does NOT support ALTER TABLE ... ADD CONSTRAINT.
-- This migration targets the actual risk_observations.evidence_payload field;
-- raw_payload, raw_article_body and event_description do NOT exist as columns.
--
-- Historical mutable observations: strip known legacy top-level publisher
-- prose keys. Preserve observation IDs, risk scores, signed GRO references,
-- and all independently HMAC-verified unified_risk_snapshots unchanged.
-- Raw immutable Phase 2H records, SHA256 / B2 restoration archives are NOT
-- modified by this migration. They need a separately verified reader cutover.
UPDATE risk_observations
SET evidence_payload=json_remove(evidence_payload,
 '$.raw_payload','$.raw_article_body','$.article_body',
 '$.article_text','$.full_text','$.original_content',
 '$.original_title','$.event_description','$.headline','$.summary')
WHERE json_valid(evidence_payload)=1 AND (
 json_type(evidence_payload,'$.raw_payload') IS NOT NULL OR
 json_type(evidence_payload,'$.raw_article_body') IS NOT NULL OR
 json_type(evidence_payload,'$.article_body') IS NOT NULL OR
 json_type(evidence_payload,'$.article_text') IS NOT NULL OR
 json_type(evidence_payload,'$.full_text') IS NOT NULL OR
 json_type(evidence_payload,'$.original_content') IS NOT NULL OR
 json_type(evidence_payload,'$.original_title') IS NOT NULL OR
 json_type(evidence_payload,'$.event_description') IS NOT NULL OR
 json_type(evidence_payload,'$.headline') IS NOT NULL OR
 json_type(evidence_payload,'$.summary') IS NOT NULL
);
-- Future risk-observation payloads must be canonical structured facts only.
-- json_tree() finds nested prohibited source text, not just top-level fields.
CREATE TRIGGER IF NOT EXISTS trg_risk_observation_facts_only_insert
BEFORE INSERT ON risk_observations
WHEN json_valid(NEW.evidence_payload)=0 OR EXISTS (
 SELECT 1 FROM json_tree(NEW.evidence_payload) AS n WHERE
 lower(coalesce(n.key,'')) IN
 ('raw_payload','raw_article_body','article_body','article_text',
  'full_text','original_content','original_title','event_description',
  'headline','summary','description','source_title','source_headline') OR
 (n.type='text' AND length(n.value)>250)
)
BEGIN
 SELECT RAISE(ABORT,'RISK_OBSERVATION_FACTS_ONLY_REQUIRED');
END;
CREATE TRIGGER IF NOT EXISTS trg_risk_observation_facts_only_update
BEFORE UPDATE OF evidence_payload ON risk_observations
WHEN json_valid(NEW.evidence_payload)=0 OR EXISTS (
 SELECT 1 FROM json_tree(NEW.evidence_payload) AS n WHERE
 lower(coalesce(n.key,'')) IN
 ('raw_payload','raw_article_body','article_body','article_text',
  'full_text','original_content','original_title','event_description',
  'headline','summary','description','source_title','source_headline') OR
 (n.type='text' AND length(n.value)>250)
)
BEGIN
 SELECT RAISE(ABORT,'RISK_OBSERVATION_FACTS_ONLY_REQUIRED');
END;
