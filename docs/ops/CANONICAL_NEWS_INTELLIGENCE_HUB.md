# Canonical News Intelligence Hub — production convergence

The backend Cloudflare D1 `website_derived_intelligence` journal, not a React
frontend, is the common derived-intelligence authority. Do **not** create
secondary source-specific customer publication pipelines.

## Five permanent functional groups

1. **Collector** — existing private OSINT 15m, first-party original 5m,
   half-hour source pulse, governed Telegram B2→D1 lead consumer. Private OSINT
   leads are not automatically upgraded to verified published intelligence.
2. **Processor** — current intelligence orchestrator and restricted scoring
   continue dedupe, native timestamps, classification, evidence provenance,
   country attribution and separation of private versus public state.
3. **Publisher** — existing website-derived-news-continuity, original fastlane,
   OSINT's bounded derived publisher write through the existing authenticated
   `/v1/website-derived-news` D1 endpoint. `ON CONFLICT(id)` keeps native
   date/category immutable; public journal is rolling 72 hours, with a separate
   B2 archive.
4. **Distribution** — Website, public D1 structural feed, reusable JSON and
   authorized consumers READ the same canonical journal. The new central
   bundled readback compares the actual website D1 reader, exact shared machine
   record IDs and website country matrix in one bounded run. This is not a
   new public push channel or an override of gated commercial products.
5. **Health & Recovery** — existing missed-writer cadence backstop and
   auto-ingest recovery remain active. The new control workflow validates all
   five groups and polls only if the existing Cloudflare D1 account-wide
   research gate admits one bundle.

The GitHub workflow file grouping is **logical**: preserve existing optimized
writers, do not rename/delete all 338 workflows without a dependency audit,
and do not duplicate collection in a new "master" workflow.

## Shared free quota

- Account-wide Cloudflare D1 GraphQL preflight via
  `scripts/ops/plan-d1-bundled-work.mjs`, with paced reserves. This
  observation is not an atomic reservation.
- Only one bounded, serial, source-neutral website + machine + 195×3 GET
  **readback bundle per scheduled control tick**. It writes no D1 rows,
  incurs no B2 request and makes no upstream publisher call.
- Existing D1 publisher batch limit: 50 derived rows per write request;
  immutable original clock and identifier; journal provides at-least-once
  source reconciliation and bounded 72h replay. B2 archive is separate.
- Existing B2 quota reservations and independent publisher checks remain
  mandatory. If a quota or readback is unavailable, report HOLD or FAIL,
  never invent `NO_NEW_EVENT`.
- Website/machine distribution is a **pull projection**, so consumers can
  retry reads instead of each collector pushing duplicate news into every
  channel. Third-party push delivery still requires its own durable outbox,
  authorizations and receipts before enabling any real sends.

## Limits and acceptance

A green topology check proves only code wiring. A green live-bundle proves
a point-in-time D1 reader and machine ID parity, **not** real-time coverage in
each of 195 countries × three categories. The 195×3 view explicitly reports
observed mentions and empty cells, not first-party native publisher presence.
GitHub schedules may delay or drop runs; original timestamps and first-seen
D1 clocks cannot be laundered. Source-specific watermarks/queues must be
verified independently from each producer's existing state; this PR does not
declare a universal durable source event queue.

Do not activate raw article resale, unverified-as-verified evidence,
commercial distribution, Risk Gate authorization, PREDGE changes or spending.
