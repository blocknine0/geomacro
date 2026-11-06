# GeoMacro Hot-50 production activation — fail-closed runbook

**Canonical repo** `blocknine0/geomacro`, `main` only. **Scope** 50 exact ISO-3 countries × Geopolitics, Macro/FX, Critical Minerals. The current reviewed GRI v1.2 scoring and genuine reviewer certificates remain the sole authority for *numerical certified Risk Indices*; GeoMacro self-certified HMAC news severity, Groq text, signed Risk Gate provisional scores and OSINT observations must never substitute.

## 1. Production deployment and D1 schema (protected environment only)

On the main-push `.github/workflows/deploy-d1-control-plane.yml` the existing protected Cloudflare secrets and quota preflight are checked. The migration runner applies all committed migrations, including `0201_progressive_risk_gate_facts.sql` `0202_hot50_activation_audit_views.sql`, and `0203_hot50_activation_fail_closed_views.sql`, before the Worker deploy. The Worker retains existing `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_SPOOL_ENCRYPTION_KEY`, `CONTROL_PLANE_TOKEN` and `RISK_GATE_DECISION_ED25519_*` bindings; **do not create a new Groq key, GRI signer or reviewer credential**.

For an authorized local Cloudflare operator with Wrangler credentials already configured:

```sh
cd workers/control-plane
npx -y wrangler@4.136.3 d1 migrations apply DB --remote --config wrangler.runtime.jsonc
npx -y wrangler@4.136.3 d1 execute DB --remote --config wrangler.runtime.jsonc \
  --command "SELECT * FROM v_p0b_unhandled_activation;"
npx -y wrangler@4.136.3 d1 execute DB --remote --config wrangler.runtime.jsonc \
  --command "SELECT country_iso3,category,observed_events,original_dated_events,same_event_independent_pair,evidence_state FROM v_hot50_three_category_evidence WHERE evidence_state='EMPTY';"
npx -y wrangler@4.136.3 d1 execute DB --remote --config wrangler.runtime.jsonc \
  --command "SELECT COUNT(*) AS cells, SUM(evidence_state='EMPTY') AS missing FROM v_hot50_three_category_evidence;"
```

The D1 SQL zero-pending condition is **necessary but not sufficient**. All seven integer columns in `v_p0b_unhandled_activation` must be zero, the protected REST `backlog_count` for all four provider queues must be precisely zero, and physical B2 parity must independently pass. `QUARANTINED` and `DEAD_LETTER` are not silent successes.

## 2. Bounded FIFO redrive and exact census

Authenticated with the **already existing derived** root-admin bearer in a protected shell. The operation is strictly bounded (two encrypted outbox batches, 100 FIFO queue entries, two R2 fallback batches), and every path retains CAS leases, idempotency fingerprints, quota gates and B2 GET/hash/readback.

```sh
export GM_WORKER="https://geomacro-control-plane.daspallab202391.workers.dev"
# CONTROL_PLANE_TOKEN is derived only inside the protected main deployment.
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${CONTROL_PLANE_TOKEN}" \
  -H "Content-Type: application/json" -X POST \
  "${GM_WORKER}/v1/internal/activation/redrive"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${CONTROL_PLANE_TOKEN}" \
  "${GM_WORKER}/v1/internal/activation/hot50-census"
```

Never print the bearer, ciphertext, raw articles, B2 credentials or publisher identifiers. Repeat bounded redrive only while permitted by the account-wide governor. The existing ten-minute cron is already configured for ongoing replay; **do not add another ungoverned queue loop**.

## 3. Independent B2 PUT → GET → SHA → D1 canonical readback → ACK

The live producer is `src/workers/ingest-producer.ts`, consumer `src/workers/ingest-bundle-consumer.ts`, outbox `src/workers/p0b-transactional-outbox.ts`, and B2 implementation `src/storage/b2-spool-manager.ts`. Producer first journals encrypted pending D1 state, then encrypted B2 PUT followed by independently fetched S3 GET and SHA-256, AES-GCM decrypt, gzip restoration and member-identity check. It commits canonical item/bundle D1 rows idempotently (unique candidate fingerprints), re-reads exact persisted D1 state and only then ACKs Queue messages. On failure, keep pending lease or retry; never ACK on unverifiable object.

The independent **physical** audit is read-only and uses the existing `scripts/ops/b2-s3-client.mjs` with the shared B2 D1 quota governor. Full bucket listing is mandatory for 100% *bidirectional* parity; a D1 pointer table is **not** the B2 bucket manifest. The audit now obtains every `ListObjectsV2` page directly through the same governed client; externally supplied or manually marked manifests are not accepted. Every list attempt consumes a shared GET ticket. Listing and read credentials must have prefix-scoped list/download permissions.

```sh
export B2_ACCOUNT_QUOTA_REQUIRED=1
export B2_ACCOUNT_QUOTA_WORKFLOW_ID=hot50_production_proof
# Existing account ID/token and canonical quota-ledger D1_DATABASE_ID required.
# Example bounded invocation; shared daily limits remain authoritative.
export B2_REQUEST_BUDGET=12
export PARITY_MAX_B2_READS=10
export B2_SPOOL_PREFIX=geomacro-evidence/v1/spool/
node scripts/ops/audit-hot50-b2-d1-parity.mjs > /tmp/geomacro-parity.json
export B2_PARITY_VERIFIED_RECEIPT_JSON=/tmp/geomacro-parity.json
node scripts/ops/verify-hot50-production-activation.mjs
```

The audit independently lists the owned spool prefix, GETs and decrypts every referenced archived outbox batch, and compares both directions. It then reads the complete D1 manifest and physical B2 key listing again and compares sorted SHA-256 commitments, detecting count-preserving D1 changes and new/deleted B2 keys. A receipt is accepted only for the same production origin, exact GitHub commit and run ID, within ten minutes, with matching live archive count and no bundle-journal mismatch. This is an observed stable scan, not a provider-wide serializable snapshot. Unknown queue states count as unhandled. Empty D1/B2 archive sets never prove an independent object GET: activation parity requires at least one actual archive readback and no pending outbox batches. Physical archive parity and provider-queue emptiness are separate gates.

If archived objects exceed 250 or B2 quota is insufficient, the check **fails as partial**. Reconcile in explicitly budgeted windows and produce a **separate complete snapshot** to make a final 100% claim; do not combine partial scans as a fabricated complete same-time snapshot. On quota exhaustion, stop safely.

### Fresh evidence and confidence qualification — per Hot-50 ×3 cell

The protected matrix uses **exact 150 cells** from `RISK_GATE_HOT50` (50 unique country ISO3 values and exactly `geopolitics`, `macro`, `rare_earth`). Each persisted derived observation requires:

- `country_iso3` canonical ISO-3, `category` exact enum, `event_fingerprint` stable 64-character SHA-256, `publisher_domain` deduplication domain, `canonical_source_url`, `event_clock` ISO-8601, `observed_at` ISO-8601, `clock_basis` in `ORIGINAL_PUBLICATION` or `INDEX_OBSERVED`, and bounded `extracted_entities_json`. Never store raw publisher expression in these fields.
- Source-native event publication clock must be within the trailing 72 hours (never use collector fetch time as event time), with original-page/source-native verification before the publisher can count as independent. Transport status 200 alone is not article-original proof.
- Independent corroboration requires at least **two distinct original publisher domains on the SAME `event_fingerprint`** within the same country/category and evidence window. Two redistributed copies from one source, index hints, Google News and OSINT leads are insufficient.
- **Confidence/authority class `EMPTY`**: no eligible recent metadata, no numeric score. **`INDEX_ONLY`**: index observation, research only, no proof of original. **`NATIVE_DATED_METADATA`**: at least one source-native original, not reviewer-certified. **`METADATA_CORROBORATED`**: two independent same-event originals, still not a certified index. **`CERTIFIED`** is a separate, stronger predicate requiring the existing independently signed reviewer approval, verified source rights, authenticated country/category certificate, signed GRI v1.2 scoring and complete historical B2/D1 proof. The metadata matrix never assigns `CERTIFIED` or invents a numeric confidence probability.

Useful SQL:

```sql
SELECT country_iso3, category, evidence_state, observed_events,
 original_dated_events, same_event_independent_pair
FROM v_hot50_three_category_evidence
ORDER BY country_iso3,category;
SELECT country_iso3,
 SUM(evidence_state<>'EMPTY') AS nonempty_categories,
 SUM(evidence_state='METADATA_CORROBORATED') AS original_two_source_categories
FROM v_hot50_three_category_evidence GROUP BY country_iso3;
SELECT COUNT(*) AS all_cells, SUM(evidence_state='EMPTY') AS empty_cells,
 SUM(evidence_state='METADATA_CORROBORATED') AS two_source_cells
FROM v_hot50_three_category_evidence;
```

A coverage matrix assembled from metadata is **never** an independent reviewer certification result. The activation CLI also checks all four Cloudflare Queues via the official best-effort REST metrics (including two DLQs), because the Worker has no DLQ producer binding.

## 4. Three certified Risk Indices and watchdog

The only eligible publisher is the existing `gri-v12-supabase-free-reviewed-current.yml`, invoked after immutable owner-approved input and independent reviewer/country-category certificates exist, with source-clock, independent same-event verification, rights, historical lineage, canonical GRI v1.2 scoring and the existing GRI publisher checks passing. The repo `scripts/ops/require-pallab-owner-signed-gri-ready.mjs` and `scripts/lib/supabase-free-gri-v12-current.mjs` enforce these requirements. No fake input, new signer, machine triage substitution or clock extension is allowed.

On genuine publication, `scripts/ops/publish-risk-indices-from-verified-global-risk.mjs` performs B2 PUT/GET/hash and D1 readback. The new public Worker endpoint `/v1/public/reviewed-risk-indices` checks that exact parent and all three current signed readings before issuing a second **GeoMacro Ed25519 delivery signature** with public verification headers. Public key material is available at `/v1/public/risk-gate-decision-key`; the private key stays bound to Cloudflare only. The issuer's signature **does not replace independent reviewer certification**. The same-origin website `/api/public/reviewed-risk-indices` validates the signature and returns 503 with no score when evidence is missing. The Risk Indices page displays three explicit unavailability cards rather than endlessly animating a spinner or showing triage values.

```sh
curl -i --fail-with-body \
 "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/reviewed-risk-indices"
curl -i --fail-with-body "https://geomacro.live/api/public/reviewed-risk-indices"
node scripts/ops/verify-risk-indices-live-continuity.mjs
```

A 503 or missing index is **a blocker** requiring genuine reviewer-approved inputs. It is not an authorization to generate certified scores automatically.

## 5. Ask GeoMacro, unchanged Groq generation and one D1 cache write

The three exact current index queries retrieve the verified public Ed25519 reading server-side, never via unreviewed news titles. Other questions keep the existing Groq model, pricing, cache revision, API key, allowed categories and logic; no rewrite or key rotation. `scripts/ops/verify-live-free-groq-ask.mjs` verifies the three categories and distributed repeat cache via the published website, including failure if the site SHA does not match the expected main commit.

The read-only/one-write cache acceptance uses the preexisting Groq-derived `ASK_PUBLIC_MODEL_CACHE_TOKEN` HMAC namespace, validates **GET miss → PUT once → GET hit** and emits no question or private content. Set `ACTIVATION_ALLOW_MODEL_PROBE=1` to also run two real harmless questions on the Free Groq path. These checks **measure** actual additional calls/latency; they do not assert physically zero network latency.

```sh
# Inside the existing protected production Action only:
export ACTIVATION_ALLOW_MODEL_PROBE=1
export ACTIVATION_RUN_IDEMPOTENT_REDRIVE=1
node scripts/ops/verify-hot50-production-activation.mjs
```

### Final acceptance contract

Report exactly five statuses: **Backlog Census, B2-D1 Parity, Hot 50 Coverage, Index Signing, Ask GeoMacro Retrieval**. A missing provider backlog reading, missing B2 ListObjectsV2 manifest, insufficient B2 GET quota, missing original-dated Hot-50 cell, stale reviewed GRI score, absent independent reviewer certificate, stale deployed website or failed cache proof must produce **FAIL**, never synthetic **PASS**. A successful `git merge`, a new Worker URL or source registry seed alone does not prove production end-to-end coverage.

## 6. Protected automated report

`hot50-production-activation-proof.yml` runs after the canonical D1 deployment completes (including failed deployment attempts), or by explicit main-only dispatch. It derives the existing capabilities without changing any runtime secret, resolves the existing D1 database without creating one, attempts the governed physical audit, invokes one bounded existing FIFO/outbox/R2 redrive, and uploads no-content JSON artifacts even on failure. The acceptance job exits nonzero unless all five gates pass. Missing reviewer inputs, partial read budgets, denied listing permission and unknown provider metrics remain FAIL.

```sh
gh workflow run hot50-production-activation-proof.yml --repo blocknine0/geomacro --ref main
gh run list --repo blocknine0/geomacro --workflow hot50-production-activation-proof.yml --limit 5
gh run download RUN_ID --repo blocknine0/geomacro --name hot50-production-proof-RUN_ID
```

Ask acceptance compares each of the three exact named-index SSE answers against the verified public signed score and source timestamp. General inflation probes separately prove the existing Groq formatter and distributed cache reuse. Per-index elapsed milliseconds are recorded; a single probe cannot prove zero latency regression, so that claim remains explicitly unproven. No extra model invocation is added to the production retrieval path.

To assert D1 logical zero without hiding a mismatch:

```sql
SELECT CASE WHEN outbox_pending+queue_unhandled+bundles_unhandled+r2_pending+
 historical_unarchived+outbox_bundle_mismatch+outbox_item_mismatch=0
 THEN 'PASS' ELSE 'FAIL' END AS d1_logical_zero
FROM v_p0b_unhandled_activation;
```

Authentic reviewer publication requires immutable `reviewed_inputs_b2_key`/SHA-256 and `reviewed_certificates_b2_key`/SHA-256, plus the independently pinned reviewer public key admitted by `verify-gri-independent-reviewer-pre-b2.mjs`. Supply these through the existing protected reviewed-current publisher. Existing decision delivery keys authenticate delivery only and cannot satisfy the independent reviewer identity check.


### Recovery coordinator and deadline isolation

`node scripts/ops/redrive-hot50-ingestion.mjs` invokes only the existing protected bounded recovery route, at most 60 rounds within eight minutes. Each Worker operation still reserves the same shared account quota. The coordinator stops on a provider/circuit/quota hold, an unverifiable HTTP result, an unsuccessful replay, no archive progress, or exhaustion of its bounded window. It never turns an empty dispatch selection into a zero-backlog assertion: future retry deadlines, leases, dead letters and historical rows still require the independent census.

The protected proof workflow runs recovery before physical auditing, then reports all five gates even if recovery fails. Its local audit ceiling is 240 object reads/250 total client attempts to cover the observed 107-batch backlog; existing account-wide daily caps are unchanged and can refuse earlier. A recovery HTTP timeout leaves the Worker CAS lease and ciphertext intact; it no longer skips the census. The acceptance report records actual account quota usage/limits and holds. The manual verifier's optional single recovery call permits a 130-second response deadline; a timeout never authorizes ACK or a concurrent replacement lease.
