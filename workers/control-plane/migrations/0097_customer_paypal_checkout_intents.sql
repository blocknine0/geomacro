-- P0: immutable owner-priced PayPal checkout intent for future authenticated
-- Orders-v2 live integration. This migration creates NO orders, funds,
-- entitlements, payments, or API keys. The public routes remain locked.
CREATE TABLE IF NOT EXISTS customer_paypal_checkout_intents (
  intent_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(intent_id) BETWEEN 16 AND 96),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'paypal' CHECK(provider='paypal'),
  environment TEXT NOT NULL DEFAULT 'live' CHECK(environment='live'),
  sku TEXT NOT NULL CHECK(sku IN ('starter_dev','pro_analyst','business_pilot',
                                  'starter_pack','standard_pack','growth_pack')),
  tier TEXT NOT NULL CHECK(tier IN ('starter_dev','pro_analyst','business_pilot',
                                    'credits_100','credits_500','credits_1500')),
  amount_minor_units INTEGER NOT NULL CHECK(amount_minor_units>0),
  credits INTEGER NOT NULL CHECK(credits>0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  provider_order_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'created'
    CHECK(state IN ('created','bound','capture_requested','funded','failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  funded_at TEXT,
  CHECK(expires_at>created_at),
  CHECK(
    (sku='starter_dev' AND tier='starter_dev' AND amount_minor_units=900 AND credits=1000) OR
    (sku='pro_analyst' AND tier='pro_analyst' AND amount_minor_units=2900 AND credits=5000) OR
    (sku='business_pilot' AND tier='business_pilot' AND amount_minor_units=9900 AND credits=25000) OR
    (sku='starter_pack' AND tier='credits_100' AND amount_minor_units=500 AND credits=100) OR
    (sku='standard_pack' AND tier='credits_500' AND amount_minor_units=1500 AND credits=500) OR
    (sku='growth_pack' AND tier='credits_1500' AND amount_minor_units=3000 AND credits=1500)
  )
);
CREATE INDEX IF NOT EXISTS idx_customer_paypal_intent_owner
  ON customer_paypal_checkout_intents(user_id,state,created_at);
CREATE TRIGGER IF NOT EXISTS trg_customer_paypal_intent_immutable_identity
BEFORE UPDATE ON customer_paypal_checkout_intents
WHEN OLD.intent_id<>NEW.intent_id OR OLD.user_id<>NEW.user_id OR
     OLD.provider<>NEW.provider OR OLD.environment<>NEW.environment OR
     OLD.sku<>NEW.sku OR OLD.tier<>NEW.tier OR
     OLD.amount_minor_units<>NEW.amount_minor_units OR
     OLD.credits<>NEW.credits OR OLD.currency<>NEW.currency OR
     OLD.created_at<>NEW.created_at OR OLD.expires_at<>NEW.expires_at OR
     (OLD.provider_order_id IS NOT NULL AND
       (NEW.provider_order_id IS NULL OR NEW.provider_order_id<>OLD.provider_order_id)) OR
     (OLD.funded_at IS NOT NULL AND NEW.funded_at<>OLD.funded_at)
BEGIN SELECT RAISE(ABORT,'PAYPAL_INTENT_PRICE_OR_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_customer_paypal_intent_state
BEFORE UPDATE OF state ON customer_paypal_checkout_intents
WHEN NOT (
 (OLD.state='created' AND NEW.state IN ('created','bound','failed')) OR
 (OLD.state='bound' AND NEW.state IN ('bound','capture_requested','funded','failed')) OR
 (OLD.state='capture_requested' AND NEW.state IN ('capture_requested','funded')) OR
 (OLD.state='funded' AND NEW.state='funded') OR
 (OLD.state='failed' AND NEW.state='failed')
)
BEGIN SELECT RAISE(ABORT,'PAYPAL_INTENT_STATE_TRANSITION_DENIED'); END;
CREATE TRIGGER IF NOT EXISTS trg_customer_paypal_intent_delete
BEFORE DELETE ON customer_paypal_checkout_intents
BEGIN SELECT RAISE(ABORT,'PAYPAL_INTENT_APPEND_ONLY'); END;
