# Production B2/D1 runtime acceptance (no Supabase, no new paid services)

## What this verifies

The local owner preflight is **not** a view of GitHub Environment secrets or Cloudflare runtime state. A local `NOT_PROVIDED` only describes that shell. It cannot diagnose production credential presence or production writes.

The protected workflow `.github/workflows/production-b2-d1-runtime-readwrite-acceptance.yml` checks real runtime behavior on canonical `main` only. It uses existing GitHub Environment `production` credentials and the existing `geomacro-control-plane` D1 database; it does not create another database, subscription, Worker, or paid dependency.

The no-user-data probe writes one tiny private diagnostic JSON object to the existing Backblaze B2 bucket `geomacro-private-archive`, reads its full bytes back once as part of `putWithMetadataVerification`, then performs a second independent GET. It compares exact byte length and SHA-256. Each B2 attempt must reserve the existing shared daily quota through Cloudflare D1. The workflow then reads the per-run `b2_request_quota_workflow_receipt` rows from the same D1 database and confirms GET/PUT receipts and before/after counter movement. No HEAD request is used. It does not delete the diagnostic object; deletion would add another production request and is intentionally not part of the probe.

The workflow output is a **B2/D1 runtime configuration test**, not a signed-product readiness claim. A PASS does not say that current Intelligence, Global Risk, Risk Indices, the source/legal rights, independently signed Facts/Rights, current numerical GRI, country/category certificates, or public deep health are ready. The legacy `/api/health?deep=1` must remain fail-closed until its own real current signed-data requirements pass. The probe never updates public hot snapshots.

## Owner-only configuration

Open GitHub **Settings → Environments → production → Environment secrets** for `blocknine0/geomacro`. Verify the following names exist in the environment actually used by the protected publishers (add only if missing). Never copy values into a PR, issue, chat, artifact, or Actions logs.

- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The Cloudflare API token must be able to list the existing D1 database and execute D1 queries (read/write) for `geomacro-control-plane`. The runtime test intentionally fails if that token has only metadata/read-only access or points to the wrong account/database. Do not create a new database or expand permissions beyond the existing account/database scope needed by the protected workflow.

`D1_DATABASE_ID`, `B2_ACCOUNT_QUOTA_REQUIRED`, `B2_ACCOUNT_QUOTA_WORKFLOW_ID`, and `B2_REQUEST_BUDGET` are set/resolved by the workflow; they are not owner secrets. The probe fixes the budget at 8 attempted B2/native-read requests and fails before B2 I/O when the existing D1 quota ledger lacks safe headroom. The actual B2 calls are independently counted in D1. It writes only a nonce-bearing diagnostic object in the private `geomacro-evidence/v1/private/runtime-config-acceptance/` prefix, not publisher material or customer data.

For the **separate historical GRI file-version recovery** (not the basic B2/D1 probe), the existing workflow needs the distinct read-scoped pair `B2_ARCHIVE_READ_KEY_ID` and `B2_ARCHIVE_READ_APPLICATION_KEY`. Keep that pair limited to its intended history read scope; do not substitute the general B2 write key just to satisfy presence checks. The normal content publishers separately require their already configured public-key pins and genuine inputs. This probe does not repair missing signatures, grants, GRI scoring, or expired hot snapshots.

## How to run and interpret

- A merge of this PR to `main` triggers the one-shot production acceptance job after the offline tests pass. The job uses the GitHub `production` Environment and any configured environment approval policy.
- An owner may also run **Actions → Production B2-D1 Runtime Read Write Readback Acceptance → Run workflow** on `main`, entering exactly `VERIFY_EXISTING_B2_D1_ONLY_NO_FUNDS`.
- A green config-presence check is insufficient. Accept only a run containing `status: PASS`, `b2_put_verified: true`, `full_body_readback_verified: true`, `second_independent_get_verified: true`, `d1_quota_write_readback_verified: true`, nonzero per-run GET and PUT receipts, advanced D1 counters, `supabase_requests: 0`, and `payment_attempts: 0`.
- If an owner secret is missing, the job prints its **name only** and the user should add it to the `production` Environment secrets above. If D1 listing or D1 query is rejected, verify the token's account and D1 query/write scope; do not paste the token or request bodies into logs. If B2 PUT/GET is denied or the provider's quota is exhausted, a variable cannot cure it: retain the failed receipt and resolve the existing account key scope/actual provider quota through the current owner account, without enabling paid infrastructure. Do not bypass the D1 quota governor or retry in a loop.

## Safety boundaries

No Supabase variables are injected; a Supabase or payment environment contaminant fails closed. No x402, Coinbase settlement, funds, source article, signed proof, original URL, license, or private key is read/written. The probe's only persistent data is the private diagnostic B2 object and the normal existing D1 request/counter ledger records. This is a bounded production write/read/readback because a no-network/unit/metadata-only test cannot establish that production credentials really work.
