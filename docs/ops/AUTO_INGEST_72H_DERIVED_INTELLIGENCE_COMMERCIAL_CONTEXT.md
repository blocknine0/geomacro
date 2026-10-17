# Auto Ingest News — rolling 72h own-derived Intelligence and API context

## Approved flow

The **existing** `.github/workflows/auto-ingest-news.yml` is a protected
:37 UTC best-effort missed-publication recovery watchdog, **not** a new
Supabase ingestion path. The canonical `website-derived-news-continuity.yml`
runs hourly at :07 UTC, with :22/:52 recovery checks. All reuse the same
unified original-source reader, original/native date proof and Cloudflare
control-plane D1, with no second collection engine and no new paid API.

```
External official original feeds / pages (read in memory; no upstream storage)
  -> source authenticity / original date / topic check
  -> Geomacro-owned title, derived what_changed, why_it_matters, category, date
  -> 15-minute website embargo (day-only: conservative next-day 12:15 UTC)
  -> authenticated D1 `website_derived_intelligence` journal
  -> first-publication and first-ingestion TTL + row cap + dedup
       |-> Intelligence page and GET /api/v1/intelligence/query?view=auto-ingest-72h
       |       free, own structured Find Cards, no original titles/URLs/raw material
       |-> canonical POST /api/v1/intelligence/query on-demand
               private country/category/topic-matched structured research drafts
               -> separate original verification, rights, independent event
                  corroboration, signed customer readback and actual x402
                  availability REQUIRED before customer charge
```

## Exactly 72h, even in quiet hours

The free derived D1 journal now stores records whose **original publication
instant** is no older than 72 hours and whose `first_seen_at` is also inside
72 hours. It enforces both dimensions on every read, rejects original-news
dates from before the window on write and periodically removes expired D1
rows physically. The hourly protected D1 publisher sends an authenticated
empty batch if no source has qualifying new originals; this is a TTL sweep,
not a synthetic news event. D1 retains max 600 rows total (250 read rows).
Actual GitHub scheduling is best-effort, so physical row cleanup requires
a successful tick; public GET still fails closed on expired rows if a tick
is missed.

Original day-only issues continue to wait an entire publisher day and the
15-minute buffer. Nothing resets a date to the GitHub run time, first-seen
time or D1 deployment clock. Raw article bodies, upstream headlines,
issuer URLs, feed XML and private source identity are NEVER persisted to
the journal or returned to customers. Older, separately signed and clearly
historical 30-day automated Finds/B2 snapshots keep their **existing distinct
cryptographic contract**; that archive does not grant a current 72h event
or paid evidence.

## Why API integration cannot silently charge

The canonical paid API's already-existing live on-demand flow checks the
same free D1 derived journal for country/category matched structured hints
when available. These are drafts, not independently qualified events:
`country_subject_verified=false`, `independent_same_event_verified=false`,
`commercial_derived_rights_verified=false`,
`signed_product_verified=false`, `payable=false`.
They can guide Geomacro's own research output but cannot satisfy
`checkAgentQueryDeliverability`, issue a quote, settle USDC or be marketed
as verified signed commercial products. Live original retrieval, verified
native issuer clocks, commercial rights and delivery hash remain separate
existing requirements. No raw content is delivered in free or paid responses.

## Acceptance

1. Source tests: `src/__tests__/auto-ingest-72h-structured-output.test.ts`,
   `src/__tests__/website-derived-news-continuity.test.ts`, browser
   readback and original timestamp checks; all existing signed-Finds
   historical/rights safety tests must pass.
2. Protected merge triggers **Deploy D1 Control Plane** for the worker and
   the canonical newsroom publisher once the deployment succeeds.
   Website/Lovable reader must be republished to use the matching 72h
   contract if it is not automatically synchronized.
3. Independently GET the control plane's
   `/v1/public/website-derived-news`; expect
   `retention_days=3`, `retention_hours=72`, verified structured signal
   shape and **zero** original news older than 72h.
4. Check
   `GET https://geomacro.live/api/v1/intelligence/query?view=auto-ingest-72h`
   and the Intelligence page after website SHA is current. No funds.
5. A successful CI or schema update is NOT evidence that all 195×3
   category cells have fresh originals or that paid customer settlement
   is enabled. Report unavailable/quiet/degraded states honestly.
