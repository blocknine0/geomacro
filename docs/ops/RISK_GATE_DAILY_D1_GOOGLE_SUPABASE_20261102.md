# Risk Gate Daily — D1-first, Google RSS gap-fill, private Supabase

This design extends PR #3414 without modifying Predge's separate partner
pricing, token, research feed or payment integration.

## Production data contract

- Run at 06:00 UTC via existing Worker one-minute cron; retry every ten minutes
  during the 06 UTC hour. No second Cloudflare scheduler.
- Existing canonical D1 corridor_native_news_candidates in the last 24 hours
  take priority. Missing corridor coverage triggers one bounded Google News RSS
  search (<=600 KB, <=20 metadata items). RSS publisher tags do not constitute
  independent confirmation; Google News remains a third-party aggregator.
- Read the existing D1 GDELT index only as a count of unverified candidates.
- For each of 12 registered corridors, derive the SAME day's CORE, SIGNAL and
  POLICY snapshots from one normalized observation (not three source fetches).
- CORE requires independently validated currently signed GRO and a client
  policy before any automatic GATE_PASS / GATE_BLOCKED. Otherwise return
  GATE_INSUFFICIENT_EVIDENCE. SIGNAL returns GATE_ADVISORY with observation-only
  provisional heuristic 0.40-0.65, or null with no evidence.
- POLICY Strict mirrors CORE; Policy Lenient carries customer-acknowledged
  OVERRIDE_PASS / OVERRIDE_HOLD as advisory recommendations without autonomous
  transaction execution.
- The single D1 daily_tiered_risk_gates row per corridor/day contains
  three separate JSON fields, original observation metadata, SHA-256, HMAC
  and generated timestamp. HMAC authenticates the snapshot, not event truth.
- Every 15 minutes at minute 09, try to sync unsynced D1 snapshots into
  Supabase, using server-only service-role credentials and independently
  verifying exact row hash before marking D1 row synchronized.
- The authenticated D1 GET at /v1/risk-gate/tiered/daily?corridor_id=bab-el-mandeb
  serves a verified snapshot. The existing POST /v1/risk-gate/tiered/evaluate
  consumes the same saved observation for listed corridors, applying the
  customer-specific policy and preserving its immutable request audit.

## Registered corridor IDs

bab-el-mandeb, red-sea, hormuz, suez, malacca, taiwan-strait, panama,
singapore-strait, south-china-sea, gulf-of-aden, gulf-of-guinea,
black-sea-grain.

These are the twelve existing native corridor IDs, not every conceivable
country pair. Country-to-country corridors remain an existing on-demand path.

## Cleanup precisely as requested

At 06:12 UTC the Worker checks a durable D1 housekeeping schedule. After
Supabase activation the first cleanup is scheduled ten days later. Every ten
days thereafter, delete only rows strictly older than three days. Verify
remote deletion by SELECT before advancing the schedule. On failure retry at
a later eligible scheduled tick. No daily deletion.

Because cleanup is every ten days, the effective retained age varies between
approximately 3 and 13 days during the normal cycle.

## Owner-provisioned production setup

1. Run SQL in the newly selected private Supabase project:
   supabase/risk-gate-daily/001_daily_three_tiers.sql
2. Provision protected server-side values:
   RISK_GATE_TIERED_TOKEN = distinct 64 lowercase hex secret
   RISK_GATE_OBSERVATION_HMAC_KEY = separate >=32 byte random secret
   RISK_GATE_SUPABASE_URL = https://PROJECT_REF.supabase.co
   RISK_GATE_SUPABASE_SERVICE_ROLE_KEY = server-side private key
   RISK_GATE_SUPABASE_ACCEPTANCE = ACCEPTED_PRIVATE_RISK_GATE_DAILY
3. Migrate Cloudflare D1 migrations 0106 and 0107, deploy from reviewed main,
   validate actual production Worker SHA, cron, D1+Supabase readback and
   HMAC signature. The protected production deploy job only runs on main.
4. Do not place service-role keys or HMAC secrets into source control, chat,
   public GitHub logs, browser or client application.

## Automated tests

node --test scripts/ops/test-risk-gate-controlled-bypass.mjs scripts/ops/test-daily-risk-gate-generator.mjs

Tests use SYNTHETIC Bab-el-Mandeb metadata for D1-first fixture, do not claim
to observe a real shipping incident. The gateway remains no-funds and
chargeable=false until actual paid entitlement, collected payment, refund
reconciliation, and source permissions are independently accepted.
