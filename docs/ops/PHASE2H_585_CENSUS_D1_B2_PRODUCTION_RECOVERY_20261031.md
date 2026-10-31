# GeoMacro 195×3 source census / scheduled D1 / raw B2 recovery — 2026-10-31

Production evidence is independently partitioned. Never infer live country
coverage from 585 configured routes, a heartbeat from inserted records, or a
derived-news B2 archive from Phase 2H private raw original archival.

## A: 585-cell source census — nightly READ-ONLY
- The established `private-global-osint-15m.yml` has a `live-source-probe`
  job but its existing condition runs it on PR or manual dispatch, **not** the
  standard 15-minute production schedules (where the job is SKIPPED).
- A new standalone `private-osint-585-census-daily.yml` runs at **03:11 UTC
  daily** using only existing public source probe/worklist builders; no D1,
  B2, PayPal, x402, rights or PREDGE credentials are used.
- The workflow retains the three measured artifacts 7 days under
  `geomacro-private-osint-live-coverage-<run_id>`. An actual successful
  scheduled run is required before describing this as OPERATING rather than
  MERGED/CONFIGURED.
- `configured` means 195×3 routes. `reachable` means real source HTTP.
  `observed` means native-dated source observations. `D1 stored` requires
  separate immutable D1 insertion + readback receipts; this read-only source
  probe never claims or fabricates D1-stored country events.
- The publisher's country is not necessarily the event's country; rights
  and same-event independent verification remain separate checks.

## B: actual scheduled canonical D1 insertion
- 2026-10-31 workflow_run [#41194170727](https://github.com/blocknine0/geomacro/actions/runs/41194170727):
  `CANONICAL_D1_EXACT_READBACK_VERIFIED`;
  original callbacks 29,007; unique article identities 1,988;
  selected_count=5, 4 inserted, 1 unchanged, 0 identity conflicts, exact D1
  readback true. Selected by category: geopolitics 2, macro 2, rare_earth 1.
- This receipt demonstrates an admitted **one-run** real D1 write, NOT 585
  verified country-event cells, B2 original archival, rights or customer-paid
  delivery. `heartbeat.new_events_verified=false` even with healthy feeds.
- Continue the existing quota-governed 15m cadence. It is best-effort GitHub
  scheduling, not a guarantee of a run or a new article every 15 minutes.

## C: two DIFFERENT archive contracts
- `website-derived-news-continuity.yml` contains the **derived journal**
  backup. 2026-10-31 [run #41201771265](https://github.com/blocknine0/geomacro/actions/runs/41201771265)
  reported `B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED` for 340 derived rows
  (geopolitics 145, macro 150, minerals 45). This is a real private B2
  storage proof for the *derived* journal, but NOT Phase 2H originals.
- `phase2h-private-raw-archive.yml` owns source-original D1→B2 proof
  at `29 0,6,12,18 * * *` UTC. On 2026-10-31
  [run #41203108274](https://github.com/blocknine0/geomacro/actions/runs/41203108274),
  main at run-time `b85feec2e1e95010815516ee66798194de906a19`:
  quota archive=true; canonical raw census=5,750 staged, 0 archived,
  5,750 pending (geo 1,922; macro 1,924; minerals 1,904).
  **Raw B2 was NOT written**: first original payload SELECT failed with
  `PHASE2H_RAW_B2_CANONICAL_D1_PROVIDER_REQUEST_FAILED`.
- Repair reads max 300 originals in indexed 25-record Cloudflare D1 pages,
  with one 10-row downgrade on provider rejection, never changing the
  row-level SHA, D1 identity/ack, B2 2-GET verification, issuer rights,
  quota limits, schedule or downstream exact-question verification.
  Safe numeric HTTP/provider error-code telemetry now identifies continued
  failures without logging private rows, endpoints, SQL or secrets.
- A repaired code path is NOT acceptance. Require an actual new main
  scheduled run after merge with object key, SHA-256 and two independent GET
  checks, same-ID D1 metadata acknowledgement and exact-question HTTP 200.
  A positive incremental batch with remaining backlog is NOT whole-corpus PASS.
  Full backlog, earlier unarchived historical records and country coverage
  remain explicit truthful deficiencies. Issue #3170 stays OPEN until the
  actual issue checklist is met; a derived-only 379/340 record B2 proof does
  not close it.
- D1 physical retention cleanup remains MANUAL ONLY as previously decided.
  The prior blanket 72-hour delete is not re-enabled; native B2 lifecycle
  rules must remain independently verified, not changed by this PR.

## No-go protections
No paid feeds, quota override, minimum-reserve edits, D1 deletion,
PREDGE changes, historical-Supabase changes, x402/payment activation or
fake 195-country news assertions. Apply the source-repair only to main
after CI and repo review; production B2 truth is established only from
post-merge provider receipts.
