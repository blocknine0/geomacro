-- PostgreSQL 15+, execute once as database owner. Entire install is atomic.
BEGIN;
CREATE SCHEMA geomacro;
REVOKE ALL ON SCHEMA geomacro FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'geomacro_billing') THEN
    CREATE ROLE geomacro_billing NOLOGIN;
  END IF;
END $$;

CREATE TYPE geomacro.tier AS ENUM ('basic','standard','complex');
CREATE TABLE geomacro.prices (
 tier geomacro.tier PRIMARY KEY,
 priority smallint NOT NULL UNIQUE CHECK(priority BETWEEN 1 AND 3),
 credit_units bigint NOT NULL CHECK(credit_units > 0 AND credit_units <= 9007199254740991),
 usd_micros bigint NOT NULL CHECK(usd_micros > 0)
);
-- 1 credit = 1,000,000 units; initial credit tariff is explicitly configurable.
-- 10 / 15 / 25 credits per call; cash tariff is $0.10 / $0.15 / $0.25.
INSERT INTO geomacro.prices VALUES
 ('basic',1,10000000,100000),('standard',2,15000000,150000),('complex',3,25000000,250000);

CREATE TABLE geomacro.users (
 id uuid PRIMARY KEY, -- same identifier as auth.users.id in Supabase
 email text,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
 balance_units bigint NOT NULL DEFAULT 0 CHECK(balance_units BETWEEN 0 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE geomacro.api_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES geomacro.users(id),
 key_hash text NOT NULL UNIQUE CHECK(key_hash ~ '^[0-9a-f]{64}$'),
 prefix text NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 scopes text[] NOT NULL DEFAULT ARRAY['risk-gate:read'],
 rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK(rate_limit_per_minute > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 UNIQUE(id,user_id)
);
CREATE INDEX api_keys_user_idx ON geomacro.api_keys(user_id);
CREATE TABLE geomacro.usage_logs (
 request_id uuid PRIMARY KEY,
 user_id uuid REFERENCES geomacro.users(id),
 api_key_id uuid,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 2 AND 128),
 requested_tier geomacro.tier NOT NULL,
 billed_tier geomacro.tier,
 rail text NOT NULL CHECK(rail IN ('credits','base_usdc')),
 state text NOT NULL CHECK(state IN ('succeeded','failed','refunded')),
 http_status integer NOT NULL CHECK(http_status BETWEEN 100 AND 599),
 credit_units bigint NOT NULL DEFAULT 0 CHECK(credit_units >= 0),
 usd_micros bigint NOT NULL DEFAULT 0 CHECK(usd_micros >= 0),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(api_key_id,user_id) REFERENCES geomacro.api_keys(id,user_id),
 CHECK(rail <> 'credits' OR (user_id IS NOT NULL AND api_key_id IS NOT NULL)),
 CHECK((state IN ('succeeded','refunded') AND http_status=200 AND billed_tier IS NOT NULL)
    OR (state='failed' AND http_status<>200 AND credit_units=0 AND usd_micros=0 AND billed_tier IS NULL))
);
CREATE INDEX usage_user_time_idx ON geomacro.usage_logs(user_id,created_at DESC);
CREATE INDEX usage_key_idx ON geomacro.usage_logs(api_key_id);
CREATE TABLE geomacro.credit_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES geomacro.users(id),
 delta_units bigint NOT NULL CHECK(delta_units <> 0),
 balance_after_units bigint NOT NULL CHECK(balance_after_units >= 0),
 kind text NOT NULL CHECK(kind IN ('signup','payment','usage','refund')),
 provider text NOT NULL,
 external_id text NOT NULL,
 request_id uuid REFERENCES geomacro.usage_logs(request_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,external_id),
 CHECK((kind='usage' AND delta_units<0 AND request_id IS NOT NULL)
    OR (kind='refund' AND delta_units>0 AND request_id IS NOT NULL)
    OR (kind IN ('signup','payment') AND delta_units>0 AND request_id IS NULL))
);
CREATE INDEX ledger_user_time_idx ON geomacro.credit_ledger(user_id,created_at DESC);
CREATE INDEX ledger_request_idx ON geomacro.credit_ledger(request_id);
CREATE TABLE geomacro.audit_receipts (
 request_id uuid PRIMARY KEY REFERENCES geomacro.usage_logs(request_id),
 algorithm text NOT NULL DEFAULT 'Ed25519' CHECK(algorithm='Ed25519'),
 canonical_payload text NOT NULL,
 response_hash text NOT NULL CHECK(response_hash ~ '^[0-9a-f]{64}$'),
 signature text NOT NULL CHECK(length(signature)>0),
 public_key_id text NOT NULL CHECK(length(public_key_id)>0),
 signed_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 CHECK(response_hash=encode(sha256(convert_to(canonical_payload,'UTF8')),'hex'))
);
CREATE TABLE geomacro.web3_txs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES geomacro.usage_logs(request_id),
 chain_id bigint NOT NULL DEFAULT 8453 CHECK(chain_id=8453),
 token_address text NOT NULL CHECK(token_address ~ '^0x[0-9a-f]{40}$'),
 payer_address text NOT NULL CHECK(payer_address ~ '^0x[0-9a-f]{40}$'),
 payee_address text NOT NULL CHECK(payee_address ~ '^0x[0-9a-f]{40}$'),
 authorization_nonce text NOT NULL CHECK(authorization_nonce ~ '^0x[0-9a-f]{64}$'),
 amount_atomic bigint NOT NULL CHECK(amount_atomic>0), -- USDC: 6 decimals
 tx_hash text CHECK(tx_hash ~ '^0x[0-9a-f]{64}$'),
 log_index integer CHECK(log_index>=0),
 state text NOT NULL CHECK(state IN ('authorized','settled','failed','refunded')),
 verified_at timestamptz NOT NULL,
 settled_at timestamptz,
 UNIQUE(chain_id,token_address,payer_address,authorization_nonce),
 UNIQUE(chain_id,tx_hash,log_index),
 CHECK(state <> 'settled' OR (tx_hash IS NOT NULL AND log_index IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE TABLE geomacro.webhook_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES geomacro.users(id),
 target_url text NOT NULL CHECK(target_url ~ '^https://'),
 secret_reference text NOT NULL, -- KMS/Vault reference, never plaintext secret
 subjects text[] NOT NULL,
 threshold numeric(5,2) NOT NULL CHECK(threshold BETWEEN 0 AND 100),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_user_idx ON geomacro.webhook_subscriptions(user_id);

CREATE FUNCTION geomacro.immutable_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='APPEND_ONLY_RECORD'; END $$;
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON geomacro.credit_ledger
FOR EACH ROW EXECUTE FUNCTION geomacro.immutable_record();
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON geomacro.audit_receipts
FOR EACH ROW EXECUTE FUNCTION geomacro.immutable_record();

-- The schema is private and absent from Supabase's exposed schemas.
-- Runtime has function execution only, never table mutation rights.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='geomacro' LOOP
  EXECUTE format('ALTER TABLE geomacro.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA geomacro FROM PUBLIC,geomacro_billing;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA geomacro FROM %I',r);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA geomacro FROM %I',r);
  EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM %I',r);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA geomacro TO geomacro_billing;
COMMIT;
