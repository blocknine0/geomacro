# Predge v2 signed research-context pilot — isolated implementation

**Status:** branch-only candidate, NOT production-accepted. No existing PREDGE research, D1 Risk Gate, pricing, token, 72h retention or quota implementation was edited. This proposed contract is separate from a signed production GRO or a paid Risk Gate result.

## Surfaces

- `GET /v1/pilot/check`: dedicated opt-in signed **sample** response; research Bearer (existing `PREDGE_RESEARCH_NEWS_TOKEN`) required; no query params. Returns 503 until a genuine, verifiable, non-expired signed sample is owner-published. GET shares the existing Risk Gate D1 client quota: **100/day configured**, 500/day ceiling remains a separate agreement/code change. It does not consume the separate 500/day research-feed polling quota.
- `PUT /v1/internal/predge-pilot-news-context-publish`: owner-only `CONTROL_PLANE_TOKEN`, a verified **active-key** Ed25519 envelope under 1.5MB, atomic single-slot D1 update. `DELETE` on this owner route removes expired samples only. Partner never receives the owner/admin token.
- Existing `GET /v1/partner/predge/derived-structural-72h`, `POST /v1/partner/predge/risk-gate`, and website `POST /api/risk-gate` are untouched.

**This is a read-only pilot sample**, not the eventual request-specific production Risk Gate POST. It always contains `risk_gate.decision=PAUSE` because source-only news cannot substitute for independently verified signed GRO. A consumer must not act on PAUSE, and must not treat the signed news-context wrapper as 150 separately signed products.

## Schema and cryptography

- Envelope schema: `geomacro.predge-pilot-check.v1`; nested `risk_gate.news_context.schema`: `geomacro.predge-news-context.v2`.
- The entire envelope is signed, including news item IDs, original timestamps, all research item fields, source credits/notices, flags, and available/delivered/truncated counts.
- Category list: `geopolitics`, `macro`, `rare_earth`. Bound 0–50 items per category, 0–150 total, 600-entry input limit, 1,500,000-byte signed transport limit.
- `execution_authorized`, `affects_risk_gate`, `market_relevance_verified`, `chargeable` and `signed_product_verified` are always false inside news context. `execution_authorized` also false at envelope and Risk Gate levels.
- Signable framing: take whole parsed envelope and set **only** `integrity.payload_hash=null` and `integrity.signature=null`; recursively sort JSON object keys with JavaScript ordering; encode JSON without whitespace to UTF-8; SHA256 over bytes; Ed25519 signature over the **same** bytes, not digest text. Key identifier fixed at `geomacro-risk-2026-03`.
- Worker verifies against the compile-time pinned SPKI AND its protected active-key trust registry. Both `GET` and owner `PUT` fail closed with HTTP 503 `PILOT_CHECK_ACTIVE_KEY_REGISTRY_UNAVAILABLE` before D1 access if the registry is absent, mismatched, inactive, not-yet-active or retired. Owner-only expired-sample purge remains permitted regardless. No private signing key is installed in Worker; invalid hash, signature, attribution, expired sample or changed news item is rejected.
- Only *current real* authenticated D1 research feed items are accepted by signer. An empty or unqualified category remains empty; no invented content, scoring, market relevance or rights permissions.
- Sample expires one hour after creation. Protected refresh is provisioned as 30-minute opt-in; failure leaves the last sample available only until its original expiry, then HTTP 503. Existing every-minute Worker cron performs a single D1 expired-sample purge at 00:13 UTC daily, whether refresh is enabled or disabled; physical retention is therefore bounded to about 25 hours under successful cron execution. Failed cron runs require independent operational monitoring. Pilot sample access stops at the configured 17 Jan 2027 UTC cutoff.

## Production setup after merge and partner schema agreement

1. Run no-funds regression `node --test scripts/tests/predge-pilot-check-v2.test.mjs` on PR; inspect CI and confirm existing partner tests, no unrelated changes. Do **not** merge before review.
2. Merge only after acceptance, deploy the existing D1 Worker through approved production workflow; ensure migration `0088_predge_pilot_signed_news_context.sql` applied, live route 401 for anonymous and 503 without valid signed sample. Existing Risk Gate and research 200/401/quota tests must remain green.
3. In protected GitHub `production` environment verify existing **secret names**, not values: `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE`, `RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64`, `GEOMACRO_COMMERCE_LEDGER_TOKEN` and the deployment secret `RISK_OBJECT_VERIFY_KEYS_JSON` (must contain `geomacro-risk-2026-03` with status `active` and its exact pinned SPKI). Existing signing key must actually derive the pinned public SPKI. Do not paste any secret into chat, PR or logs.
4. Ask Amir to approve the **GET sample** route, schemas and canonicalization/masking specification. Once a real partner validation is agreed, owner can set repository variable `GEOMACRO_PREDGE_SIGNED_PREVIEW_ENABLED=YES` to enable the protected opt-in refresh. Until then it remains disabled.
5. On protected job, the signer reads one authenticated, unfiltered `attributed_research` feed, signs one PAUSE sample with the pinned private key, verifies it, owner-only PUT publishes it, then GET readback independently verifies signature and hash. Only aggregate counts and hashes are printed.
6. Send the actual response to Amir over mutually approved private delivery path; require independent verification against the pinned public key and deliberate tamper test. Exact HTTP response and key lifecycle matter, not a synthetic fixture.

## Automatic refresh (protected opt-in, no funds)

- GitHub workflow: `.github/workflows/predge-pilot-signed-news-v2-refresh.yml`; schedule `11,41 * * * *` (nominally every 30 minutes, 48 runs per UTC day). GitHub scheduled Actions may be delayed or skipped; this is **not** a zero-gap availability SLA. Signed envelopes expire 1 hour after creation; repeated failures yield 503 rather than stale unsigned context.
- Production job protects all checkout, signing, PUT, and authenticated GET steps behind an exact opt-in. Recurring consent is accepted from existing GitHub Actions variable `GEOMACRO_PREDGE_SIGNED_PREVIEW_ENABLED=YES` **or**, when Actions variables are not visible at runtime, the separate protected GitHub **environment Secret** `GEOMACRO_PREDGE_RECURRING_REFRESH_APPROVAL=PREDGE_V2_RECURRING_NO_FUNDS_APPROVED`. Use the `production` environment, not a committed plaintext file. Never put signing credentials or admin tokens into variables.
- A manual workflow run instead requires its existing one-time `confirmation=PREDGE_V2_SIGN_ONCE_NO_FUNDS`; adding the recurring Secret does **not** waive manual consent. If both scheduled opt-ins are absent, scheduled runs log `PREDGE_PREVIEW_DISABLED_NO_SIGNING_OR_PUBLICATION` and perform **no** signed publish or D1 readback. To stop scheduled refresh, remove the protected approval Secret **and** ensure the Actions variable is not `YES`.
- **Independent wakeup:** in addition to direct cron, a successful canonical-`main` completion of the existing `Three-Domain 30-Minute Original Publisher Pulse` triggers the signer with `workflow_run` (the pulse itself has its own source-intake recovery). Both event paths require the same protected recurring approval; a foreign repository, non-main branch, or unsuccessful upstream completion is rejected at job selection. This is a GitHub Actions backstop, not a guaranteed time-based service.
- **No duplicate signing:** `scripts/ops/check-predge-signed-refresh-cadence.mjs` queries GitHub's read-only workflow and job receipts using the ephemeral Actions token. Only a job whose actual *Generate, locally verify, publish and independently read back real signed envelope* step completed successfully is a confirmed signed publication. A verified success in the preceding 25 minutes skips the duplicate wake. Even apparently successful opt-in-disabled jobs **do not count** as signed success. GitHub API failure fails the signing job closed with an actionable error, never publishing blindly.
- **Daily quota cap:** no more than 48 successful signed runs per UTC day may be followed by additional **automated** signing (manual explicit owner runs remain separate). Each successful refresh consumes one GET from the shared 100/day PREDGE Risk Gate quota and one research-feed read, so 48 automation reads leaves at most 52 for partner calls and independent checks *before* any other usage. If the ledger is already exhausted, the original quota fail-closed response applies. Monitor partner demand and adjust the daily budget/cadence only with approval.
- **Acceptance:** an actual `schedule` **or** trusted `workflow_run` must show `PREDGE_SCHEDULED_PREVIEW_OPT_IN_CONFIRMED`, a `SIGNING_DUE` cadence decision, and `readback_verified:true`; an additional wake close in time must show `RECENT_SIGNED_READBACK_EXISTS` with no signing. Require at least two genuinely automatic successful publish/readbacks in different 30-minute periods, plus duplicate skip evidence, before declaring recurring service production-accepted. No-funds regression does not substitute for production evidence.
- **Operational limits:** scheduled Actions may be delayed or skipped, and upstream failure/API outages can keep a sample stale. If its 1-hour TTL expires, GET returns 503. An alarm/watchdog and a second actual successful wake are required to establish reliability; neither a green disabled job nor a manual dispatch proves recurring continuity. Approval and acceptance by the PREDGE partner remain distinct from technical live-readback.
- The current pilot implementation has a hard stop at **2027-01-17 00:00 UTC**. This automation does not extend the pilot agreement, enable paid GRO, or authorize real execution.

## Data comparison

`node scripts/ops/predge-paired-read-v2.mjs capture /private/ours.json` captures only ID/category/original timestamp tuples from one authenticated read with 0600 output.

Ask Amir for one authenticated read in the same UTC minute and a JSON file containing `generated_at`, `received_at` and those tuples (no article content) through verified private contact. Compare:

`node scripts/ops/predge-paired-read-v2.mjs compare /private/ours.json /private/theirs.json`

A >90-second snapshot or receipt skew gives `DIFFERENT_COHORT_INCONCLUSIVE`, never a false exact-parity claim. Historical October 29 ID sets cannot be recovered from count-only email.

## Required external actions

- Founder: review PR, authorize merge and protected deploy only after CI; confirm protected signer access and opt-in variable.
- Predge: acknowledge optional versioned schema, whole-envelope signature, and GET-sample versus future request-specific POST distinction; coordinate paired read.
- Neither party should treat this pilot sample as paid GRO production, source-rights grant or trading authority. Commercial terms remain governed by the LOI and later separate written agreement.
