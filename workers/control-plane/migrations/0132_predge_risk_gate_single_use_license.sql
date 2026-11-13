-- Single-use Predge verdict license binding. Additive migration; 0131 is immutable.
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN licensee_id TEXT NOT NULL DEFAULT 'predge' CHECK(licensee_id='predge');
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN max_commercial_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_commercial_uses=1);
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN consumption_count INTEGER NOT NULL DEFAULT 1 CHECK(consumption_count=1);
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN resale_permitted INTEGER NOT NULL DEFAULT 0 CHECK(resale_permitted=0);
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN transferable INTEGER NOT NULL DEFAULT 0 CHECK(transferable=0);
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN subject_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN action_context_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN market_id TEXT NOT NULL DEFAULT '';
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN condition_id TEXT NOT NULL DEFAULT '';
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN downstream_caller TEXT NOT NULL DEFAULT 'predge' CHECK(downstream_caller='predge');
ALTER TABLE predge_paid_risk_gate_usage_ledger
  ADD COLUMN license_payload_sha256 TEXT NOT NULL DEFAULT '' CHECK(length(license_payload_sha256) IN (0,64));

CREATE TABLE IF NOT EXISTS predge_risk_gate_verdict_license (
  verdict_id TEXT PRIMARY KEY CHECK(
    length(verdict_id)=36 AND substr(verdict_id,9,1)='-' AND
    substr(verdict_id,14,1)='-' AND substr(verdict_id,19,1)='-' AND
    substr(verdict_id,24,1)='-'
  ),
  request_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL CHECK(client_id IN ('predge-risk-gate-v1','predge-paid-risk-gate-addendum-v2')),
  licensee_id TEXT NOT NULL CHECK(licensee_id='predge'),
  max_commercial_uses INTEGER NOT NULL CHECK(max_commercial_uses=1),
  consumption_count INTEGER NOT NULL CHECK(consumption_count=1),
  resale_permitted INTEGER NOT NULL CHECK(resale_permitted=0),
  transferable INTEGER NOT NULL CHECK(transferable=0),
  subject_json TEXT NOT NULL,
  action_context_json TEXT NOT NULL,
  market_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  downstream_caller TEXT NOT NULL CHECK(downstream_caller='predge'),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  license_payload_sha256 TEXT NOT NULL CHECK(length(license_payload_sha256)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predge_risk_gate_license_created
  ON predge_risk_gate_verdict_license(created_at,client_id);

CREATE TRIGGER IF NOT EXISTS predge_paid_risk_gate_license_fields_immutable
BEFORE UPDATE OF licensee_id,max_commercial_uses,consumption_count,resale_permitted,
  transferable,subject_json,action_context_json,market_id,condition_id,
  downstream_caller,license_payload_sha256
ON predge_paid_risk_gate_usage_ledger
WHEN NEW.licensee_id IS NOT OLD.licensee_id OR
  NEW.max_commercial_uses IS NOT OLD.max_commercial_uses OR
  NEW.consumption_count IS NOT OLD.consumption_count OR
  NEW.resale_permitted IS NOT OLD.resale_permitted OR
  NEW.transferable IS NOT OLD.transferable OR
  NEW.subject_json IS NOT OLD.subject_json OR
  NEW.action_context_json IS NOT OLD.action_context_json OR
  NEW.market_id IS NOT OLD.market_id OR
  NEW.condition_id IS NOT OLD.condition_id OR
  NEW.downstream_caller IS NOT OLD.downstream_caller OR
  NEW.license_payload_sha256 IS NOT OLD.license_payload_sha256
BEGIN
  SELECT RAISE(ABORT,'PREDGE_SINGLE_USE_LICENSE_FIELDS_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS predge_risk_gate_verdict_license_no_update
BEFORE UPDATE ON predge_risk_gate_verdict_license
BEGIN SELECT RAISE(ABORT,'PREDGE_SINGLE_USE_LICENSE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS predge_risk_gate_verdict_license_no_delete
BEFORE DELETE ON predge_risk_gate_verdict_license
BEGIN SELECT RAISE(ABORT,'PREDGE_SINGLE_USE_LICENSE_IMMUTABLE'); END;
