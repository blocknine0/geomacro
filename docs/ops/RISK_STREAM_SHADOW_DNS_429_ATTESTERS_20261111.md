# Shadow DNS, attesters, and GDELT 429 recovery — 2026-11-11

## Trust and execution boundary

This change operates **only** the existing isolated `geomacro-risk-stream-shadow` resources. The governor comparison reads the **live production control-plane D1 quota ledger** without writing it. A shadow Worker/isolated shadow D1 is **never** accepted as a surrogate for production governor parity. No B2 calls, paid delivery, customer debits, certified risk indices, production migration, or canary-hold release are authorized.

## DNS fallback

`node scripts/ops/verify-risk-stream-b2-live-governor.mjs` first probes `api.geomacro.live`; ENOTFOUND/EAI_AGAIN or approved transient route failures trigger a **pinned** `https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/status` authenticated read. HTTP 401/403, invalid schema, mismatched date/limits, incomplete counters or unauthorized route never produce PASS. The output records the selected route and whether fallback was used.

The protected workflow treats governor failure as failure, not a disguised PASS, and retains the B2/provider quota distinction.

## Independent attester key provisioning (owner action)

Do **not** generate attester keypairs inside the workflow or derive them from the ledger-root or shadow GRO signer. Obtain **two separately controlled public Ed25519 SPKI DER files** from the independent original-facts and commercial-rights attesters. Confirm ownership and key fingerprints out of band. No private attester key enters GitHub, Cloudflare, or this repository.

In an authenticated WSL checkout:

```bash
export FACTS_SPKI_DER_PATH=/private/keys/original-facts-public.spki.der
export RIGHTS_SPKI_DER_PATH=/private/keys/commercial-rights-public.spki.der
bash scripts/ops/install-risk-stream-shadow-attesters.sh
```

This verifies the public-key encoding and distinctness, then installs `RISK_STREAM_MACHINE_FACTS_SPKI_B64` and `RISK_STREAM_MACHINE_RIGHTS_SPKI_B64` into the protected GitHub `production` environment. The *next isolated shadow provider audit* copies these two public keys to the shadow Worker using `wrangler secret put`, which does not log their bytes.

To verify genuine signed facts/rights machine claims **before** feeding originals, in the same terminal, export the two public-key Base64 values and run:

```bash
export RISK_STREAM_MACHINE_FACTS_SPKI_B64="$(base64 -w0 < "$FACTS_SPKI_DER_PATH")"
export RISK_STREAM_MACHINE_RIGHTS_SPKI_B64="$(base64 -w0 < "$RIGHTS_SPKI_DER_PATH")"
node scripts/lib/risk-stream-shadow-attesters.mjs verify /private/real-attested-candidates.jsonl
unset RISK_STREAM_MACHINE_FACTS_SPKI_B64 RISK_STREAM_MACHINE_RIGHTS_SPKI_B64
```

This verifies the **exact canonical** `geomacro.risk-stream-original-claims.v1` bytes and both distinct domain-separated Ed25519 signatures, plus raw original bytes SHA-256. Mere presence of the two public keys does **not** establish independent attester operation, licensing, originality, or publisher independence.

## Bounded live discovery

- GDELT is paced at a minimum **1 request/second**, with maximum **three subsequent retries** after a 429 and exponential delays of 1, 2 and 4 seconds.
- First 429 triggers immediate Reuters/AP/BBC RSS/Atom **index-only** discovery **before retrying** GDELT. A failed/unavailable Reuters/AP feed is skipped without inventing entries. BBC world/Asia/business/technology provide additional best-effort index candidates.
- The RSS parser permits only HTTPS article URLs, observed per-item publication timestamps within 72 hours, and country hints explicitly supported by article titles. No news-article body, commercial rights or original facts are inferred.
- The batch is capped at **20–30 distinct live index observations**. Fewer than 20 is an explicit HOLD.

## Acceptance and re-run

```bash
node --test scripts/tests/risk-stream-pipeline.test.mjs \
  scripts/tests/risk-stream-shadow-contract.test.mjs \
  scripts/tests/risk-stream-shadow-recovery.test.mjs
gh workflow run risk-stream-shadow-provider-audit.yml -R blocknine0/geomacro \
  --ref main -f approval=RUN_ISOLATED_SHADOW_INDEX_ONLY_NO_FUNDS
gh run list -R blocknine0/geomacro \
  --workflow=risk-stream-shadow-provider-audit.yml --limit 3
```

Inspect the **same run's** governor output and readback from `risk_stream_shadow_audit_receipts`: `d1_503_observed=0` in every batch, batch count and unique observations, D1 write p95, retries/DLQ and any pending queue. A sampled zero-503 count does **not** establish zero errors in all global Cloudflare logs.

**Signed-GRO acceptance:** GDELT/RSS hints are `INDEX_ONLY`; expect **zero signed GROs** from this feeder. To establish `>=10` authentic GROs, feed at least ten same-event pairs of independently attested original facts with verified commercial rights and pre-approved source registry/policy, then inspect independent Ed25519 signature readbacks from isolated D1. Never generate signatures from test keys to claim production acceptance. In their absence, signer acceptance remains HOLD and the commercial canary hold stays in place.
