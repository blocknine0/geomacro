# Six-continent automatic country probes

Superseded by the owner clarification in `CONTINENT_FULL_SWEEP_20261023.md`: scheduled runs now visit the ENTIRE continent every two hours. The single-country cursor below is retained only as history/compatibility, not the active scheduled plan.

The existing six main-branch cron workflows remain on their two-hour cadence,
with 20-minute planned UTC offsets: Africa 00:04, Asia 00:24, Europe 00:44,
North America 01:04, South America 01:24, Oceania 01:44, repeated every two hours.
GitHub cron is best effort; those times are not delivery guarantees.

Each scheduled run now reads its own continent's latest successful scheduled
checkpoint using the read-only GitHub token. It probes the next canonical ISO3,
wrapping at the end of that continent. Delayed or dropped ticks no longer jump
countries through wall-clock arithmetic. Failed jobs do not advance the cursor.
The first ever successful-schedule history starts at that continent's first ISO3.
Manual country pins and main-push canaries do not advance scheduled history.
Main-push canaries also exercise real checkpoint restoration before probing.

All 195 canonical countries are still partitioned once across six groups; all
three domains share the existing per-country 12 discovery / 4 issuer-page cap.
At ideal cadence a full Africa sweep takes 108 hours, Asia 94, Europe 90,
North America 46, South America 24, Oceania 28. Delays extend these durations.
This is rotating source verification, not a claim of fresh data for all 195
countries every two hours, publication, commercial rights, or signed GRI.

Artifacts now include continent and run attempt, fixing upload collisions among
the six bootstrap jobs and reruns. The daily proof aggregator accepts both old
and new artifact names. Existing 14-day checkpoint retention is unchanged.

If GitHub metadata/download fails, the latest successful checkpoint is missing
or expired, or its country/three-domain receipt is invalid, restoration fails
visibly rather than resetting and silently skipping countries. Fix the read
permission or recover the missing checkpoint before retrying. There is no
extra catch-up fanout or unlimited publisher retry. Source unavailability is
retained as explicit unverified evidence and still counts as a completed probe.

Validation: Node tests cover all 195 successor positions with long delays,
wraparound, retry without advancement, old artifact migration, invalid history,
missing/expired artifacts, failed reads, country binding, and isolated artifacts.
The main-push bootstrap checks real GitHub checkpoint access for every continent.
