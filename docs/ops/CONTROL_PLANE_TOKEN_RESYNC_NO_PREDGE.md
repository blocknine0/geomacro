# Existing Control Plane token resync (no Predge mutation)

## Why this exists

The current public production diagnostic found D1 /health at HTTP 200 with schema v5, but the private source-handoff writer returned HTTP 503. In workers/control-plane/src/private-source-handoffs.ts, that exact 503 is returned before authorization when the deployed Worker CONTROL_PLANE_TOKEN is missing or shorter than 32 characters. A bad-but-present token normally reaches the authorization branch and returns 401 instead. This resync updates that one existing Worker secret from the existing protected production root; it does not deploy Worker code.

## Exact owner action

After this PR is merged, open Actions -> Resync Existing Control Plane Token Only -> Run workflow on canonical main and enter exactly:

RESYNC_CONTROL_PLANE_TOKEN_ONLY_NO_PREDGE_CHANGE

The protected production Environment must already contain these existing secrets:

- GEOMACRO_COMMERCE_LEDGER_TOKEN (at least 32 characters; existing control-plane root)
- CLOUDFLARE_API_TOKEN (existing account's Worker-secret edit permission)
- CLOUDFLARE_ACCOUNT_ID (the existing 32-character account ID)

Do not paste these values into chat, issues, PRs, artifacts or logs. The workflow derives the deployed CONTROL_PLANE_TOKEN in a pipe directly into the pinned Wrangler command, then checks the actual public signed-input index, LOW private-handoff read, and least-privilege denials using the existing read-only acceptance script. It emits only aggregate counts and fixed failure codes.

The workflow writes only the existing Worker secret CONTROL_PLANE_TOKEN. It does not run Wrangler deploy, modify any PREDGE_* secret, create or migrate D1, access B2, enable Supabase, write a source handoff, refresh a hot snapshot, sign new evidence, or attempt a payment. An empty private handoff page can still pass the transport/authentication test; it does not mean current originals are available.

If configuration is absent, the safe error names the setting only. Add or correct only the missing existing production Environment secret. No new paid service or database is required.

## Separate launch blockers are intentionally not bypassed

The 2026-10-25 protected-main live diagnostics showed all three signed hot-snapshot D1 rows as stale and expired. The historical GRI anchor is prior_b2_baseline_of_independent_gri_proof, not a current B2 readback. Neither this token repair nor its passing handoff readback can restore current signed Intelligence/GRI/Risk Indices. That requires legitimate current originals, valid signed source/rights evidence, independently reviewed numerical GRI and country/category certificates, exact B2 object/version readback, D1 hash-bound promotion, and current public 200 readbacks. Keep all products fail-closed and nonchargeable until independently verified.
