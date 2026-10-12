# Website verified GRI D1 recovery without Supabase, B2 read or extra quota

The 12 Oct 2026 production D1 migration 0015 and worker deployed successfully
in [run #38236757907](https://github.com/blocknine0/geomacro/actions/runs/38236757907).
However, that table only gained rows after a NEW direct-B2-readback GRI hot
snapshot PUT. Previously admitted verified historic hot rows could exist
already, and initial ring creation did not copy them. With Supabase frozen and
B2 GET quotas limited, this unnecessarily left the website risk index blank.

Migration 0016 performs **one SQL copy** from the existing
`public_b2_hot_snapshot` entry only if it is an ORIGINAL verified, direct
B2 readback/gzip-restore GRI (not a later current-proof-on-old-baseline overlay),
whose exact snapshot clock is at least 60 minutes old and no more than 30
days old. Original JSON bytes, B2/payload hashes and verification timestamps
are preserved exactly, never synthesized. The website endpoint rehashes
the original bytes with SHA-256, revalidates the GRI identity/clock, strips
all source/event details and rejects invalid or too-new payloads.

The 72-hour/12-entry D1 ring cap remains intact. If the already stored hot
row is not eligible, the migration copies **zero** rows and the website
must continue to fail closed with HTTP 503. This cannot recreate data never
independently read back from B2, nor raise B2/D1 quotas.

The existing D1 deploy workflow now independently exercises
`/v1/public/website-lagged-global-risk` after migration and Worker deploy.
A true verified, source-redacted minimum 60m result must return HTTP 200;
a legitimate empty/over-quota history must return a documented 503.
Unknown routes, 401, malformed payloads and accidentally included raw
provider data cannot pass the acceptance.

Neither signed GRO machine reads nor x402 prices, live payment acceptance,
Supabase SQL/database, B2 archives and public pricing are touched.
