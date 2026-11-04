# GeoMacro P2 processing, publication and reliability — implementation + acceptance

Date: 2026-11-04. Canonical repo \`blocknine0/geomacro\`. Public website
\`https://geomacro.live\`, **not** the illustrative \`geomacro.com\`.

## #11 Archival GRO evidence
- Migration \`0120_gro_archival_evidence_outbox.sql\` installs an SQLite
  \`AFTER UPDATE OF b2_object_sha256\` trigger, so the same **B2 independently
  verified ACK** transaction durably inserts a retryable GRO work item.
- The existing one-minute Cloudflare Worker cron processes up to 20 pending
  items every other minute, and the alternate minute scans up to 30 old
  B2-acknowledged originals with a durable keyset cursor. D1 bulk reads/JSON
  inserts are used. No new B2 GET, provider, paid LLM, or separate queue.
- \`gro_evidence\` stores the five GeoMacro-authored GRO draft fields:
  \`what_happened\`, \`why_it_matters\`, \`market_relevance\`,
  \`what_to_watch\`, \`evidence_and_confidence\`. It also independently tracks
  source reliability, entity extraction, impact scoring, temporal context
  and fact corroboration.
- Existing raw first-party feed records contain metadata and sometimes a
  licensed description, **not a full publisher article**. We do not hallucinate
  missing article text. Every derived draft binds the exact original D1 SHA,
  B2 ACK and original publication timestamp. Invalid/changed bytes are held.
- \`is_gro_verified=TRUE\` is disallowed by the D1 CHECK constraint unless
  there is actual independent-event verification, independent score attestation
  and all five enrichment dimensions VERIFIED. A generated draft alone has
  \`is_gro_verified=FALSE\`; no publisher rights or revenue authorization is
  implied. New verified paid/website product publication cannot be inferred
  from the existing **free, explicitly unscored** Website Intelligence journal.
- Protected \`GET /v1/internal/gro-evidence/status\` returns real D1 counts
  plus a matured 15-minute cohort. Only **verified** rows (not five-part
  draft rows) count toward the user-requested 90%/15m acceptance. A cohort
  of zero yields null ratio, **not 100%**.

## #12 Canonical -> Website live freshness
- \`GET /api/v1/feed/geopolitics\`, \`/macro\`, \`/rare_earth\` fetch
  the actual canonical \`website_derived_intelligence\` 72h D1 journal,
  no static build, no Supabase, no B2, with 60-second edge POP cache and
  immutable source-native timestamps.
- The actual website's \`intelligence.tsx\` loader and
  \`StatelessLiveDesk\` 2-minute browser poll prefer these canonical routes.
  Existing R2/static archive remains a properly labeled fallback.
- The feed is **free, unscored research**, not five-part verified scored GRO,
  and does not expose publisher article bodies.
- Website <=3-minute objective additionally depends on an active D1 writer,
  latest exact website deployment, network/browser refresh and a documented
  real D1 insert -> public DOM same-ID acceptance. No cache policy by itself
  proves the end-to-end 3-minute SLO.

## #13 Deployment SHA parity
- Exact deployed main SHA is already represented by
  \`/.well-known/geomacro-build.json\`. Do not create a second fake marker.
- New 15-minute outside-in production workflow and push-triggered check
  compare this real live website marker and the Control Plane \`/health\`
  \`deployed_source_sha\` to the **exact** checked-out main commit.
- A GitHub merge or Lovable mirror sync is **not** accepted as proof of a
  live build. A mismatch FAILS rather than becoming a skipped success.
- Publishing/propagation happens in existing GitHub/Lovable deployments.
  A separate automatic 5-minute deployment completion guarantee is not
  established by this check alone.

## #14 Verified Intelligence edge
- Existing Intelligence Worker already implements verified D1 hot snapshot,
  POP read-through, independently B2-restored and hash-bound continuity,
  plus a quota-governed B2 origin fallback. Its existing D1/B2 source
  authenticity and current clock remain mandatory.
- A real lack of signed, current evidence can legitimately return 503.
  We intentionally do **not** return HTTP 200 with \`data:[]\` as if the
  data were successful, or serve an expired signed object as current risk.
- A continuous 99.9% SLA requires actual interval availability receipts
  and provably current data over an agreed observation window.

## #15 No fake canary
- \`.github/workflows/p2-production-readiness-15m.yml\` checks main SHA,
  D1 Worker, three category feeds, real GRO cohort/health, and real
  Intelligence/Global Risk edge HTTP, on main push and at a best-effort
  15-minute GitHub schedule. Core checks are not skipped and failures
  produce a red live run plus sanitized artifact.
- **Not a synthetic B2 PUT/GET + D1 + same-record website canary.** Such a
  write path must use the existing B2 account quota governor and should not
  place synthetic news into the public research journal. The current
  existing B2 authorization-quota 429 blocker means this true write canary
  has NOT been accepted. We do not replace it with an offline dummy.

## Production release gates (must all be measured)
1. Product CI, scoped Node tests and CodeQL on the exact PR head.
2. Merge to main; remote D1 migration 0120 and exact Worker SHA
   independently verified, not merely PR dry-run.
3. Protected GRO/D1 readback nonzero when real archives exist; no silent
   old pending work, no invalid SHA; measure the 15-minute cohort.
4. Production website exact main SHA + real direct category feed; source
   native clocks unchanged; same D1 item visible on website <=3 minutes.
5. Edge availability measured over a real time interval; no 503 in that
   sample. Do not promise 99.9% based on a single request.
6. A real quota-governed synthetic B2->D1->site write/readback canary remains
   a separate unresolved acceptance requirement.

**No change** to immutable original archive, upstream copyright/licensing,
partner PREDGE, checkout, USDC/PayPal, paid API keys, price tiers or existing
GRO signer trust roots.
