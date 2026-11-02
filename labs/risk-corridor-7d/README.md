# Isolated GeoMacro Universal Risk Gates + 7-day Corridor Candidate

**Master issue:** https://github.com/blocknine0/geomacro/issues/3339

**Branch:** feature/isolated-supabase-risk-corridor-7d

**New dedicated Supabase project ref (owner-supplied, non-secret):** `ymjuwuvbialsevfawvvq`

**Expected candidate Data API origin:** `https://ymjuwuvbialsevfawvvq.supabase.co` (endpoint and credentials NOT YET REMOTELY VERIFIED)

**Important:** Candidate storage client rejects any other Supabase URL, including old GeoMacro. Owner-provided SQL output confirms four Supabase tables with RLS enabled, hourly pg_cron job registered and manual purge function callable. Authenticated client write/automatic scheduled execution and physical expiry deletion remain unverified.


**Owner-provided NEW Cloudflare STAGING D1:** `geomacro-risk-corridor-staging`, UUID `9f9c3a23-d299-4af1-9c4f-db9cc4bcb2f9`; bound as `RC_STAGING_D1` to owner-created `geomacro-rc-staging` Worker, evidenced by screenshot. Owner-supplied D1 readback shows five tables. The source-controlled `wrangler.jsonc` preserves that binding for future **isolated** deployments; deployed Worker code and runtime readback have not yet been accepted.

**Status:** isolated, no-funds source-sync coding candidate. The Worker config contains a 15-minute cron with `RC_SYNC_ENABLED=0` by default; actual B2/Supabase credentials, new sync-run D1 migration, staging deployment and authenticated data readback are NOT YET configured or verified. Do not infer the dashboard Hello World Worker runs the new code. NOT PRODUCTION, NO LIVE FUNDS, NO MAIN/PREDGE MODIFICATIONS.

**Automated sync runbook:** [docs/AUTOMATED_VERIFIED_GRO_SYNC.md](docs/AUTOMATED_VERIFIED_GRO_SYNC.md). It describes separate protected B2 read-only credentials and Supabase staging secret needed before enabling the Worker.

## Architecture

* Any customer may use ONE GeoMacro canonical risk gate, with BASIC / STANDARD / COMPLEX tiers. PREDGE is a future optional partner adapter, not the owner of the platform.
* This package consumes only GeoMacro's signed, commercially verified GRO and approved domain attestations. No RSS/GDELT/FRED/source collection logic is duplicated.
* The existing canonical risk-gate-engine.ts evaluates each trusted country or directional corridor GRO. Multi-subject decisions retain the individual canonical scores, with the strongest restriction as the universal advisory decision. No invented aggregate score or maritime-route claim.
* Versioned signed universal envelope: geomacro.risk-verdict.v1, Ed25519 bound to request, tenant, tier, quote, policy, GRO hashes, decision and time.
* Existing public GeoMacro capability prices and the PREDGE risk-gate-1.0/risk-gate-2.0 interfaces are untouched.
* New Supabase Free project stores derived operational signals and candidate assessments for seven days only, read-side cutoff PLUS hourly pg_cron deletion. Commercial ledger and canonical GRO are never stored there.
* Dedicated STAGING D1 holds tenant API hashes, idempotency claims, immutable delivered response, verified receipt/refund and monthly reconciliation.
* No real-money collection, credits debit, settlement, worker production deployment or actual key installation is activated by this code.

## Files

| File | Scope |
| --- | --- |
| src/contract.mjs | Strict subject, tier, category and quote validation; integer micro-USDC |
| src/crypto.mjs | Canonical JSON and signed/verifiable Ed25519 envelope |
| src/service.mjs | Universal verified GRO evaluation and durable delivery pipeline |
| src/geomacro-bridge.ts | Existing GeoMacro GRO signature verifier and Risk Gate engine adapter |
| src/d1-ledger.mjs | D1 multi-tenant key auth, claim/replay, proof-gated receipts and summary |
| src/http.mjs | Staging-only HTTP POST candidate, not registered in GeoMacro production |
| src/worker.mjs | Staging Worker with read-only D1 health and disabled-by-default 15-minute signed-GRO sync |
| src/b2-readonly.mjs | Dedicated scoped read-only B2 S3 v4 signed GRO fetch, bounded/strict |
| src/verified-gro.mjs | Pinned Ed25519 verification, commercial policy gates, signed GRO-driver category projection |
| src/sync-verified.mjs | 195-country bounded 20/slot sweep, D1 idempotency, classified skips/failures |
| src/countries-195.mjs | Snapshot of canonical GeoMacro 195-country ISO3 registry |
| sql/005_d1_sync_runs_console_safe.sql | NEW staging D1-only atomic slot/state table + index |
| docs/AUTOMATED_VERIFIED_GRO_SYNC.md | Secure one-time staging setup and acceptance instructions |
| wrangler.jsonc | Exact staging Worker name, script entrypoint and dedicated D1 binding; no scheduled triggers |
| src/supabase-buffer.mjs | Optional service-only 7-day derived signals and read-side TTL |
| sql/001_supabase_7d.sql | NEW Supabase tables, RLS/service-only, expiry indexes and purge function |
| sql/004_supabase_activate_cleanup.sql | Hourly cron after extension enabled on NEW project |
| sql/003_supabase_7d_rollback.sql | Explicit destructive NEW-project-only rollback |
| sql/002_d1_staging.sql | Dedicated STAGING D1; never apply to production |
| tests/*.test.mjs | No-funds unit tests, fixtures and security negative paths |

## Run tests

Node 22 or newer, offline, no credentials required:

    node --test labs/risk-corridor-7d/tests/*.test.mjs

The branch-specific workflow risk-corridor-7d-isolated-tests.yml runs syntax and offline tests with contents:read only. No secrets, production deployments or payment actions. Creating these files does not deploy the script or alter the existing Hello World staging Worker. A separate, explicitly approved staging-only deployment is required.

## Example request (candidate only)

    {
      "schema":"geomacro.risk-request.v1",
      "request_id":"tenant-request-00001",
      "tier":"STANDARD",
      "subjects":[{"type":"country","country_iso3":"IND"}],
      "domains":["geopolitics","macro_fx"],
      "policy_id":"approved-server-policy"
    }

Server-side scope determines tier. Client cannot supply price, payment rail, commercial entitlement or policy thresholds. Higher-tier scenario/history requirements must have separately verified contextual proof or fail closed with no charge.

## Owner-only prerequisites

1. Create a NEW dedicated Supabase project, independent from the legacy main GeoMacro account. Provide public project URL/ref and put the service key into a private server-side staging secret, never chat/GitHub.
2. Create a NEW Cloudflare D1 staging database and bind as RC_STAGING_D1 in a separately protected candidate runtime. Apply sql/002_d1_staging.sql ONLY there.
3. Apply sql/001_supabase_7d.sql ONLY to the NEW Supabase project. Enable pg_cron in that project and apply sql/004_supabase_activate_cleanup.sql. Confirm read-side expiry and cron job run history; configure alerts.
4. Provision high-entropy independent tenant API credentials. Store only SHA256 of a 64-lowercase-hex token string in gm_rc_api_keys; never plaintext in D1 or code.
5. Supply GeoMacro-approved server-side policy mappings and existing D1/B2 trusted signed-GRO readers; pinned key verification and per-domain qualification are mandatory.
6. Provision protected commercial Ed25519 verdict signing key and corresponding public-key trust registry inside the dedicated staging runtime only; no key material in repository.
7. Explicitly approve retail/partner pricing and payment integrations later. **Corridor pricing is currently DEFERRED**, so corridor verdicts are nonpayable.
8. For production: independently approve partner schema, verified payments/refunds, quotas, free-tier failover, monthly usage report on 5th, settlement proposal on 10th, legal basis, deployment, and real-money operator authorization.

## Safety and limits

* Failure or insufficient genuine signed, commercially eligible GRO => PAUSE/no charge/no stored payable ID. A genuine verified risk PAUSE can be an earned advisory once approved pricing exists.
* Never pass raw third-party articles, internal ingestion details or source secrets to customers. No scoring from an unverified Supabase event.
* A separate Supabase Free project can pause; cron cannot guarantee immediate physical deletion while paused. The API applies an independent seven-day read-side cutoff, and cleanup resumes after recovery.
* Long-lived customer payment, refund and audit records stay in D1, not seven-day Supabase.
* recordVerifiedCollection and recordVerifiedRefund take independently validated external receipt proofs; those callbacks are explicit integration requirements, not installed gateways.
* Tests and CI are **not** production acceptance. No PR merge into main without a new owner instruction.

## Acceptance checklist (not yet passed)

- [ ] Supabase schema + cron + project-isolation verified remotely
- [ ] RLS, secret isolation and seven-day cleanup acceptance
- [ ] Staging D1 tenant credentials, exact receipt/refund ledger reconciliation
- [ ] Genuine three-domain signed GRO / existing score engine bridge runtime
- [ ] Signed verdict verifier, replay/expiry and protected key rotation
- [ ] Outage/retry, rate limits, cost guardrail, job scheduling and alert verification
- [ ] Partner contract acceptance and broader customer API entitlements
- [ ] Owner-approved release, funds and settlement activation
