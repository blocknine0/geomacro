# Tiered Risk Gate: controlled observation and client policy

API (isolated from Predge pilot and its agreed 10 November prices):
POST /v1/risk-gate/tiered/evaluate

Request JSON:
{
  "request_id":"req_88319a",
  "requested_at":"2026-11-02T14:19:00.000Z",
  "subject":{"type":"corridor","id":"bab-el-mandeb"},
  "product_tier":"SIGNAL",
  "policy_mode":"STRICT"
}

For a verified current GRO, include risk_policy using the existing Risk Gate
v1 policy fields. When no real signed and eligible GRO exists, a
GATE_ADVISORY observation is delivered instead of a claimed hard decision.

Client-assumed override example changes:
  "product_tier":"POLICY",
  "policy_mode":"LENIENT",
  "client_override":{"action":"PASS","acknowledged":true}

Returned gate_decision remains GATE_ADVISORY if real event proof is missing.
The explicitly separate client_policy_decision becomes OVERRIDE_PASS or
OVERRIDE_HOLD. execution_authorized remains false.

## Strict source boundaries

* Source candidates are fetched from existing Cloudflare D1: first-party
  corridor native-news index or country-scoped private Phase2H originals.
* Same-title republications from different domains collapse to a common
  inferred origin group. Different-domain counts never establish independent
  verification. The 'independent_origins_verified' value stays zero without
  a verified current signed GRO.
* An observed Federal Reserve, central-bank or other registered authority
  publication is labeled AUTHORITATIVE_PUBLICATION_OBSERVED_EVENT_UNCONFIRMED;
  it is not converted into a verified field event. This permits a first-party
  issuer-statement observation without fabricating independent event proof.
* Proof of Observation is SHA-256 snapshot hash + server-side HMAC-SHA256,
  not source truth or external attestation.
* No synthetic risk threshold, confidence probability, incident classification
  or forced gate is created from article timestamps.
* A current genuine signed GRO plus a fully supplied client risk_policy is
  required for automated GATE_PASS/GATE_BLOCKED (existing v1 decision engine).
* Missing/expired/invalid GRO, unverified observations, request failures,
  chargeback/refund state not verified or missing commercial rights cannot
  be represented as a paid successful Risk Gate decision.

## SKU boundary

CORE: Deterministic Hard Gate, proposed price 0.50 USD/check.
SIGNAL: Early Warning/Advisory, proposed price 0.02 USD/check.
POLICY: Client-Assumed Override, subscription plus credits (no invented unit price).

These are separate SKU intents, not changes to the agreed Predge-to-customer
Basic $0.15 / Standard $0.20 / Complex $0.30 contract. No charge, invoice,
entitlement or settlement is enabled by this API; its billing output always
reports credits_deducted=0, customer_paid=false, chargeable=false until an
independent delivery/payment and source-rights integration is completed.

## Protected setup

1. Apply workers/control-plane/migrations/0106_risk_gate_tiered_controlled_bypass.sql
   through the existing D1 migration/deploy flow.
2. Provision a **new** RISK_GATE_TIERED_TOKEN (random 32 bytes as 64 lowercase
   hex) as a Worker secret; do not reuse PREDGE_RISK_GATE_TOKEN or admin.
3. Provision separate RISK_GATE_OBSERVATION_HMAC_KEY as a Worker secret
   with >=32 unpredictable UTF-8 bytes. Keep it server-side.
4. Deploy same main SHA to the Cloudflare control plane; verify secured 401,
   invalid 400, D1 readback, deterministic replay, no double quota and 503
   when key/migration/GRO unavailable.
5. Run node --test scripts/ops/test-risk-gate-controlled-bypass.mjs.

Existing v1 country/corridor evaluation, Predge research and signing keys are
unchanged. This overlay does not perform customer transaction execution.
