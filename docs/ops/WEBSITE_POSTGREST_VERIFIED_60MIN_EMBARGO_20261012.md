# 2026-10-12: 60-minute release embargo on the remaining website legacy public-data proxy

## Why

The website `/intelligence` SSR/browser, `/event/$eventId` details
and `/global-risk` hooks already enforce a truthful minimum 60 minute
publication hold. However the separately hosted compatibility
`/api/public-data-proxy` (PostgREST read-only bridge) still exposed
`events` and `gri_snapshots` with no website-specific release cutoff,
so clients could bypass the website display policy.

## Change

For the legacy browser-facing proxy only:

- `events`: mandatory original `published_at <= now-60min` **and**
  `created_at <= now-60min`. Missing original clocks do not qualify.
- `gri_snapshots`: mandatory true `as_of <= now-60min`, **published**
  and **verified**. Incoming date filters cannot override the embargo.
- `gri_contributions` and `gri_source_dispositions`: require a
  single canonical `snapshot_id=eq.` value. Make at most one tightly
  bounded read-only verification of the exact parent snapshot with
  status=published, verification_status=verified and as_of cutoff.
  Underage, unknown, invalid or unreadable parents fail closed.
  Response contents remain source-redacted JSON-only under #2101.
- Validation runs and non-risk validation metrics retain their existing
  public read semantics.

Every request still requires a public-allowed table, exact PostgREST path,
plain projection, no private source filters, JSON-only output, no service
role key and no mutations. This does **not** delay the dedicated x402
machine/AI agent POST endpoints, country/corridor GRO, independent signer
or internal production source ingestion.

The prior GRI parent verification incurs one small supplementary
**read-only** Supabase request only when someone explicitly requests
legacy proof children; no new cron, background work, D1/B2/Supabase writes
or paid calls. If the frozen Supabase cannot serve this, it fails closed
rather than violating the embargo.

Product CI/CodeQL/Website Lock and post-merge Lovable **publish** with
exact SHA verification remain required. Source rights remain governed
by actual third-party terms. This is website clock control, not evidence
qualification or commercial authorization.
