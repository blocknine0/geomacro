# Signed hot-snapshot TTL: permanent fail-closed pre-expiry detection

## Reality of the original-source clock

The three legacy products are **time-bounded attestations, not forever-current assets**. An unchanging signed original can be verified historically forever, but **current intelligence cannot be made permanently fresh by extending `expires_at`, rotating a cache TTL, or changing a B2/D1 restore timestamp**. Artificial renewal would be an invalid product and a potential chargeable-data defect.

Founder-approved revised signed *reference validity* policy: Intelligence <= 720 minutes (12 hours); Global Risk and Risk Indices <= 180 minutes (3 hours). **Live/current / paid-source freshness still requires <= 60 minutes** against the native original source clock. A still-valid 75-minute-old proof is a signed reference, not live current data. Machine-qualified Intelligence may have an independently signed `qualified_until` shorter than 12 hours; never extend it. The previously expired records remain expired, and monitoring does not resurrect them.

## Prevention now in repository

- `.github/workflows/signed-hot-pre-expiry-guard.yml`: on protected `main`, manual dispatch and GitHub Actions schedule at minute 09 and 39 of every hour. It executes exactly ONE bounded remote read-only Cloudflare D1 query for **three rows of metadata only**; no B2 object GET, no source texts, no D1/Supabase writes, no payments, no new GRO signing, no quota bypass. Scheduled workflow can be delayed by the runner, and reads are subject to GitHub/Cloudflare availability; this is an early warning, not a freshness guarantee.
- `scripts/ops/watch-signed-hot-expiry.mjs`: uses the existing independently tested D1 classifier. It warns two hours before the 12-hour Intelligence native validity expiry and one hour before the 3-hour GRI/Indices validity expiry; it also marks live freshness unavailable after 60 minutes even when the signature/reference is still valid. It computes the **earlier** of `(source_as_of + maximum permitted age)` and the immutable `expires_at`, not a newly polled clock. Missing, invalid, future, expired or short-window products fail the Action and appear in the step summary. No false PASS when a single product is absent.
- Existing protected publishers are the ONLY allowed route to genuinely fresh signed proof. They must validate independently supplied rights/evidence and exact immutable B2 pins, write only under the account quota governor and verify full B2 readback + D1 public hash. Risk Indices' existing downstream verified-GRI-parent workflow continues automatically after an authorized genuinely successful GRI publication. No cron blindly invokes a publisher with absent review evidence or fabricates an external reviewer.
- Existing `GET /api/health?deep=1` and buyer x402 health **remain 503/no-charge** while genuine signed proofs are missing. The user-selected unsigned stateless structured product is already separately monitored at `?deep=1&profile=live-structured`; it does not require these historical signed snapshots.

## Operator action when alert fires

1. Inspect the failed `Signed Hot Snapshot Pre-Expiry Guard` job summary. Its metadata-only rows show missing, expired, invalid and lead-window states, not sensitive input.
2. If new legitimately original, qualified, signed data exists, invoke the existing `Machine Dual-Authority Intelligence Publication` or `Supabase-Free Reviewed Intelligence Publication` with independently supplied **immutable key + SHA**; and/or `GRI v1.2 Supabase-Free Current Promotion` with both independently reviewed input and country-category certificates. Keep protected environment checks, no funds and production exact-SHA gates.
3. After GRI publication, let `Risk Indices from Verified D1 Global Risk` run on its existing workflow-run relationship, then verify three public hot endpoints and true `/api/health?deep=1` HTTP 200. On missing inputs, investigate approved original-source discovery, rights/certification or credential/quota blockers; do not invoke a blind TTL renewal job.
4. If source rights, review, freshness or provider availability fails, leave old signed products in **historical/unavailable** state, do not bill and use the genuinely stateless unsigned structured lane for supported live on-demand queries.

## What is and is not closed

Code-level pre-expiry protection and monitoring can be merged and inspected by CI. The specific **already-expired October 2026** Intelligence, GRI and Indices values are NOT restored by this change. Continuous 24/7 verified current signed publication cannot be guaranteed until a source-to-independent-review-to-signed-publisher supply is independently production-proven at least as frequently as the native product window (with adequate operating margin). The latter remains a distinct open recovery acceptance, and historical B2 archives never become current automatically.

Source: `scripts/ops/classify-d1-hot-metadata.mjs` and the protected publisher workflows. See master issue #1827 and hot-serving #2046.