# GeoMacro public-news R2/KV offload (D1+B2 authority preserved)

## Permanent ownership boundaries

- **D1** remains canonical for the 72-hour native-clock Website Intelligence
  journal, source watermarks, private OSINT, checkpoints, queues and control.
- **B2** remains the durable source/private evidence and historical archive.
- **R2** is strictly an optional disposable, **public-only**, source-neutral
  72-hour projection snapshot (fixed key `geomacro/public-news/v1/current.json`).
  It does not replace D1 or B2, create a new authoritative event, or store raw
  publisher material. Worker revalidates existing derived signal contract,
  original publication clocks, identical machine IDs and public-only flags.
- **Workers KV** is strictly an *optional observational revision pointer*
  (`geomacro:public-news:v1:latest`) updated once on each successful
  R2 write+independent exact readback. It is not consulted on hot reads, cannot
  acknowledge queues, and cannot supersede the R2/D1 authority. This saves KV
  reads and avoids eventual-consistency dependence.
- **Workers Cache API** remains the first per-POP anonymous read layer (45s).
  A miss requests fresh bound R2 only for the immediate Website JSON feed and
  public source-neutral machine feed. Legacy 15-minute presentation, HTML,
  public non-news datasets, every protected, Predge, attributed partner,
  authenticated, paid and signed route continue existing paths unmodified.

## Source-clock, failure and budget invariants

1. Only after existing 5-minute fastlane's **critical D1 GraphQL admission**
   and deployed SHA ancestry verification, a single extra step GETs the actual
   `/health`, canonical zero-delay D1 public news pages 0/250/500 (as needed)
   and complete source-neutral machine projection with a literal
   `Cache-Control: no-cache`; no Google/publisher/OSINT source fetch.
2. Pure validation checks schema, rights flags, every source-neutral ID,
   original publication clock, domain, title-free upstream disclosure policy,
   native published time, page offsets and closed cursor. Only then the existing
   server-admin capability PUTs to the already-authenticated control-plane route.
   No public writer and no unsigned or private input can be promoted.
3. The Worker checks that the exact originating deployment SHA matches its
   current deployment; R2 put -> independent exact R2 GET and byte comparison ->
   optional KV pointer write. A failure is reported RED, without a synthetic
   no-news acknowledgement. **No D1 writes, B2 calls or source calls** in this
   offload. R2 uses one PUT + one independent GET per admitted bundle;
   optional KV uses one PUT per bundle and zero reads from Website requests.
4. Public reads require R2 snapshot age <= **8 minutes**, an allowed *literal*
   query, no auth/cookie/api-key/range/no-cache and source-native 72h validity.
   If not configured, absent, stale, truncated, corrupt, disabled or provider
   returns an error, the handler runs the existing real D1 path and propagates
   its actual success/503. Cache does not manufacture freshness or global
   195x3 source coverage.
5. Cloudflare Free quotas and account-wide D1/B2 admission remain authoritative.
   Disabling this optional R2 storage never deletes B2 evidence or D1 originals.
   No R2 bucket, KV namespace or paid plan is automatically created by code.

## Production opt-in (no credentials in chat)

Provision an **existing free-tier R2 bucket** in the same Cloudflare account
and ensure the existing protected Cloudflare API token has an R2 binding deploy
capability. In GitHub's existing `production` environment variables, set:

- `GEOMACRO_PUBLIC_NEWS_R2_BUCKET`: exact real R2 bucket name (lowercase
  hyphens). Leaving this unset means no binding, no R2 reads/writes, no failure.
- `GEOMACRO_PUBLIC_NEWS_KV_NAMESPACE_ID`: optional existing 32-character hex
  Workers KV namespace ID. Leave unset to use only R2 with no KV writes.
  KV without R2 is rejected before deploy.

The existing `Deploy D1 Control Plane` produces ephemeral Wrangler bindings
only when these environment vars are present. The existing
`Five-Minute Original News Fastlane` uses the already available
`GEOMACRO_COMMERCE_LEDGER_TOKEN` in the **same protected runner**, subject
to its existing daily D1 quota admission, to publish one new snapshot.
No repository secret or auth token is added. Changes in environment variables
alone do **not** redeploy the Worker; an approved main deploy is required.

## Proof of production activation

Verify the protected deploy's exact Worker `/health.deployed_source_sha`.
Then find an admitted main fastlane run whose `Publish current verified
source-neutral D1 snapshot to optional R2` stage has a successful receipt.
On an anonymous edge miss, the public immediate/machine endpoint returns
`X-GeoMacro-Public-Offload: r2` before the outer per-POP cache masks it;
`Cache-Control: no-cache` forces independent D1 readback. Confirm ID parity
against the D1 origin and compare **24h account-wide D1 rows read** plus
Cloudflare Query Insights fingerprints to baseline. A scheduled job or 200
response without a real R2 readback is **not** proof of traffic offload.

## Capacity caveats

Five-minute cadence is best-effort and runs only while quota-admitted.
At theoretical 288 successful cycles/day, R2 consumes 288 Class-A PUT and
288 Class-B GET operations/day for publish/verify and one KV write/cycle if
enabled, before public Cache API misses; provisioned free-tier allowances
must be tracked, not presumed. Cloudflare R2, KV, Workers and D1 free limits
are *independent*. Expired R2 snapshots trigger D1 fallback; therefore this
patch alone cannot guarantee zero D1 Free quota exhaustion, native 195x3
coverage, exact scheduler SLA or paid/signed product verification. A long
source hold may still yield actual data gaps; report them accurately.
