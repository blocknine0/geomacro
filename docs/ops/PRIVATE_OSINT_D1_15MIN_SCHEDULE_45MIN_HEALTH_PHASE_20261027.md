# 15-minute ingestion / 45-minute durable health sampling quota correction

Date 2026-10-27.

## Confirmed live production
[GitHub run 40455746921](https://github.com/blocknine0/geomacro/actions/runs/40455746921) returned successful jobs on both the primary private OSINT and national-gap RSS collectors. Primary: 768 exact D1-persisted news rows with authenticated exact write readback; 13 newly stored within 15 minutes and 429 newly stored late, 326 previously stored reobserved. Supplemental: 62 private D1-persisted news rows and separate durable readback. The primary derived website journal reported 10 new derived stories and website readback verified. These are factual machine observations, not complete country/domain current news.

The shared D1 quota at the beginning of that run showed 1,296,530/5,000,000 rows read and 11,908/100,000 rows written, normal admission. Earlier on 2026-10-26, free D1 read cap caused protected HTTP 503 failures. Repeated health UPSERT of all 1,390 source×category checks on each primary 15-minute run consumes avoidable D1 operations even when there is no new news.

## Fix

The protected producer ALREADY contained a three-bucket SHA-256 source health sampler, but its bucket-phase clock was FIVE MINUTES. The workflow cron is EVERY FIFTEEN minutes. Therefore each regular cron run selected the **same 5-minute modulo-3 phase**, starving the other two buckets whenever private-only mode used three slots. On full website mode, one slot persisted all health rows every tick and generated unnecessary query load. These conditions were previously hidden by the generic 15-minute expected cadence in receipts.

The patch changes the partition clock to **15 minutes** and the primary writer to three slots, so across consecutive scheduled 15-minute ticks each source status will be durably updated **once every nominal 45 minutes**, subject to skipped/delayed Actions. Every RSS endpoint remains fetched on every invocation; no native-dated event/news row is dropped by the D1 health sampling. Every fetched news item still receives exact D1 write/readback, independent bundle readback, and website bridge unchanged. This is a cost/availability tradeoff for *health metadata only*; never interpret health status older than its checked_at as a current successful source fetch. One-third (about 460 of 1390) of source-health rows is written per nominal tick instead of all 1390.

An explicit regression test spans three adjacent 15-minute UTC slots and jitter; it proves exact coverage without starvation. Existing tests still enforce real source check observation, selected/deferred balance, and persisted event completeness.

## Last-mile national publishers

Three publisher-local candidate RSS paths for FSM (Kaselehlie Press), KIR (Kiribati Broadcasting and Publications Authority) and TUV (Tuvalu Ministry of Finance) are added for **live runtime testing only**, not preregistered as working. Their exact source pages are public, but RSS support and native timestamps remain unverified until the live probe. No unsupported country event is inferred.

Nauru Government Information Office publishes the fortnightly Naoero Bulletin on its official website; DPRK Korean Central News Agency publishes official articles, but neither was confirmed to expose first-party native-dated RSS on the publisher site during research. Do NOT invent RSS links for them. No country-wide 195×3 event SLA is possible in the absence of real events.

## Open acceptance

Latest branch offline tests and protected real network source probes must pass. The production post-merge run must again prove private D1 writes/readbacks and quotas; no single run establishes 24-hour cadence or a guarantee that every country/category has a new event in each slot.

## Latest independent last-mile source probe

[Actions run 40468270756](https://github.com/blocknine0/geomacro/actions/runs/40468270756) physically polled **96 first-party RSS candidate endpoints in 94 previously missing original-publisher countries**. It recorded 67 parseable, healthy RSS endpoints covering 66 of those 94 countries, 64 native-dated topical items from the supplemental lane and 10 attributed country/category cells in that run. The three new publisher-local candidates for FSM, KIR and TUV individually returned parser-accepted RSS feeds, but were classified `EMPTY_OR_OUTSIDE_WINDOW` in all three categories — healthy feed transport, **not a fresh verified country event**.

The two remaining local-country original source locations are now bounded no-credential **transport checks only**:
- NRU: Nauru Government Information Office Naoero Bulletin (fortnightly HTML/PDF archive; no confirmed RSS).
- PRK: official Korean Central News Agency website (native publisher HTML; no confirmed accessible RSS).

The private supplementary registry thus contains **25 existing source candidates + 96 native RSS local sources + 2 non-RSS status-only official publishers = 123 candidate endpoints**, under the fixed 128 ceiling. We have pinned source locations for all 195 country routing entities in the *combined* catalogue, but this is **not 195 usable country-local RSS sources**. Countries with no genuine current original news stay `NO_NATIVE_DATED_EVENT` in the user-safe interpretation. Attributing the publisher's country to a story or making one up remains forbidden.

Expected savings from the cron-phase fix apply only to D1 health rows (previously 1390 writes/tick in main; now about one third); hourly/45m persisted health is not a real-time SLA.
