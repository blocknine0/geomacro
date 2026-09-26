# Global CANONICAL continuous refresh

## Objective

Geomacro continuously evaluates every enabled sovereign country in `live_country_registry` for a fresh signed `CANONICAL` Risk Object. The country universe is data-driven and must not be replaced by a hard-coded payment allowlist.

The target universe is the full enabled sovereign registry. A country becomes paid-ready only when its current signed Risk Object is fresh, cryptographically valid, internally verified and commercially eligible under the existing commercial delivery policy.

## Safety invariant

Continuous global coverage does not mean forced commercial availability.

For every enabled sovereign country, each refresh cycle must produce one of two outcomes:

- `PAID_READY`: a fresh signed CANONICAL Risk Object exists and passes the commercial delivery policy;
- `FAIL_CLOSED`: the country is not payable until its exact missing, stale, unverified or commercially ineligible inputs recover.

The refresh process must never lower evidence thresholds, extend freshness windows, reinterpret source rights, turn public-demo objects into commercial objects, or settle a payment.

## Runtime

Runner:

`bun scripts/refresh-global-canonical-risk-objects.ts`

The runner:

1. loads every enabled country from `live_country_registry`;
2. keeps only sovereign ISO3 subjects using the canonical global entity classifier;
3. publishes a fresh signed `CANONICAL` country Risk Object;
4. verifies its signature and public artifact contract;
5. applies the commercial Risk Object delivery policy;
6. records only sanitized status, hashes, timestamps and reason codes;
7. classifies each country as `PAID_READY` or `FAIL_CLOSED`;
8. fails the operational gate if the enabled sovereign denominator regresses below the configured floor or the paid-ready count falls below the configured safety floor.

The default operational floors are:

- enabled sovereign denominator: at least `190`;
- paid-ready countries: at least `100`.

These are regression alarms, not marketing claims. The exact paid-ready count must come from the latest successful refresh artifact.

## Freshness cadence

Country Risk Objects have a three-hour TTL. Production scheduling should run the global refresh hourly so one delayed or failed run still leaves recovery time before normal expiry.

Only one global refresh may run at a time. Scheduled refreshes should execute from canonical `main` with the production Supabase project and the governed Risk Object signing key.

## Evidence boundary

The report schema is `geomacro-global-canonical-refresh-v1`.

It may contain per-country status, object ID, generated/expiry timestamps, risk label, confidence, readiness status, verification/commercial status, signature validity, integrity hashes and reason codes.

It must not contain raw source material, provider payloads, article bodies, scraped HTML, internal prompts, private keys, payment proofs or seed phrases.

`execution_authorized` remains `false`. Refresh performs no x402 payment.

## Paid-delivery boundary

Paid routes continue to perform their own no-charge deliverability check at request time. A successful background refresh does not bypass request-time freshness, signature, commercial eligibility or payment-binding checks.

Countries currently unable to satisfy the governed evidence chain remain visible in operational evidence as `FAIL_CLOSED`; they must not receive a payment challenge until they become deliverable.

## Expansion goal

The long-term goal is to reduce the fail-closed set toward zero by improving commercially cleared, definition-compatible and fresh source coverage. The system must never claim all-country paid coverage until a current global refresh artifact actually reports the entire enabled sovereign denominator as `PAID_READY`.
