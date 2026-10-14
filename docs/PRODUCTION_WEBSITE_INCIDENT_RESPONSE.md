# Production Website Incident Response

If a core public page is unavailable:

1. Read `/api/public-production-health` first.
2. If `b2_runtime_configured=false`, **do not infer missing B2 credentials**: this public health field is the composite of all three validated baseline edge reads, not a direct secret/config probe. Check independent B2/edge proofs, `last_verified_baseline_readable`, and each D1 hot row first; never add a browser secret or enable Supabase as the shortcut.
3. Compare the read-only D1 hot-snapshot timestamps, proof schema, expiry and source clocks for each product with a metadata-only SELECT; do not read private B2 bytes without an account-wide quota reservation. Global Risk's `/v1/public/historical-continuity/global-risk` validates an old D1 archive anchor *only*, not a present-day B2 readback or current signed risk. If the anchor is missing, determine whether the true original B2 object/manifest exists using a separately authorized quota-governed readback. Never fabricate replacement data.
4. If health is green but a page fails, treat it as an application/deployment problem and compare the live build marker with canonical `main`.
5. If the live build is stale, sync/publish the canonical revision rather than editing the mirror as a second source of truth.
6. Keep Supabase in `standby` during customer-facing recovery unless an operator deliberately performs a bounded recovery operation.
7. After repair, re-run the production website health smoke and core-page checks.

Never solve a public website outage by exposing B2 credentials in client code, by silently selecting a hosting-injected Supabase project, by presenting synthetic risk values, or by deleting unverifiable archive data.
