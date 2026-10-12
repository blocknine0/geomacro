# Supabase-frozen permanent serving boundary and quota failover — 12 October 2026

## What is already deployed as architecture

Geomacro production must assume **zero Supabase reads and writes for website
serving**. No multi-account Supabase expansion or new credit-card-backed
provider is required by this change.

- **Cloudflare Workers** host the separate Global Risk, Intelligence and
  Risk Indices derived-data edge read surfaces.
- **Cloudflare D1 hot snapshots** are the first read tier. They contain
  bounded public **derived** packages only, and are accepted only after
  independent full B2 readback/hash/gzip restore proof; they have strict
  source-as-of/expires bounds. The D1 hot tier does not need a new B2 GET.
- **Workers positive Cache API** is the second read tier within a POP.
  It contains a response that previously passed worker envelope/proof
  checks; it does not spend a B2 request per customer hit.
- **Backblaze B2** is the durable, immutable canonical archive. Cold GETs
  require an **account-wide D1 quota reservation for EACH** origin request,
  not a local counter or a guessed provider free quota.
- **Previously materialized, SHA-256-verified static continuity** is an
  independent read tier without B2/D1 GETs, but is available **only** if the
  production edge-deploy workflow has actually found an earlier
  successful, main-run, full B2-readback artifact and bundled it. Checked-in
  `continuity.mjs` files are correctly `null`; there is no simulated score
  or synthetic fallback in a fresh checkout.

## Bug fixed

A 120-second private POP negative-cache marker previously caused all three
edge workers to respond HTTP 503 **before testing** the independently
readback-verified continuity module. This was especially wasteful when D1
quota and B2 request caps were exhausted but a genuine previously verified
archive had already been bundled with the worker deployment.

The negative marker now means only **do not attempt a new B2 origin GET**.
It does not disable `buildContinuityResponse()`. All three workers try the
static continuity verifier and cache a successful response; if none exists,
they return honest HTTP 503. No new source names, raw articles, quote,
timestamp mutation, payment or Supabase connection is introduced.

## One-hour website GRI

PR #2104 separately adds a bounded, immutable verified GRI snapshot ring
inside the **existing** control-plane D1 DB, for website-only past 60min
retrieval; machine x402 readers stay separate and undelayed. This change
removes the **Supabase** branch from `readWebsiteLaggedGlobalRisk()`:

1. Try server-enforced 60-minute-cutoff D1 historical snapshot with exact
   original B2 readback hash.
2. If D1 quota, read-only availability or D1 migration is unavailable,
   fall back only to a **valid verified B2/edge GRI package** whose actual
   original `snapshotAsOf` already predates the cutoff.
3. If the B2 package is newer than 60 minutes, unavailable, corrupt or
   not independently verified, surface unavailable/historical rather than
   backdating a current snapshot or claiming fresh risk.

Neither public static continuity nor D1 snapshots is a substitute for
currently verified commercial country/corridor GRO signing rights.

## Acceptance limitations

There is no unlimited-free, guaranteed-24/7 traffic model across providers.
Provider quotas/limits are independent and can all be unavailable. Only
**verified previously persisted copies** can take over during a quota
exhaustion; new current evidence cannot appear until at least one real
authorized producer is working again.

Worker deployments are gated by real successful B2 artifacts/Cloudflare
credentials and may require a manual production dispatch for Global Risk
and Risk Indices. Passing Product CI alone never claims a Worker is deployed.
Use actual main production Actions runs and HTTP response
`x-geomacro-serving-store`, `x-geomacro-continuity` and source clock
values to confirm exact tier.

Pricing stays unchanged until founder update; no funds or manual account
action is initiated by this PR.
