# GeoMacro Hot-50 production activation — fail-closed runbook

**Canonical repo** `blocknine0/geomacro`, `main` only. **Scope** 50 exact ISO-3 countries × Geopolitics, Macro/FX, Critical Minerals. The current reviewed GRI v1.2 scoring and genuine reviewer certificates remain the sole authority for *numerical certified Risk Indices*; GeoMacro self-certified HMAC news severity, Groq text, signed Risk Gate provisional scores and OSINT observations must never substitute.

## 1. Production deployment and D1 schema (protected environment only)

On the main-push `.github/workflows/deploy-d1-control-plane.yml` the existing protected Cloudflare secrets and quota preflight are checked. The migration runner applies all committed migrations, including `0201_progressive_risk_gate_facts.sql` and `0202_hot50_activation_audit_views.sql`, before the Worker deploy. The Worker retains existing `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_SPOOL_ENCRYPTION_KEY`, `CONTROL_PLANE_TOKEN` and `RISK_GATE_DECISION_ED25519_*` bindings; **do not create a new Groq key, GRI signer or reviewer credential**.

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

The D1 SQL zero-pending condition is **necessary but not sufficient**. All six integer columns in `v_p0b_unhandled_activation` must be zero, the protected real provider Queue `backlogCount` must be precisely zero, and physical B2 parity must independently pass. `QUARANTINED` and `DEAD_LETTER` are not silent successes.

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

The independent **physical** audit is read-only and uses the existing `scripts/ops/b2-s3-client.mjs` with the shared B2 D1 quota governor. Full bucket listing is mandatory for 100% *bidirectional* parity; a D1 pointer table is **not** the B2 bucket manifest. Use the existing authorized B2 scoped key with `s3:ListBucket` rights, restricted to the already-owned prefix, and the AWS CLI:

```sh
export AWS_ACCESS_KEY_ID="${B2_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${B2_APPLICATION_KEY}"
export AWS_DEFAULT_REGION="us-east-005"
aws s3api list-objects-v2 --endpoint-url https://s3.us-east-005.backblazeb2.com \
  --bucket geomacro-private-archive --prefix geomacro-evidence/v1/spool/ \
  --output json > /tmp/geomacro-b2-complete-spool-list.json
# Verify the JSON result says IsTruncated:false, with all Contents pages included.
export B2_BUCKET_MANIFEST_JSON=/tmp/geomacro-b2-complete-spool-list.json
export B2_ACCOUNT_QUOTA_REQUIRED=1
export B2_REQUEST_BUDGET=250
export PARITY_MAX_B2_READS=250
export B2_SPOOL_PREFIX=geomacro-evidence/v1/spool/
node scripts/ops/audit-hot50-b2-d1-parity.mjs
```

If archived objects exceed 250 or B2 quota is insufficient, the check **fails as partial**. Reconcile in explicitly budgeted windows and produce a **separate complete snapshot** to make a final 100% claim; do not combine partial scans as a fabricated complete same-time snapshot. On quota exhaustion, stop safely.

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
