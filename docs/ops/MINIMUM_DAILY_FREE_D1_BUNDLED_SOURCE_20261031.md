# GeoMacro minimum daily bundled D1 news intake — 2026-10-31

## Explicit budget, no subscription upgrade

This changes **only GeoMacro-owned source ingestion**, not PREDGE code,
workflows, pricing, entitlements, data, authentication or historical storage.
It does not purchase Cloudflare Workers Paid or increase bundled Free quota.

Cloudflare D1 Free account-wide limits remain 5,000,000 rows read and
100,000 written per UTC day. The provider GraphQL measurement is delayed,
not an atomic reservation or a billing entitlement. No provider counters
means **HELD**, never a made-up available budget.

The existing source-only lane reserves a full remaining UTC day of
**15-minute ticks × at most five original news rows/tick** (2/2/1 fair
category priority when all three categories have real news). At UTC midnight
this means:

| Quantity | Maximum planned budget |
| --- | ---: |
| Time slots | 96 |
| Source-only original rows | 480 |
| D1 rows read | 3,200 × 96 + 100,000 = **407,200** |
| D1 rows written | (16 × 5 + 40) × 96 + 2,000 = **13,520** |
| Existing PREDGE planning reserve | **500,000 reads / 8,000 writes** |
| Existing non-PREDGE critical reserve | **750,000 reads / 15,000 writes** |

These are *conservative modeled allocations*, not a promise that a Worker
performs a fixed D1 row count; other account Workers continue sharing the
same physical provider limit. Every admission tests **remaining capacity
strictly greater than** the full-day estimated allocation plus *both*
protected reserves. The PREDGE pilot's actual separate governor remains
unchanged.

## Priority and bounded work

When **research and source_intake** both have positive provider permission,
the pre-existing full private research pipeline may still run. During
**critical-only/UTC pacing hold with source_intake approved**, run only
the source-only original-news collector: maximum five D1 originals and
independent exact readback, no general source-health ring, public
publication, extra D1 backfill, signing or payment.

All five-minute producer workflows must honor the existing **authenticated
15-minute intake cadence** returned by the shared quota plan; their
source-write jobs share one repo-wide GitHub Actions concurrency group to
avoid parallel unreserved private publishers. The serial group does not
turn Cloudflare GraphQL into an atomic reservation. Other account consumers
can still exhaust quota.

If source_intake is denied, native-dated items may be collected only into
AES-GCM held-source artifacts. **No D1 write, no D1 readback claim and no
commercial output.** The separate hourly held-source workflow does not
repeat the RSS poll while this source-only lane is granted.

During *research-admitted* replay, encrypted backlog is replayed at
**no more than five** native-clock items per cycle. Partial progress never
deletes the encrypted original; a full artifact can be deleted only on
all-items authenticated D1 receipt, or strict expiry. The 25h original-news
window and the limited 600-row source ring mean not all 768 observed items
can necessarily be retained; no artificial coverage or lossless recovery
claim is made.

## Production acceptance gate

Require all of the following, not only a green workflow:

1. Latest main and isolated tests for quota, PREDGE reserve and replay.
2. Cloudflare provider snapshot showing an allowed source-only intake
   after a UTC reset or an adequately funded existing slot.
3. Actual original-news staged into canonical D1, independent indexed
   readback with positive receipt for at least one real native-dated item.
4. Public Website build SHA matching current main (or independently proven
   website-code equivalence) and an actual current official source row.
5. Three categories measured independently. Source-health fallback and
   195-country topic discovery do not prove 585 current originals.

No lowering PREDGE reserves or paid-capability switch is permitted to
turn a provider 'HELD' state into a green acceptance receipt.
