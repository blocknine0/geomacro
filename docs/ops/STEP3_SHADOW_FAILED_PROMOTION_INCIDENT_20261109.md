# GeoMacro Step3 failed isolated Shadow promotion — read-only incident reconciliation

## Actual incident

GitHub Actions [run #42583282859](https://github.com/blocknine0/geomacro/actions/runs/42583282859) returned **HOLD**. The modern Shadow promotion was attempted with target immutable canonical version `1a49e55d-7c82-42b6-9f30-250423d9732c` but the immediate provider deployment readback did **not** report this expected version. The protective automatic rollback then could not identify an exact pinned old/new version for the modern Worker, and returned `ROLLBACK_REQUIRES_MANUAL_REVIEW`. The legacy Worker deployment was **never attempted**.

Do not assume either success or rollback. In particular, the reported `shadow_traffic_changed=true` means a deployment was attempted and its current outcome is uncertain; it is not an independently observed traffic percentage.

The independently verified unpromoted canonical candidates had passed exact immutable URL HTTP 404/401/400 authentication in [run #42581997285](https://github.com/blocknine0/geomacro/actions/runs/42581997285). Production database, payment and canary HOLD were not modified.

## Required no-write provider reconciliation

Use protected `step3-shadow-failed-promotion-readonly.yml`, first triggered automatically after reviewed merge to `main`, and manually dispatchable later. It:

- Requires exact current `main` SHA, protected canary HOLD, known Cloudflare account, distinct pinned production/Shadow D1 names and UUIDs.
- Reads `GET /workers/scripts/{exact-shadow-name}/deployments` twice and independently fetches **the exact first/latest deployment ID** via the provider `GET /deployments/{uuid}` each time. Both must agree on version IDs and percentages. Record at most 5 sanitized recent deployment IDs, UTC timestamps, version IDs and split percentages.
- Uses Cloudflare's documented guarantee that the first returned deployment is the latest traffic-serving one, but never assumes a partially applied deployment/response is a complete physical PASS.
- Separately probes the ordinary two allowlisted `workers.dev` hostnames for JSON 404 `NOT_FOUND`, JSON 401 `UNAUTHORIZED`, and JSON 400 `P0B_STATUS_QUERY_INVALID` using the isolated Shadow-only bearer on deliberately invalid query. Those requests must not need D1 reads.
- Classifies modern and legacy each as `OLD_ORIGINAL_AT_100`, `NEW_CANONICAL_AT_100`, `UNSTABLE_PROVIDER_READBACK`, or `UNEXPECTED_OR_SPLIT_VERSION_REVIEW`. Any unexpected version, changed list, partial split, missing/incorrect D1 binding remains **manual review required**.
- Logs only sanitized provider state and HTTP status/error categories; never logs API token, bearer, HTTP response bodies, source data or secrets.

**Absolutely no** Worker deployment POST/PUT/DELETE, SQL, R2/B2 write, token rotation, payment, Predge change, or production canary hold removal is allowed.

If latest deployment remains unexpected, do not automatically overwrite it. Retrieve provider detail/history and reconcile changes or concurrent deployments before designing a narrowly scoped follow-up action.

Cloudflare official deployment-list semantics:
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/

## Safe next step

Inspect the run's `artifacts/release/step3-shadow-failed-promotion-readonly-incident.json` and compare provider two-read version plus actual ordinary hostname HTTP result. Never re-run the failed Shadow promotion workflow blindly and do not run genuine B2 ACK until Shadow route+authorization are physically verified.
