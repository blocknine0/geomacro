-- Rebuild the isolated Predge ledger to accept zero-fee mutual-trial rows.
-- Preserve all existing paid records and restore immutable refund/report rules.
DROP VIEW IF EXISTS predge_paid_risk_gate_monthly_usage_report;
DROP TRIGGER IF EXISTS predge_paid_risk_gate_usage_identity_immutable;
DROP TRIGGER IF EXISTS predge_paid_risk_gate_refund_terminal;
DROP INDEX IF EXISTS idx_predge_paid_risk_gate_usage_month;
DROP INDEX IF EXISTS idx_predge_paid_risk_gate_collection;
ALTER TABLE predge_paid_risk_gate_usage_ledger RENAME TO predge_paid_risk_gate_usage_ledger_0131;

CREATE TABLE predge_paid_risk_gate_usage_ledger (
 ledger_id TEXT PRIMARY KEY CHECK(length(ledger_id)=64),
 verdict_id TEXT NOT NULL UNIQUE CHECK(length(verdict_id)=36 AND substr(verdict_id,9,1)='-' AND substr(verdict_id,14,1)='-' AND substr(verdict_id,19,1)='-' AND substr(verdict_id,24,1)='-'),
 request_id TEXT NOT NULL UNIQUE,
 channel TEXT NOT NULL CHECK(channel='predge_b2b'),
 tier TEXT NOT NULL CHECK(tier IN ('basic_focused','standard','complex_full')),
 structure_type TEXT NOT NULL CHECK(structure_type IN ('BASIC_FOCUSED_FACTS_DERIVED_V1','STANDARD_DUAL_ORIGINAL_GRO_V1','COMPLEX_7D_CORRIDOR_SYNTHESIS_V1')),
 customer_price_usdc_cents INTEGER NOT NULL CHECK(customer_price_usdc_cents IN (0,15,20,30)),
 contract_geomacro_fee_usdc_cents INTEGER NOT NULL CHECK(contract_geomacro_fee_usdc_cents IN (10,15,25)),
 contract_predge_share_usdc_cents INTEGER NOT NULL DEFAULT 5 CHECK(contract_predge_share_usdc_cents=5),
 geomacro_fee_usdc_cents INTEGER NOT NULL CHECK(geomacro_fee_usdc_cents IN (0,10,15,25)),
 predge_share_usdc_cents INTEGER NOT NULL CHECK(predge_share_usdc_cents IN (0,5)),
 billable INTEGER NOT NULL CHECK(billable IN (0,1)),
 billing_mode TEXT NOT NULL CHECK(billing_mode IN ('PAID_ADDENDUM_V2','MUTUAL_72H_TRIAL')),
 entry_status TEXT NOT NULL CHECK(entry_status IN ('DELIVERED','TRIAL_DELIVERED','INSUFFICIENT_EVIDENCE','UNDELIVERED','REFUNDED')),
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 response_sha256 TEXT NOT NULL CHECK(length(response_sha256)=64),
 created_at TEXT NOT NULL,
 usage_month TEXT NOT NULL CHECK(length(usage_month)=7 AND substr(usage_month,5,1)='-'),
 usage_report_due_date TEXT NOT NULL CHECK(length(usage_report_due_date)=10),
 settlement_due_date TEXT NOT NULL CHECK(length(settlement_due_date)=10),
 settlement_rail TEXT NOT NULL DEFAULT 'circle_arc' CHECK(settlement_rail='circle_arc'),
 settlement_network TEXT NOT NULL DEFAULT 'arc' CHECK(settlement_network='arc'),
 settlement_asset TEXT NOT NULL DEFAULT 'USDC' CHECK(settlement_asset='USDC'),
 collection_status TEXT NOT NULL DEFAULT 'UNREPORTED' CHECK(collection_status IN ('UNREPORTED','NO_COLLECTION','PARTIAL','COLLECTED')),
 collected_revenue_usdc_cents INTEGER NOT NULL DEFAULT 0 CHECK(collected_revenue_usdc_cents>=0 AND collected_revenue_usdc_cents<=customer_price_usdc_cents),
 collection_reported_at TEXT,
 settlement_status TEXT NOT NULL DEFAULT 'AWAITING_COLLECTION_REPORT' CHECK(settlement_status IN ('AWAITING_COLLECTION_REPORT','DUE','SETTLED','REFUNDED')),
 settlement_tx_hash TEXT,
 settled_at TEXT,
 CHECK((tier='basic_focused' AND structure_type='BASIC_FOCUSED_FACTS_DERIVED_V1' AND contract_geomacro_fee_usdc_cents=10 AND ((billing_mode='PAID_ADDENDUM_V2' AND customer_price_usdc_cents=15) OR (billing_mode='MUTUAL_72H_TRIAL' AND customer_price_usdc_cents=0))) OR (tier='standard' AND structure_type='STANDARD_DUAL_ORIGINAL_GRO_V1' AND contract_geomacro_fee_usdc_cents=15 AND ((billing_mode='PAID_ADDENDUM_V2' AND customer_price_usdc_cents=20) OR (billing_mode='MUTUAL_72H_TRIAL' AND customer_price_usdc_cents=0))) OR (tier='complex_full' AND structure_type='COMPLEX_7D_CORRIDOR_SYNTHESIS_V1' AND contract_geomacro_fee_usdc_cents=25 AND ((billing_mode='PAID_ADDENDUM_V2' AND customer_price_usdc_cents=30) OR (billing_mode='MUTUAL_72H_TRIAL' AND customer_price_usdc_cents=0)))),
 CHECK((entry_status='DELIVERED' AND billing_mode='PAID_ADDENDUM_V2' AND billable=1 AND geomacro_fee_usdc_cents=contract_geomacro_fee_usdc_cents AND predge_share_usdc_cents=contract_predge_share_usdc_cents) OR (entry_status='TRIAL_DELIVERED' AND billing_mode='MUTUAL_72H_TRIAL' AND billable=0 AND geomacro_fee_usdc_cents=0 AND predge_share_usdc_cents=0) OR (entry_status IN ('INSUFFICIENT_EVIDENCE','UNDELIVERED','REFUNDED') AND billable=0 AND geomacro_fee_usdc_cents=0 AND predge_share_usdc_cents=0)),
 CHECK((collection_status IN ('UNREPORTED','NO_COLLECTION') AND collected_revenue_usdc_cents=0) OR collection_status IN ('PARTIAL','COLLECTED')),
 CHECK(settlement_status<>'SETTLED' OR collected_revenue_usdc_cents>0),
 CHECK(entry_status IN ('DELIVERED','TRIAL_DELIVERED') OR (collection_status IN ('UNREPORTED','NO_COLLECTION') AND collected_revenue_usdc_cents=0 AND settlement_status<>'SETTLED')),
 CHECK(entry_status<>'TRIAL_DELIVERED' OR (collected_revenue_usdc_cents=0 AND collection_status IN ('UNREPORTED','NO_COLLECTION') AND settlement_status<>'SETTLED')),
 CHECK(billing_mode='MUTUAL_72H_TRIAL' OR entry_status<>'TRIAL_DELIVERED')
);

INSERT INTO predge_paid_risk_gate_usage_ledger
SELECT * FROM predge_paid_risk_gate_usage_ledger_0131;
DROP TABLE predge_paid_risk_gate_usage_ledger_0131;
CREATE INDEX idx_predge_paid_risk_gate_usage_month ON predge_paid_risk_gate_usage_ledger(usage_month,entry_status,verdict_id);
CREATE INDEX idx_predge_paid_risk_gate_collection ON predge_paid_risk_gate_usage_ledger(collection_status,settlement_status,usage_month);
CREATE VIEW predge_paid_risk_gate_monthly_usage_report AS
SELECT verdict_id,request_id,usage_month,created_at,channel,tier,structure_type,
 customer_price_usdc_cents,billing_mode,entry_status,billable,geomacro_fee_usdc_cents,
 predge_share_usdc_cents,collection_status,collected_revenue_usdc_cents,
 usage_report_due_date,settlement_due_date,settlement_rail,settlement_network,
 settlement_asset,settlement_status,settlement_tx_hash,settled_at
FROM predge_paid_risk_gate_usage_ledger
WHERE entry_status='REFUNDED' OR (entry_status='DELIVERED' AND billable=1);
CREATE TRIGGER predge_paid_risk_gate_usage_identity_immutable
BEFORE UPDATE ON predge_paid_risk_gate_usage_ledger
WHEN NEW.ledger_id<>OLD.ledger_id OR NEW.verdict_id<>OLD.verdict_id OR NEW.request_id<>OLD.request_id OR NEW.channel<>OLD.channel OR NEW.tier<>OLD.tier OR NEW.structure_type<>OLD.structure_type OR NEW.customer_price_usdc_cents<>OLD.customer_price_usdc_cents OR NEW.contract_geomacro_fee_usdc_cents<>OLD.contract_geomacro_fee_usdc_cents OR NEW.contract_predge_share_usdc_cents<>OLD.contract_predge_share_usdc_cents OR NEW.billing_mode<>OLD.billing_mode OR NEW.request_hash<>OLD.request_hash OR NEW.response_sha256<>OLD.response_sha256 OR NEW.created_at<>OLD.created_at OR NEW.usage_month<>OLD.usage_month OR NEW.usage_report_due_date<>OLD.usage_report_due_date OR NEW.settlement_due_date<>OLD.settlement_due_date OR NEW.settlement_rail<>OLD.settlement_rail OR NEW.settlement_network<>OLD.settlement_network OR NEW.settlement_asset<>OLD.settlement_asset
BEGIN SELECT RAISE(ABORT,'PREDGE_PAID_VERDICT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER predge_paid_risk_gate_refund_terminal
BEFORE UPDATE ON predge_paid_risk_gate_usage_ledger
WHEN OLD.entry_status='REFUNDED' AND NEW.entry_status<>'REFUNDED'
BEGIN SELECT RAISE(ABORT,'PREDGE_REFUND_STATUS_TERMINAL'); END;
