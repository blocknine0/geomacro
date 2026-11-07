# Mandatory shared D1 B2 quota for canonical Node clients — 2026-11-07

## Change (no funds, no quota increase)

The canonical `createB2Client` constructor previously enforced
`B2_ACCOUNT_QUOTA_REQUIRED=1` only inside GitHub Actions. Local cron,
operator scripts or external non-Actions runners could still create an
unguarded B2 client even if its small per-process request budget was valid.

It now requires the shared account-wide D1 ticket flag for **all real Node
callers**, with a narrowly isolated Vitest `VITEST=true,NODE_ENV=test`
synthetic unit-test exception. A missing flag fails at construction, before
any B2 network request. With the flag present, the existing D1 governor
must still verify account/database/token/workflow configuration. **Each**
actual GET/PUT/HEAD/native-auth attempt still reserves from the atomic
`b2_account_daily_request_quota` ledger; an unavailable or exhausted D1
ledger prevents the B2 request and never refunds an ambiguous attempt.

No B2 daily limits, Cloudflare D1 policy, source rights, paid Risk Gate
availability, existing storage objects, payment switches or canary hold
are changed. The ledger is a GeoMacro operational budget, not a claim about
Backblaze's provider-enforced daily cap.

## Acceptance and unresolved scope

- Run the existing Vitest suites
  `src/__tests__/b2-d1-account-governor.test.ts` and
  `src/__tests__/b2-s3-client-usage.test.ts` against the exact PR head.
- Prove a non-GitHub production invocation without the shared flag fails
  before B2 traffic; prove enabled clients still reserve and read back D1.
- Audit direct B2 HTTP/S3 callers that do **not** use `createB2Client`,
  including Cloudflare Workers, third-party producers and admin tools.
  They are not magically protected by this Node constructor.
- Before any 'account-wide quota locked' claim, verify provider B2 Caps &
  Alerts (storage, egress and transaction caps), complete D1/B2 receipts and
  sustained measured account usage. Provider enforcement can lag.
- The separate 140,000-per-UTC-day **total** D1 reads/writes owner target
  remains open until old Worker scans are eliminated by approved migrations,
  protected exact-main rollout and full-day provider D1 telemetry.
- R2, Workers CPU/requests, Durable Objects, Queues, KV, Supabase, Groq,
  GitHub Actions and storage growth require independent current provider
  evidence and per-path governors. No global $5 hard invoice cap is claimed.

Reference: master remediation issue #3634; preserved
`config/d1-hotspot-v2-canary.hold`.
