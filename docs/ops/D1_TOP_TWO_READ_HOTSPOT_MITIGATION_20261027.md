# D1 top-two read hotspot mitigation — 2026-10-27

## Provider evidence (not guessed attribution)

The protected Cloudflare D1 Query Insights sample at 09:37 UTC showed:

- SHA `0764ca64f15d44b662177d17e56e1f5625269b9a61953cad77e6f161ca426514`: Website derived journal family; **2,925,330** rows read / 6,845 executions (427 rows per execution); **exact SQL and callsite remain UNVERIFIED**.
- SHA `8cf08019a90c99c6d3561c7182dce14c1cffac3490d60536b6622ab459a48e02`: private OSINT event journal family; **1,629,996** rows read / 326 executions (~5,000 rows per execution); **exact SQL and callsite remain UNVERIFIED**.

This is provider Insights usage over its requested time window, not a fresh daily
billing total and not a claim that either historical fingerprint belongs to one
particular current function. Old deployed Worker versions may still contribute.

## Code changes

1. Private OSINT writer: replace its historical repeated full-ring
   `COUNT(*)` expression during oldest-item compaction with a one-row
   transactionally maintained ring cardinality. Migration `0032` counts
   existing items **once** and creates INSERT/DELETE triggers for subsequent
   updates. SQLite regression checks rollback and newest-4000 retention;
   oldest-first index is reused. Counter itself does not store articles or
   release timestamps. Added index/trigger writes can increase D1 rows-written;
   monitor account *both* read and write budgets after cutover.
2. Anonymous public 72h Website JSON/HTML and source-neutral machine views:
   extend existing per-POP edge Cache API from 45s to **120s**; keep the
   authenticated `Cache-Control: no-cache` origin-readback bypass. Other
   public sources retain 45s, the journal bundle retains its 15s TTL.
   Fresh source-native publication timestamps are immutable. POP-local cache
   does not guarantee global CDN hits, and can add up to 120s presentation lag.
3. SQL diagnostic registry includes exact old and new ring compaction
   statements. Raw Cloudflare query SQL remains only in temporary protected
   GitHub runner storage, never in logs. `TABLE_FAMILY_ONLY` must **not** be
   promoted into exact attribution.

## Live acceptance / rollback

After merging, **the protected main D1 deploy must succeed including migration**,
exact deployed SHA, D1 journal parity, and restricted Predge rights checks.
A bare CI green check is insufficient. Compare Query Insights over equal UTC
windows after deployment; a falling fingerprint total does not prove true
read reductions unless account-wide rows read, provider query frequency and
source ingestion volumes are compared. Also measure rows written (triggers).

If migration fails, leave D1+B2 unchanged and stop production deployment;
never bypass quota admission or mark unavailable source news as NO_NEW_EVENT.
No new vendor/account, Cloudflare KV/R2 optional state unchanged, and no
Predge/paid/signed product authorization is granted.

## 195×3 evidence remains separate

An actual source probe measured 511 endpoints and 1,390 source/category checks,
768 native-dated items and 120/585 country-attributed item cells in that
single sample, though 585/585 had healthy fallback. This is not evidence that
every cell saw new news, nor that title-based country mentions independently
verify event locations. Existing 585-cell worklist remains the priority source
recovery mechanism; without a native article for a particular country, do not
invent one. Meeting a 24/7/195×3 timeliness SLA also requires source-side
availability and scheduler reliability outside GitHub Actions' guarantees.
