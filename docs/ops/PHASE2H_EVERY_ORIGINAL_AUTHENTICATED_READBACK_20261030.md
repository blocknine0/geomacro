# GeoMacro — permanent authenticated per-news D1 evidence readback

## Contract (three categories, no new data providers)

Every *successfully collected and admitted* first-party raw original from Geopolitics, Macro/FX and Critical Minerals is transformed into a five-part **private** structured input by the existing Phase 2H collector. Each bounded intake tick now completes this chain **before calling the record verified**:

1. Exact original publisher URL, native publication date/precision, title, immutable original observation ID, private original payload digest and five GeoMacro-authored parts.
2. Existing authenticated private control-plane PUT; canonical D1 stores the original and all five parts. The original's immutable ID and source clock never change. Duplicate IDs do not duplicate the story.
3. **Independent authenticated canonical D1 SELECT of `raw_json` for each supplied ID**, using the same existing D1 batched readback, with complete 5-part schema/hash validation. The server emits only private, content-free per-ID SHA-256 commitments, category, native publication time and `submitted_five_part_exact_readback`. Original URLs, title and articles never appear in the receipt.
4. Caller checks exactly one receipt per submitted ID; recomputes source identity and five-part SHA-256 from its independently held original. If a previous immutable analysis version is already in D1, the existing five-part is verified, **but never falsely declared identical to newer projected wording**. Hash/missing ID/clock/rights leakage fails closed.
5. Existing four daily **governed** archive opportunities then conditionally PUT each admitted batch to private B2, execute two independent hash-bound GETs, and recheck D1 B2 ack. **D1-staged only** is private research, `b2_archived_verified:false`; existing B2 ack is required before archived-only structured-answer evidence. Neither status confers third-party rights or authorizes payment.

The receipt is produced for EVERY successful write/unchanged re-observation, per category. Immutable collisions are isolated by existing bounded bisect; unrelated D1 failures remain fatal. No manual commercial approval is required for private five-part generation, and no made-up real-time source publication, market reaction, commercial right or licensed article body is introduced. Uncollected, out-of-retention, invalid or provider-quota-held items cannot be claimed verified. Historical unchanged, PREDGE untouched.

**Existing budget and retention unchanged:** same source polling cadences, existing batched D1 SELECT, existing archival quota governor and four slots, B2 existing 72-hour governed lifecycle, canonical D1 retention <=72 hours. No extra paid provider, unbounded backfill or external API. Signed payment and merchant settlement remain completely separate.

### Acceptance
Run:
```sh
node --test scripts/tests/phase2h-raw-news.test.mjs scripts/tests/phase2ib-fastlane-private-staging.test.mjs scripts/tests/phase2i-osint-country-fair-raw-staging.test.mjs
```
Production must independently show D1 real readback and B2 governed receipts. CI green alone is not proof of producer uptime, universal 195x3 coverage, independent live B2 readback or customer paid delivery.
