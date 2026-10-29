# Durable 195 countries × 3 domains proof + source-outage continuity

Status: implementation in GitHub PR; NO claim of 585 current paid sources. This is a durable-proof policy, not a one-off CI artifact.

## Guarantee actually implemented in code

- All **195 UN member/observer countries × geopolitical, macro, critical minerals = 585 routing cells** are represented in the canonical offline registry. Each cell uses three-valued proof: true / false / unknown. A source directory row is never a real original news item.
- Daily existing **Global Country Readiness Audit** at the protected 06:27 UTC cadence reads the canonical D1 control-plane source runtime and signed finds. Every audit writes a **new SHA-256 content-addressed private B2 object**, including when upstream is down. Each snapshot references its predecessor and exact 64-character SHA. A small `latest.json` B2 head points at the newest; the prior snapshot is independently downloaded, SHA checked, schema validated before appending. The snapshot and pointer are PUT + full byte GET verified with **distinct archival read credentials**. The existing D1 account governor authorizes each B2 call; no new bypasses or new B2 account.
- Before any B2 access, the writer reads the shared D1 account quota and requires at least **20 total / 18 GET / 6 PUT / 2 Native Auth** remaining tickets. It preserves downstream headroom for existing signed producers and locked partner operations rather than spending the final free quota on audit proofs. Every actual B2 operation still reserves atomically. If that buffer is unavailable, the archive job fails red; it does **not** claim that a permanent snapshot was created.
- A failed upstream source read **fails the CI** while preserving an explicit red `SOURCE_RUNTIME_UNAVAILABLE` proof with 585 unknown cells. An unavailable source does not mean 585 countries experienced no events. Previous full B2 receipts remain in their content-addressed paths, and source outage is a new permanent historical observation.
- The previous job's 14-day GitHub Actions artifact is *supplemental only*: persistent proof lives in private B2, not solely in the expiring Actions artifact.
- No credit card, wallet, paid subscription, real payment, source-content leak, PREDGE I/O, new autonomous source-certification or publisher-rights shortcut.

## Permanent source-failure strategy (not an impossible 100% uptime claim)

- **Primary source / independently approved standby** are modeled per country and category, not globally inferred from a World Bank or news landing page.
- HTTP 401/403/404 -> operator/legal route review; **no credential rotation or proxy circumvention**.
- HTTP 429 -> one-hour circuit open; timeout/5xx -> bounded 15-minute backoff; invalid source payload -> one-hour review delay. Future scheduled cycles may retry after budget/admission, never aggressively.
- A standby source must have its own country-matched first-party original, source-native publication clock, verified rights, independent corroboration/review and real availability. A candidate's `available` status never grants checkout.
- **Last known good** remains durable with SHA, measurement timestamp and provenance. It may appear as historical/reference context with explicit age; NEVER relabeled as fresh, breaking, current signed event, or paid output.
- Independent source families are not conflated; two URLs from one agency don't constitute corroboration. Source identity stays server-side.
- Source continuity requires an actual publisher to supply independent qualifying evidence. Some small states/rare-minerals lanes will legitimately have zero current originals; coverage routing can be global without inventing news.

## Independent GitHub SHA witness when D1 or B2 is unavailable

The existing daily audited main workflow independently appends a **redacted** status-and-hash-only comment to [GitHub issue #3102](https://github.com/blocknine0/geomacro/issues/3102) using an `issues:write` job-scoped GitHub token. This step runs even after a source-read error and **before** the D1 account quota/B2 archiver. It needs no external news fetch, D1 query, B2 transaction, payment, private article rights, or merchant API key. The stored witness contains exactly the protected main SHA, run and attempt, UTC audit clock, 195×3 denominator, red/green source-runtime audit state and SHA-256 of the original private audit document.

No publisher names, source URLs, raw article text, country-lane internal flags, PREDGE or customer information are posted to GitHub. The SHA comment is an independent **audit-occurrence anchor**, not a complete data backup; private full 585-lane evidence still belongs in B2. The GitHub issue history is longer-lived than the 14-day Actions artifact, but comments can still be deleted by authorized administrators. For strict irreversible legal retention, use owner-approved B2 compliance-mode Object Lock on a purpose-scoped bucket, not automatic default retention on a shared operational bucket.

## Physical durability limits

The B2 writer is append-only by code, not storage-enforced WORM. The latest pointer is intentionally replaceable, and an administrator with B2 delete/write permissions could still alter/delete objects. For stronger legal/irreversible retention enable a provider-supported Object Lock/retention policy with a verified separate owner approval; this PR cannot fabricate an account feature or retention guarantee.

If B2 quota, D1 governor, key, upstream, or access is unavailable, permanent proof upload itself fails closed and CI stays red. Prior archived proof is not erased. **No system can guarantee future record persistence if all independent storage services are unavailable or data is deleted.** A separate read-only cross-region replication route and restore drill should be commissioned before claiming disaster-proof retention.

## Proof acceptance

1. `node --test scripts/tests/195x3-source-continuity.test.mjs`
2. `bun test scripts/tests/195x3-durable-proof-chain.test.ts`
3. Daily `Global Country Readiness Audit`: inspect SHA-linked B2 snapshot and head and independent byte readback. A simple workflow PASS without these receipts is not permanent proof.
4. Verify the previous snapshot remains readable after a subsequent outage or update. Confirm B2 quota ledger debit for each operation; watch for `PUBLISH_NOT_VERIFIED` and failed provider reads.
5. Distinct tests still required for real per-country current originals, source rights, D1 hot state, accepted signed country category object, buyer 402 prequote and first real-USDC delivery. **Do not set commercial flags based on this archive.**

No changes to PREDGE source, workflow, code, credentials, quota, contracts, client operation or auth.
