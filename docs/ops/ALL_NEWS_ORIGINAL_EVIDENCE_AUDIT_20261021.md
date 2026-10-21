# All three domains: per-news original publisher evidence audit

Owner request: every ingested news item should have genuine, current original evidence. A genuine proof cannot be manufactured when an upstream publisher blocks HTML, omits a precise native timestamp or lacks a separately registered canonical issuer.

## One original news pipeline, not three scoring engines

The existing hourly Website Derived News Continuity collector already builds free source-neutral Geomacro Finds for geopolitics, macro/FX and critical minerals. It retains a **private in-memory** mapping from each derived story ID to the admitted original publisher article. New `scripts/lib/all-news-original-evidence-audit.mjs` examines **every derived news card processed by that collector**. It does not skip or silently mark other stories verified.

For each new card:

- Strictly reconcile exactly the same derived ID and private original article. A feed item without a matching original reference remains `PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE`.
- Require an exact publisher-native publication timestamp within **6 hours**. A day-only release is `ORIGINAL_DAY_PRECISION_ONLY`, not a fake 12:00 timestamp.
- Require the previously registered publisher organization and the exact pinned original HTTPS path, with no unapproved redirect or query. A GOV.UK article from an unrelated department cannot impersonate FCDO.
- Reread the **actual article HTML bytes** under the already tested no-redirect, timeout, 384 KiB, text/html and native date constraints in `verifyGeomacroUnclaimedOriginalPage`. Reject a 403, changed/mismatched original clock, untrusted HTML or publisher identity.
- Only exact verified article bytes plus original native date earn `ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED`. The underlying private SHA256 is never printed or uploaded in the public workflow; the protected issuer workspace must rerun exact immutable readback before a genuine signature.
- Bound to at most **six** extra article page GETs/hour, two per domain. Every other item is explicitly `ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA` or another unverified state, not misclassified as verified.
- Upload a sanitized per-story ID/status audit and per-category coverage counters as a GitHub Actions artifact for 14 days. Never persist raw HTML, original URLs, publisher titles or private source IDs in that artifact.

This is genuine **publisher-page provenance**, not a claim that the article's allegation is independently fact-checked. Separately verified article-specific commercial rights, facts/rights issuer signatures, an approved signed product and actual paid x402 serving remain mandatory.

### Operations and limits

Existing hourly [Website Derived News Continuity](https://github.com/blocknine0/geomacro/actions/workflows/website-derived-news-continuity.yml) produces `derived-news-original-evidence-<runid>` and preserves the existing 72h derived-only D1 journal. Auto Ingest News remains the same canonical missed-publication backstop. The five-minute feed-only fastlane continues with its explicitly **unscored, uncorroborated** state; this hourly audit does not retroactively turn earlier unverified feed items into current originals.

This is **not** exhaustive global verification: currently registered first-party issuers, bounded source quotas and original article time/HTML availability determine which items can genuinely qualify. There is no guarantee that all 195 countries, all original news, historical archives or day-precision feeds can be byte-proved. The audit will show an honest breakdown of what remains pending or blocked.

Independent unit verification: `node --test scripts/lib/all-news-original-evidence-audit.test.mjs` and `node --test scripts/lib/geomacro-original-page-readback.test.mjs`.
