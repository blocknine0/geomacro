# Production Website Incident Response

If a core public page is unavailable:

1. Read `/api/public-production-health` first.
2. If `b2_runtime_configured=false`, restore the hosted server-only B2 credentials; do not add a browser secret or enable Supabase as the production shortcut.
3. If B2 is configured but Intelligence/Risk readiness is false, verify the preserved B2 proof and objects. Do not fabricate replacement data.
4. If health is green but a page fails, treat it as an application/deployment problem and compare the live build marker with canonical `main`.
5. If the live build is stale, sync/publish the canonical revision rather than editing the mirror as a second source of truth.
6. Keep Supabase in `standby` during customer-facing recovery unless an operator deliberately performs a bounded recovery operation.
7. After repair, re-run the production website health smoke and core-page checks.

Never solve a public website outage by exposing B2 credentials in client code, by silently selecting a hosting-injected Supabase project, by presenting synthetic risk values, or by deleting unverifiable archive data.
