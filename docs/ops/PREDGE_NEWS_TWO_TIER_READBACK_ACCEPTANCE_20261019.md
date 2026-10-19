# Two-tier free news readback and Predge D1 identity acceptance

The existing Website Derived News Continuity workflow's readback must
accept both **strictly bounded** original-dated statuses after PR #2491:
(1) topic-matched `official_release_observed_unscored`, or
(2) exact category-specific `official_feed_candidate_unscored` with
`unclassified publisher update`, null geography and no inferred topic.

The Worker itself applies the same strict validator on write and read.
The readback must not misdiagnose legitimate unclassified candidate rows
as a D1 store failure, nor permit candidate status with a forged verified
topic. The shared Predge parity script now checks exact row-by-row status
equivalence and independent unclassified vs classified labels.

A candidate is **not** qualified news, signed intelligence, original-content
redistribution permission, or paid eligibility. The source-neutral machine
feed withholds rows that require visible upstream attribution. No extra
upstream fetch, storage, payment, B2 operations or API keys.
