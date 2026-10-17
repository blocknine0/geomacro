# Supabase-free central request budgets

The October 16 Predge sandbox probe was rejected before its route handler by
`CENTRAL_SECURITY_UNAVAILABLE`. Nitro still called the frozen Supabase
`consume_central_security_budget` RPC. The replacement uses the existing
authenticated Cloudflare D1 control plane, with the same domain-separated
token already used by country GRO serving. No Supabase connection is attempted.

The shared server-owned policy module preserves all existing route classes,
window lengths, body limits, client/global budgets and fail-closed rules.
Both counter increments execute in one D1 batch transaction, using the
Worker's clock. Denied attempts count conservatively; counts saturate at
limit + 1 and reset at the next fixed window. Each row is overwritten across
windows; only a six-character HMAC slot is retained, never an IP, credential,
source, request body or product. Slot collisions can only deny earlier.
The global budget is exact and conservative across all client slots.

`POST /v1/security/budget` is authenticated before parsing or DB access.
Only a known route class and 64-hex client HMAC are accepted; callers cannot
choose limits, clocks or windows. The website requires a bound D1 receipt.
Store/auth/transport failures preserve the existing strict route denials and
the existing public-read/testnet fallback rules. No route is reclassified.
The website needs its existing `GEOMACRO_COMMERCE_LEDGER_TOKEN`; dedicated
fingerprint and real-money security gates remain unchanged.

Migration 0019 and Worker deployment use the existing protected D1 workflow.
The acceptance makes a synthetic authenticated counter reservation, tests
unauthenticated rejection and caller-policy rejection, verifies the exact
Worker source SHA and reads shared B2 quota status without a B2 operation.

This removes one security-store blocker. It does not by itself create fresh
signed Intelligence/GRI/Risk Indices, repair downstream legacy Risk Gate
dependencies, activate the isolated Predge pilot, establish a countersigned
LOI or authorize payment. Predge kickoff remains October 19, 2026, with the
separate pilot's default 100/day budget and absolute 500/day ceiling.

## Website request failure isolation

The public static build marker is not proof that the running SSR middleware
matches it. Denied middleware responses also carry `data.security_version`.
Version `geomacro-central-security-v1.1.1-d1` preserves the original 3.5-second
request deadline and distinguishes these fixed, non-secret failures:

- `CENTRAL_SECURITY_D1_TIMEOUT`: request or receipt body exceeded its deadline.
- `CENTRAL_SECURITY_D1_TRANSPORT_FAILED`: fetch or receipt stream failed.
- `CENTRAL_SECURITY_D1_UPSTREAM_REJECTED`: upstream HTTP status was neither a
  valid budget result nor the separately classified authentication/route errors.
- `CENTRAL_SECURITY_D1_RECEIPT_INVALID`: malformed JSON/UTF-8, oversized body,
  wrong route/store/schema, or invalid result binding.

The receipt body is limited to 2 KiB while streaming, not after full buffering.
No upstream body, token, URL query, or arbitrary exception message is exposed.
There is no retry of ambiguous reservations and no local fail-open fallback
for strict routes. An error classification change is not production recovery:
require an actual distributed-pass response from the deployed website before
claiming the central-security outage resolved. D1 health alone is insufficient.
