# Automatic internal signed+scored research for every retained canonical news input

**Status:** Source implementation proposed, deployment and first production D1 readback separately required.

## Contract

After an existing protected ingestion workflow completes, `publish-automated-intelligence-inputs.ts` already signs all retained **unique** canonical derived 72-hour journal items (maximum 600) under the approved issuer. The same journal object in memory now feeds the new private scoring module: **no new source crawl, new cron, external AI call or additional news-journal fetch**.

Every single source item, including Geopolitics, Macro/FX, Critical Minerals, publisher candidates and unverified OSINT observations, receives a deterministic, versioned **internal intelligence triage score (0–100)** and a separate cryptographically signed score envelope. A feed candidate is still a candidate; an unverified OSINT observation is still unverified. Low score is not a claim of safety; high score is not an independently assessed risk/severity.

The scoring rules are fixed in `src/lib/internal-news-scoring.ts`: category relevance, observed development type and status-based uncertainty penalty. Unknown event types receive a conservative default **instead of being silently dropped**. Score, input content SHA-256, category, original release clock, exact scoring clock, expiry, source workflow run/commit and provenance class are all inside the Ed25519 signed payload. It is domain-separated from both the signed source-input envelope and current GRO/GRI certificates. A signature establishes integrity/authorship of the internal research assessment, not truth of the underlying publisher.

## Private persistence

The protected Worker route `GET/PUT /v1/internal/signed-news-scores` requires exactly the existing strong control-plane bearer. There is no public site, PREDGE, machine/agent x402 or customer route. The private D1 `control_state` table uses dedicated `internal_signed_news_score_v1:` keys (no migration/new service required). On PUT, the Worker independently verifies:

1. Source input IDs are **exactly** the complete still-retained signed issuer index, with 600 limit; shortened claimed input sets fail closed.
2. Every scored item has a presently stored, unexpired, cryptographically valid signed source envelope with matching canonical input SHA.
3. The scored payload and scoring rubric reproduce exactly from that stored source; a fabricated score cannot pass even with an otherwise valid issuer signature.
4. The score has a valid independent Ed25519 signature under the configured verification-key registry; expiry, key rotation and revoked-key rules apply.
5. All batch entries are unique and bounded at 40. Atomic D1 `batch` inserts only absent score IDs; reruns do not write duplicate score rows.
6. Expired and orphaned score IDs are removed in the same atomic batch. A final authenticated index GET proves every retained input ID has a score row, with a full-envelope verified GET available in pages of 40.

All output is private and uses no source URLs, raw third-party text or upstream publisher identity. Workflow receipts contain category counts and outcome flags only; no signatures/keys or private source body in logs.

## Retention and limitations

The input set is the **existing 72-hour canonical derived journal, capped at 600 unique items**, not literally every raw article ever found worldwide. Source items that never entered the canonical journal cannot be silently claimed signed or scored. If D1 quota, source verification, signing, schema or readback is unavailable, the pipeline fails closed rather than issuing scores for missing inputs. Existing PREDGE and historical ingestion stay untouched.

This feature does **not** independently review originals, approve source licences, produce external analyst certificates, generate a genuine current numerical GRI, update commercial signed Risk Objects or permit real-money payments. Paid API and GRI launch gates remain unchanged.

## Validation and activation

- `bun test scripts/tests/internal-news-score-sqlite.test.ts` validates all three categories, source binding, real in-memory SQLite with the repository's canonical D1 schema, idempotency, original/signature tampering, revocation, expiration and source coverage.
- Existing `Standing Delegated Derived Contract No Funds` contract job runs this test before any live publishing. Successful test/CI **is not deployment proof**.
- Production activation requires the canonical D1 Control Plane deployment with the new route, the existing issuer env/secrets, a subsequent admitted ingestion/signing cycle, and independent authenticated signed-score readback. Record exact deployed SHA, category counts, new/previous score counts and 0 customer/payment actions.
- Verify private endpoint rejects anonymous requests. Never expose `internal_signed_news_score_v1` in public or PREDGE responses.
