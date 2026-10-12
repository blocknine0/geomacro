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

The 30-day/12-entry D1 ring cap remains intact. If the already stored hot
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

## When the old hot row ages past 60 minutes *after* migration

A one-time SQL backfill cannot copy a hot row which was still under the
60-minute embargo during the migration. That copy would remain absent
forever if B2 quota prevented subsequent verified publishes. The public
website-only GRI GET now performs **at most one additional read-only D1
SELECT** against the pre-existing `public_b2_hot_snapshot` after a ring
miss. The row must still be an ORIGINAL `direct-b2-readback` GRI
(`proof_schema` and exact original GRI S3 object key both match), and
its immutable `source_as_of` must now be at least one hour old.

The GET rechecks the exact stored SHA-256 bytes, applies the same
`privateVerifiedGriHistoryProjection` evidence clock and source-redaction
validator and returns a derived score only if all guards pass. No background
timer, extra hot-row write, B2 Class B request, new D1 table, synthetic
historical clock, Supabase query or paid side effect is introduced.
A genuine D1 quota outage still returns HTTP 503; an invalid/unqualified
row must also fail closed.

## Secondary quota-safe verified source for the website

If D1 cannot return either its historic ring or original hot-row proof,
the server-side website getter tries the existing **Cloudflare Global Risk
Edge** only. That edge has a distinct, proof-checked failover order:
verified D1 hot / existing positive edge cache / **D1-budget-reserved** B2
recovery, and returns 503 when it cannot prove a valid score.

Previously the website getter called the generic `readB2PublicRisk()`
which, after an edge miss, could perform **direct unreserved S3 GET** on the
private Backblaze bucket. This was not safe during B2 quota exhaustion.
The website-only path no longer invokes that unmetered helper. It can use
a previously verified edge snapshot only after the real 60-minute original
snapshot embargo and exact GRI continuity validation, and emits no
unverified or newer derived risk. This separation does not alter the
independent, unlagged machine GRO/x402 path.

This is finite-capacity redundancy, **not** a promise of unlimited free
B2/D1 requests: when all verified copies are inaccessible, public GRI
truthfully displays an unavailable/historical state and does not fabricate
a score or spend USDC.
