# Machine dual-authority Intelligence publication

The external-reviewer publisher remains unchanged. This adapter accepts the
existing independently facts/rights-signed machine event proof using the
existing approved public-key pins and original-page/rights-registry checks.
It does not create a signature, key, event, legal permission or payment.

## Existing owner material

The existing `geomacro-machine-authority-keys-20261016.zip` is a key bundle,
not current event evidence. Keep issuer private keys with their respective
custodians. This publication workflow needs only the already configured
facts, rights and GRO public keys/pins; it must never receive issuer private
keys. Use the existing offline issuer CLI separately for each role after
actual source/permission verification. No key rotation is needed here.

## Private input preparation

Collect 3–12 existing `geomacro.private-machine-commercial-request.v1`
requests in an owner-only file outside the checkout:

```json
{"schema":"geomacro.private-machine-intelligence-batch-request.v1","events":[]}
```

The empty example deliberately cannot qualify. At least one real event in
each of `geopolitics`, `macro`, `rare_earth` is required. Each event needs two
to four independent originals with real HTML byte hashes, matching native
clocks, article-specific no-attribution permissions and the actual distinct
facts/rights signatures on the identical existing proof. The original
`event.title` must be a derived `Geomacro finds ...` title; an optional
`event.structured_payload.public_summary` is also covered by both signatures.
Changing either after signing invalidates the proof. Delta is always null;
the adapter does not invent a score or a change from a previous score.

Set `GEOMACRO_PRIVATE_REVIEW_DIR` to the existing owner-only directory and
use the existing trusted public configuration. Run:

```bash
bun scripts/ops/prepare-machine-intelligence-publication.ts \
  --input=/secure/geomacro-private/current-machine-batch.json \
  --out=/secure/geomacro-private/current-machine-intelligence.json
```

This rereads actual originals and the governed source-rights registry and
writes a 0600 bundle with exactly `rows` and `eventPackages`. Its receipt
contains the exact file SHA and immutable private B2 key. Use the existing
governed private archive uploader to store those exact bytes, then manually
run **Machine Dual-Authority Intelligence Publication** on main with
`machine_b2_key` and independently verified `machine_b2_sha256`. Never place
the input bundle, raw originals, licence files or private keys in Git, public
artifacts or Actions input text. The workflow accepts a key and SHA only.

## Publication and serving

The new operator checks distinct authority pins before the private input GET.
It qualifies every signature, exact signed event/public-row binding,
same-event originals, native dates, commercial rights and three-domain
coverage before creating the archive writer. It reuses the existing shared
D1 B2 quota governor and publication transport: content-addressed private
bundle plus exact gzip readback, public derived latest plus readback, proof
plus readback, qualification recheck, authenticated D1 promotion and actual
unauthenticated public D1 byte/hash readback. Supabase remains absent.

Machine proof schema is `geomacro.public-intelligence-machine-live-proof.v1`,
with profile `GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1` and
`external_reviewer_attested:false`. It cannot be passed off as the legacy
external-reviewer proof. Public D1 stores the distinct proof schema; health,
Intelligence edge and readback/audit tools recognize it without changing
their freshness, payload-hash, three-category or B2 readback requirements.

D1 expiry is bounded by the earliest real original age limit, permission
expiry and machine proof expiry. Machine edge responses are `no-store`; a
retained cached copy is rejected after its qualification deadline. Expiry
never becomes a new source date. External-reviewer product TTL is unchanged.

## Acceptance limits

Synthetic tests demonstrate code contracts only. No real qualifying batch
was present in the accessible file search during this implementation. No
machine product has been published by these changes. They do not create
current GRI v1.2, country certifications, Risk Indices, external partner
approval, deep-health HTTP 200 or x402 settlement. Those remain separate real
input and deployed readback acceptance gates. No funds are enabled.
