# Live plus last 24 hours, all three categories

Every full-continent workflow now begins with a separate rolling 24-hour
backfill over the EXISTING broad official website readers for Geopolitics,
Macro / FX and Critical Minerals. It then runs the complete country sweep with
same-run finding publication, and the existing near-real-time fastlane.
Backfill failure remains visible and does not skip country checks or the
fastlane. Existing two-hour per-continent cron / 20-minute start offsets remain.

The backfill reads up to 200 derived findings per category, rather than the
fastlane's newest-20 selection. Only original exact publication times from
[run start minus 24 hours, run start minus 15 minutes] qualify. It includes older
qualifying releases from hour 23 as well as newly eligible releases. It never
changes original dates, turns annual statistics into news, or invents an exact
clock for day-only releases. Shared in-run Australian source transport is reused.

Use the existing protected D1 publisher, stable story IDs, retained-journal dedup,
small batches, actual authenticated write verification and independent readback.
Previously retained stories are skipped rather than relabeled as new. Retention
stays 72 hours; the original 24-hour selection is an additional rolling window,
not a purge of older eligible history. No Supabase, B2, payments or new tables.

The existing Intelligence page already merges live reader results and the
persistent journal, newest first. Publication window > Last 24 hours shows
both newly arriving and recovered 24-hour findings, by original publication.
All available releases still exposes retained older context. No UI rebuild or
website-lock change is needed for feed availability or this existing filter.

Safe receipts report all three categories, source-reader health, examined and
eligible counts, deduplicated publication/readback counts, and the exact original
window. An unavailable category cannot suppress healthy categories or be labeled
as a successful backfill. All-world exhaustive coverage is not claimed: readers
are bounded, sources may be unavailable, and GitHub cron is best effort.

Runtime reconciliation: the existing Macro finding `macro-cee8fd47` was exposed
with native clocks 05:00:00 and 05:00:02 on 23 October via different reader paths.
The immutable-clock guard correctly refused replacement. Backfill now checks
retained journal clocks first: if the same finding is already available INSIDE
the requested 24-hour/15-minute window, preserve that stored clock and exclude
the incoming variant from writes, reporting `existing_clock_variants_retained`.
A retained timestamp outside the requested window remains an error; no stale
record is reclassified as current. The core publisher still rejects attempted
clock rewrites. This reconciles availability, not source-clock agreement.
