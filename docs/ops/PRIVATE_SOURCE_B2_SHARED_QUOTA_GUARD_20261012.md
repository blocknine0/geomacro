# Private rights/status B2 quota recovery — 12 October 2026

## Actual gap fixed

Public Intelligence, GRI and Risk Indices Cloudflare Workers already used
the shared Cloudflare control-plane D1 atomic B2 admission system.
However, `readB2SourceNetworkStatus()` and
`readB2CommercialSourceRights()` in the app-server still used a second,
direct signed-S3 GET path, consuming account-wide B2 Class B without D1
reservation during quota exhaustion. The security boundary was therefore
incomplete even though public risk-scored API routes were already edge-only.

This patch applies the existing `/v1/b2-quota/reserve` D1 governor
**before** any private source-metadata S3 request. Each GET uses fixed IDs
`app_private_source_status` or `app_private_source_rights`, same
account-wide daily limits (GET 25, total 80) and atomic, fail-closed D1
reservation. The D1 governor is the only authority; a local GET counter is
not safe across GitHub, Cloudflare and multiple server instances.

Existing server-only `GEOMACRO_CONTROL_PLANE_TOKEN` (or
`CONTROL_PLANE_TOKEN`) needs a privately configured token at least
32 characters long. Do **not** put it in Git, browser env, logs, tests,
error messages or customer APIs. Never create fresh API keys from
this change. If the token is missing or D1/Cloudflare is frozen, the
private fallback returns unavailable **without calling B2**. The verified
short-lived (120-second) *in-process* compressed-body cache may be reused
within its existing TTL. No quota tickets are issued for cache hits.

The public Intelligence/GRI and machine risk objects still use the
independently verified Cloudflare D1-hot → positive POP cache →
reserved bounded B2 → honest unavailable flow. This patch never
reclassifies source metadata as a signed GRO, does not bypass source
commercial-use terms, and performs no Supabase network traffic, B2 writes
or USDC settlements.

## Independent acceptance

- Product CI: tests prove missing/rejected/malformed D1 reservations never
  reach signed B2 GET, and successful exact reservation precedes every
  attempted private GET.
- CodeQL.
- Production B2 account quota status and relevant runtime acceptance;
  expect private rights availability still blocked until an actual
  verified rights snapshot and secret configuration exist. A 503 is not
  a permission to set ready=true.
- New evidence/signed GRO and D1 hot snapshot serving are still separate
  P0 blockers #2114/#2115/#2045 and #1827.

For owner-only setup: map the existing 32+ character Cloudflare
`CONTROL_PLANE_TOKEN` to private server-side
`GEOMACRO_CONTROL_PLANE_TOKEN` if the app runtime needs legacy
commercial metadata fallback. Never use a public/VITE_ variable.
