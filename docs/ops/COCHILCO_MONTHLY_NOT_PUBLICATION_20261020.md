# COCHILCO monthly reference is not a publisher publication time

20 October 2026 production integrity fix. The legacy COCHILCO statistical adapter previously converted any month-shaped `period=2026-08` into `published_at=2026-08-01T00:00:00.000Z`. That is **not** a genuine first-party publisher release timestamp. Chile's Central Bank lists August 2026 as the copper mine observation period, and `Actualizado: 13.Oct.2026` as its page update date. Neither one is an article-level datePublished suitable for current news qualification.

The adapter now preserves its source-record fingerprint and numeric observation while emitting `observation_period=YYYY-MM`, `clock_semantics=reference_month`, `published_at=null` and `native_publication_time_verified=false`. It rejects an unknown/non-month period. No new publisher date can be generated from retrieval time, first day of month, link timestamp or site update.

Continuity and provenance: the dedicated verified Chile monthly observer is not modified. The commercial signing and legal-rights gates are unchanged, and historical stored items are not rewritten. Audit any pre-existing COCHILCO records that used artificial first-day publication timestamps before attempting promotion to signed intelligence.

Tests: `node --test scripts/tests/cochilco-observation-clock.test.mjs`, `node scripts/test-p0-adapters.mjs`, `node scripts/test-p0-adapter-certification.mjs`. This is a zero-cost code safety fix, not paid data activation.