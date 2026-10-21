# Shared zero-cost original-source quota (three categories)

The protected original publisher byte-verification audit is OPTIONAL and MUST NOT
consume a claimed permanent daily quota. A GitHub source-GET budget does not
increase upstream publisher, Cloudflare, GitHub Actions or B2 free limits.

The quota bundle has a ceiling of **6** extra strict first-party article GETs
per hourly publisher run, with **4 normal shared** and **2 never-spent reserve**.
Requests are round-robin across geopolitics, macro/FX and critical minerals.
Only **1 original readback per originating HTTPS host per run** is admitted.
Exact same article+category+publisher+native publication time proofs may be
reused in the same run, never persisted or reused across runs. All overflow
cards remain `ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA`. An upstream HTTP 403,
429 or network outage is not retried or magically upgraded to verified.

The hourly issuer feed polling and the separate 5-minute fastlane already have
their own existing budgets and must continue running; B2 uses its existing
separate account-wide Cloudflare D1 quota governor. The bundle does not spend
B2 or create Supabase writes, and it **does not guarantee that free quotas can
never run out**. Accurate quota ceilings depend on the actual upstream terms
and shared account usage.

## Separate NEW Supabase account only: explicitly NOT existing projects

The owner explicitly rejected reusing old Supabase projects for the extra gate.
**Do not point `SUPABASE_URL`, `APP_SUPABASE_URL`, or any historical
`SERVICE_ROLE` secret at this optional quota subsystem.** In particular,
neither the existing `blocknine0's Project` nor `geomacro-staging` is an
approved extra gate.

The owner must create and connect an independent, newly registered **Supabase
Free account and project**. Only then can the next isolated rollout add a
private, bounded aggregate rate-lease gate for optional news HTML rereads.
It would store only day buckets, small counters, and expiration metadata;
no source original article bytes/URL/title, no D1 records, no paid-product
authority and no wallet keys. Its failure must set OPTIONAL original-HTML
verification to deferred rather than grant unearned verification, while the
canonical free derived D1 newsroom stays available. It must never be used to
circumvent free-plan restrictions or multiply provider identities.

There is **no** new-account gate configured in the present patch; no
credential, URL, externally-created Supabase resource or commercial readiness
is invented. Tests can verify the bounded local policy before any account
exists.
