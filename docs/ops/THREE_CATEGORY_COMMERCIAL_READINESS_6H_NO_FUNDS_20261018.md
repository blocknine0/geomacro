# 3-category revenue readiness: best-effort 6h no-funds pulse

This task extends the *existing* GitHub zero-funds First Earnings acceptance.
The scheduled diagnostic checks one fixed country per category against the
live public build marker and the existing source-rights-qualified **unpaid**
buyer preflight. It never sends a PAYMENT-SIGNATURE or calls the purchase
endpoint, no customer identity, no B2 raw source retrieval and no wallet.

- `schedule: 7 */6 * * *` is best-effort GitHub cron, **not** an uptime SLA.
- Scheduled jobs run `--diagnostic-only`: ineligible categories are reported
  as such, stale website SHA is diagnostic-only, and a green workflow is
  never a payable/commercial launch proof.
- A normal push to main retains the **stricter exact-live acceptance** behavior
  and still fails closed when no genuinely quote-ready governed data exists.
- Product CI covers workflow shape; no paid setup, no Supabase writes.
- Publication-clock and per-category no-news fields remain separate from this
  commercial preflight, which cannot make an absent source suddenly current.
