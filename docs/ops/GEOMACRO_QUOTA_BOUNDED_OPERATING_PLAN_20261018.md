# Geomacro: zero-cost, fail-closed quota operating plan

Status: implemented scoped safeguards on 2026-10-18. This is an operating
budget **plan**, not a guarantee of 24/7 GitHub cron or paid product readiness.

## Active scheduling / separation of duties

| Workstream | Target / trigger | Permitted outcome | Quota protection |
|---|---|---|---|
| Three-category original pulse | 30 minutes (best-effort) | Hashed, native-date observation; private classification | Up to two original publishers per category, existing per-run bounds and D1 fingerprint dedupe |
| Geomacro Intelligence Orchestrator | 16 possible 90-minute wakeups/day | Canonical D1 source context, 6-hourly official transport census | **At most 2 actual restricted-mode tasks per wakeup**, persistent D1 due cursor; 6-hourly full issuer census, no live Supabase, no per-country fanout |
| Expanded official source observation | 16 90-minute scans/day | Separate source transport/reachability audit, never commercial scoring | 15 allowed active sources; 3 quarantined not polled; bounded same-publisher fallbacks and original article pages |
| Website derived/news | Hourly primary + :37 backstop | Only free derived cards / 72-hour review evidence | Backstop reuses same writer lock, does not refetch when primary has current publication |
| GRI pinned historical version | Daily + scoped changes | Historical continuity only | Check exact D1 existing proof BEFORE a B2 GET; shared quota governor |
| GRI signed-ready cadence | 30-minute hints | Dispatch only if immutable genuine authorized evidence already exists | No unreviewed current score, never force older input to look fresh |
| Paid API / AI agent | On demand only | Approved derived-only signed deliverable after rights / freshness / settlement | No prefetching 195 x 3 cells, no real USDC before founder ACK |

## B2 account-wide operating ceiling

The canonical D1 atomic governor currently enforces **80 total**
reservation attempts per UTC day, with sublimits **GET 25, PUT 55,
HEAD 10, NATIVE_AUTH 10** and a shared maximum **10 public cold-edge GETs**.
These are Geomacro's self-imposed conservative ceilings, not a claim about
Backblaze's universal published free-tier allowance. D1 reservations occur
BEFORE B2 network I/O and are never refunded after ambiguous failures.
If any required client is not wired to the shared D1 governor, those
operations must NOT be described as covered by an account-wide guarantee.

- Prefer D1/current verified cache for serving, and B2 only for genuinely
  needed immutable source/proof readback.
- Do not repeat archived B2 readback on a correctly verified immutable
  historical D1 version. Preserve current-event and historical clocks.
- Reserve budget for production publish/readback and recovery rather than
  spending all Class-B operations on optional source history sweeps.
- On quota refusal: skip optional work, preserve a truthful quota-held receipt,
  do not use alternative credentials or reset process-local budgets.
- Background categories use 195-country on-demand routing, not 585
  simultaneous high-frequency requests.

## Degraded official transports are not missing commercial source approval

A single inaccessible publisher among 15 active sources does **not** imply
that the D1 source context is unavailable in all domains. It also does **not**
mean that publisher is healthy or its observed item has been qualified.
The six-hourly orchestrator census records its valid fixed-shape
`ACTIVE_OFFICIAL_ISSUERS_DEGRADED` observation in D1 as **degraded**
with a failure count, without a five-minute publisher re-poll storm.
Fatal parse/auth/D1 errors still fail the scheduled job.

The strict GRI v1.2, Risk Indices and signed Intelligence admission contracts
are UNCHANGED: transport observation, a free Find, or an owner-licensed
structured output alone cannot certify commercial source rights, numerical
score, B2 immutable proof, or real settlement.

## Acceptance for the whole Geomacro service

1. Product CI and CodeQL against exact main; prove all source/cadence/
   quota/fail-closed regression tests.
2. Inspect at least one scheduled 90-minute run: D1/source-runtime works,
   official census executes only at its due 6-hourly slot, valid transport
   degradation is recorded **degraded** rather than retried immediately.
3. Verify the separate 30-minute source pulse and hourly free derived
   canary still deliver their independently checked receipts.
4. For commercial closure require actual current rights-qualified signed
   inputs, exact B2/D1 readbacks, current GRI/Risk Indices, production SHA
   parity and separate no-funds x402 acceptance.
5. Real customer USDC requires a distinct founder ACK; a passing source
   polling or CI test is not authorization to charge.
