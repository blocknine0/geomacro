# GeoMacro protected release verification run #42411914869 — exact HOLD remediation

Observed from GitHub Actions `main` SHA `6304668b01eabbcaa853ae29ce163740cef33ff4` on 2026-11-07 20:37 UTC.

GitHub workflow `.github/workflows/canary-promotion.yml` dispatched `operation=verify`; its static-contract succeeded, its protected-release completed FAILURE because the five read-only checks returned HOLD. No DDL, Worker traffic promotion, B2 write or payment activation was performed. Run link: https://github.com/blocknine0/geomacro/actions/runs/42411914869

## Actual provider and evidence results

| Check | Original HOLD code | Evidence-based action |
| --- | --- | --- |
| D1 schema | `RELEASE_HOT_QUERY_NOT_INDEXED` | All required index names and eight migration-history rows were already observed before this failure. SQLite's natural EXPLAIN query plan did not choose at least one expected hot index. **Do not reapply migrations** based on this result. Re-run with this PR's new `d1-hot-query-plan-diagnostic.json` to identify exact table, expected index and actual index/SCAN chosen. Fix the specific hot query or index only with newly reviewed hash-pinned SQL, real headroom, and query-cost measurements. |
| D1 closed UTC day | `RELEASE_GRAPHQL_UNVERIFIED_200` | Cloudflare returns HTTP 200 even for GraphQL schema errors. The new release verifier used `$accountTag:String!`, whereas official Cloudflare GraphQL Analytics declares its custom `string!` type. This PR corrects the affected release and quota sync queries and emits fixed, redacted schema/permission/rate diagnostic codes on provider failure. A 140k/day compliance claim still requires actual full UTC day receipt. |
| B2–D1 | `RELEASE_ENV_CONTROL_PLANE_TOKEN_MISSING` | The `production` environment did not supply the server-only root `CONTROL_PLANE_TOKEN`. Provision only the **existing** matching Worker credential to the protected GitHub production environment, not a new unrelated value. R2 secrets and bucket identity were also empty; after correct identities are supplied, the D1-indexed B2/R2 GET checks may run but full bidirectional physical bucket parity remains HOLD by the immutable no-B2-list cost policy. |
| Hot 50 × 3 | `RELEASE_OPERATION_FAILED` | Original source evidence manifest was absent (or inaccessible) in the checkout. New verifier explicitly checks `HOT50_EVENT_MANIFEST_MISSING` before reading. Use actual 150-cell independently corroborated original events and matching facts/rights signatures—**never** commit a dummy manifest or use a self-generated replacement issuer. Existing repo source pipeline must produce an approved private read-only artifact before gate acceptance. |
| Worker 0% baseline | `CANARY_CURRENT_MAIN_SHA_NOT_DEPLOYED` | The currently live Cloudflare Worker still does not identify itself with merged `main` SHA. DO NOT bypass the existing canary hold. Finish protected migration / account cost preconditions and independently upload exact-main candidate Worker version (without traffic), obtain real baseline/candidate UUIDs, then perform guarded 0→1→10→100 canary promotion. |

## Environment configuration confirmed by GitHub job log

Present (masked): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_BILLING_READ_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`, `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM`.

Empty: `SIGNING_JWK`, `CONTROL_PLANE_TOKEN`, `CLOUDFLARE_ZONE_ID`, `P0B_PRIVATE_R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `B2_SPOOL_ENCRYPTION_KEY`, `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256`, `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256`. `D1_DATABASE_ID` was also empty but this release schema verifier discovers and checks the canonical database via the Cloudflare API, so an empty D1 ID did not cause this run to fail.

Do not paste secret values into issue/PR comments, logs or chat; store in GitHub `Settings → Environments → production → Environment secrets` and appropriate `vars`. Do not rotate the live signer, archive key or root token just to make this workflow green. The protected GitHub environment and actual Worker credential must agree.

## Fix and acceptance sequence

1. Merge this code-only PR after exact-head Product CI, CodeQL and Five-Gate static contract PASS. No mutation.
2. Populate/check missing `production` env secrets/vars from existing deployed credentials and authorised historical key material. No funds.
3. Re-run `operation=verify` against latest reviewed `main` and inspect `parallel-remediation-report.json` plus the new `d1-hot-query-plan-diagnostic.json` artifact.
4. If cloud GraphQL now works, verify actual account-wide closed 24h billed D1 rows. Do not interpret a failed 140k threshold as missing telemetry.
5. Investigate exact D1 natural-plan mismatch, independent original evidence freshness/rights, B2/R2 exact indexed readback and the old Worker SHA; resolve the specific provider facts before any protected migration or traffic promotion.

Provider references:
- https://developers.cloudflare.com/d1/observability/metrics-analytics/ (Cloudflare accountTag `string!` and D1 rows-read/write groups).
- https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/ (Cloudflare `string` variables and Worker invocation metrics).

This document is an action receipt, not a certification that release blockers have been cleared.
