# GRI v1.2 — independently reviewed numerical input to immutable B2 and the protected publisher

Purpose: eliminate manual JSON/key/dispatch mistakes AFTER genuine independently reviewer-signed three-category event packages and country certifications exist. Does not invent source permissions, sign as reviewer, or activate USDC.

## Real prerequisites

1. At least one new source-native original event within 90 minutes, verified independently, later than the historically published GRI snapshot, with two actual independent same-event original publishers and source-specific lawful derived-use rights. Retained originals in other domains may date back up to 72h only with the distinct signed portfolio profile and current counterevidence review.
2. An approved independent reviewer signs the exact GRI v1.2 input containing reviewed derived customer rows, canonical scored events, original evidence packages, clocks, B2 historical key/hash and three-domain portfolio.
3. Separately reviewer-signed current per-country/per-category CERTIFIED certificates with exact original-source registry IDs. Publisher/site country coverage is not a certificate.
4. Exact previously signed and validated historical GRI B2 archive bytes and independently pinned SHA-256; do not generate or relabel historical baseline.
5. Independent reviewer private signing key stays outside GitHub Actions; the running verifier uses only the approved, pinned reviewer public key.

## Offline no-credentials staging

Privately set GEOMACRO_REVIEWED_GRI_PATH / GEOMACRO_REVIEWED_GRI_SHA256; GEOMACRO_COUNTRY_CERTIFICATES_PATH / GEOMACRO_COUNTRY_CERTIFICATES_SHA256; GEOMACRO_HISTORICAL_B2_READBACK_PATH / GEOMACRO_HISTORICAL_B2_READBACK_SHA256; GEOMACRO_REVIEWED_INTELLIGENCE_PATH / GEOMACRO_REVIEWED_INTELLIGENCE_SHA256. Each PIN must be computed independently from the full exact input bytes. Supply GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM and its independently approved public-key SHA pin.

Run: bun scripts/ops/verify-three-domain-reviewed-handoff.mjs --prepare-immutable-b2

This runs the existing independent reviewer three-domain handoff AND scored-input preflight before creating private 0600 files under artifacts/private-reviewed-gri-b2-staging. It writes exact signed reviewer envelope, exact signed country certificates and a SAFE metadata-only receipt; no signing, B2, D1, source text logging or payments.

Reviewed input immutable key: geomacro-evidence/v1/private/reviewed-gri-current/<sha256>.json
Country certificates immutable key: geomacro-evidence/v1/private/reviewed-country-certification/<sha256>.json

## Authorized B2 upload and readback

On an authorized private publisher machine, independently configure real B2 credentials, the pinned reviewer public key, the same exact private inputs and shared D1 account-wide B2 quota governor. Required B2_ACCOUNT_QUOTA_REQUIRED=1, B2_REQUEST_BUDGET=6, B2_ACCOUNT_QUOTA_WORKFLOW_ID=gri_signed_input_staging, D1_DATABASE_ID, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and GEOMACRO_COMMERCE_LEDGER_TOKEN. Do not enable Supabase/coinbase credentials.

Run: bun scripts/ops/stage-approved-reviewed-gri-private-b2.mjs --stage-approved-review-no-funds

Source and country signatures, original clocks, commercial-source review assertions, three-domain cells and pinned B2 historical hash are checked before creating a network client. Per run the strict budget permits 2 existence GETs, at most 2 PUTs and 2 exact GET readbacks. An existing key with differing bytes is never overwritten. An old approval cannot gain freshness from a late B2 upload.

Optional, independently approved auto-dispatch: set GRI_SIGNED_READY_DISPATCH_ACK=YES_NO_FUNDS and an appropriately scoped GITHUB_TOKEN. Only after exact two-key B2 readback, the CLI emits the existing gri_reviewed_current_ready repository event with SHA/key pointers only. GitHub gets no upstream articles or private bundles. Accepted GitHub dispatch means trigger accepted, not current GRI score or product published.

Without the extra dispatch approval, manually pass the returned two exact key/SHA pairs to the protected gri-v12-supabase-free-reviewed-current.yml workflow or its independently approved signed-ready backstop. The existing canonical publisher recomputes v1.2, verifies real new original against original historical snapshot, B2 gzip SHA, current snapshot, public D1 readback and wakes verified Risk Indices after success.

## Denials and limits

- Raw source bytes/URLs, licensed articles, private keys and reviewed/certified JSON are NEVER sent to public B2, website, customer API or GitHub build artifacts.
- Geomacro's owner-created structured-output licence cannot authorize use of other rightsholders' articles, third-party datasets or bypass legally required attribution.
- Missing source licence, reviewer or certificate, no new native original, stale reviewer, insufficient prior B2 history, B2 quota cap, SHA mismatch, wrong production SHA and missing D1 readback all remain fail-closed.
- No fake historical timestamp, no self-certified independent original, no synthetic commercial score, no automatic USDC settlement or Supabase reactivation.
- A staged input is not production acceptance. Check live numerical GRI and Risk Indices plus HTTP deep-health independently.
