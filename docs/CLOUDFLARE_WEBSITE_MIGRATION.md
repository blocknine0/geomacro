# Cloudflare Website Hosting Migration

Status: implementation prepared; Cloudflare staging deployment and live acceptance are pending. Lovable remains connected and production DNS remains unchanged.

## Canonical source and deployments

`blocknine0/geomacro:main` is the only source of truth. The new `Deploy Production-Capable Website to Cloudflare Staging` workflow runs on every push to `main`, waits for successful exact-SHA Product CI and CodeQL runs, builds the existing Nitro application, deploys it to the existing Cloudflare account, and verifies the deployed SHA and live runtime. A superseded `main` SHA is rejected before and after deploy and again after acceptance.

The dedicated staging URL is `https://geomacro-web-production-staging.daspallab202391.workers.dev`. It runs the regular application Worker entry point, SSR, assets, security middleware, GET/HEAD routes and existing authorized POST handlers. It does not use the read-only candidate wrapper. The isolated candidate at `geomacro-web-candidate-isolated.daspallab202391.workers.dev` is unchanged.

Staging has no custom routes or domains, D1/KV/R2/Durable Object bindings, or production-domain traffic. `GEOMACRO_SUPABASE_RUNTIME_MODE` stays `standby`. Payment provider credentials and acknowledgements are not installed. The existing B2 archive read-only key pair is installed as server-side Worker secrets; it must be limited to read access for the existing `geomacro-private-archive` bucket. On first provisioning only, the workflow generates a random 256-bit `GEOMACRO_SECURITY_FINGERPRINT_PEPPER` specifically for this staging Worker and installs it as a Worker secret. Later deployments retain the existing secret; its value is never logged or written to the repository. It is independent from the isolated read-only candidate. No B2 write key, Supabase key, model API key, production control-plane authority token, or payment credential is provisioned by this workflow. The app's existing handlers remain responsible for authorization, origin validation, rate limits, evidence freshness and fail-closed responses.

The customer account smoke deliberately sends no session cookie and must receive the existing 401. No customer SSR bearer is installed in staging: that bearer would authorize calls against the existing customer D1 Worker, and authenticated customer flows could mutate production data. Authenticated customer actions therefore remain unverified in staging until an isolated nonproduction customer backend exists or the owner separately authorizes a safe verification path. This limitation blocks a claim of complete functional parity and Lovable removal.

The staging marker is never proof of signed evidence, product readiness, or production activation. `/api/public-production-health` forwards to the existing `/api/health?deep=1` implementation and preserves its real status and response. The runtime verifier reports SSR/static assets, three-category source health, B2 verified-baseline read availability, B2 quota authorization, Ask POST, and signed-product readiness as independent diagnostics. It records actual health HTTP statuses; a 503 remains a failed gate and is never relabeled as healthy. Quota-authorized B2 access is blocked unless a separately exposed proof exists; staging does not receive a production control-plane authority token to manufacture that proof.

## GitHub Actions prerequisites

The existing `production` environment must provide these secrets:

- `CLOUDFLARE_API_TOKEN`: scoped to the existing account for Workers script deployments and secret writes.
- `CLOUDFLARE_ACCOUNT_ID`: the existing Cloudflare account ID.
- `B2_ARCHIVE_READ_KEY_ID` and `B2_ARCHIVE_READ_APPLICATION_KEY`: the existing bucket-scoped read-only key pair.
- `GEOMACRO_SECURITY_FINGERPRINT_PEPPER`: provisioned as a staging-only Cloudflare secret on first deployment and verified by binding name after every deployment.

The deployment fails closed if a required secret is absent, if the staging Worker has an unknown binding, if a custom route/domain is attached, if the exact `main` SHA changes during release, if any required CI check fails, or if live health/runtime acceptance fails. The job never prints credential values. An environment reviewer rule requiring manual approval would prevent fully automatic deployment; it must be checked in GitHub before claiming automatic deployment readiness.

## Live acceptance

The automated runtime verifier checks the exact build marker, SSR pages (`/`, `/intelligence`, `/ask-geomacro`, `/data-api`, `/institutional`, `/contact`, `/pricing`, `/auth`), referenced static assets, security headers, three-category live-structured health, B2 baseline reads and explicit quota-authorization status, existing signed production health and its public alias, control-plane readiness, pricing and machine-discovery routes, unauthenticated customer rejection, and an actual same-origin Ask POST that must return a governed answer event. It emits each acceptance area separately and exits blocked if any required gate is unavailable. A separate Chromium check renders the pages at desktop and mobile viewports, checks for horizontal overflow and verifies image loading. These checks perform no payment and do not write application data. The Ask request uses the existing authorized public endpoint and may read existing live source/backend data; its answer content is never logged.

If any live acceptance fails, the workflow reports a safe categorical failure and the deployment remains staging-only. The failure does not authorize a fallback to stale or synthetic data, or a Lovable disconnect.

## Reversible domain migration procedure

Cloudflare currently does not have a verified active DNS zone for `geomacro.live` or `www.geomacro.live`. A Workers custom domain/route cannot be presumed available while that zone is external. No workflow in this change modifies nameservers, DNS records, Worker routes, or production traffic.

After staging has passed all live acceptance checks and the owner explicitly approves cutover:

1. Inventory and save the registrar's current nameserver set and all current DNS records, TTLs, proxy settings and mail records. Confirm the existing Lovable origin and certificate behavior.
2. Add `geomacro.live` as a Cloudflare DNS zone and import/compare the complete current record set. Keep the existing Lovable records and mail records intact. Do not change nameservers until the owner approves that specific step.
3. At the owner's approved time, change nameservers at the registrar to Cloudflare's assigned pair. Verify authoritative DNS, HTTPS, apex and `www` behavior before enabling any Worker custom domain. Keep the Lovable origin available during this validation window.
4. Only after DNS is active in the verified Cloudflare zone, have the owner approve adding `geomacro.live` and `www.geomacro.live` as custom domains for the production Worker. The Worker redirects `www` to the canonical HTTPS apex; origin SSR retains canonical metadata and production HSTS behavior.
5. Run all live route, security, evidence freshness, Ask and backend checks through both public hostnames. If they fail, remove the Worker custom-domain assignment and restore the saved DNS records/nameservers to Lovable. Keep Lovable connected until the owner confirms Cloudflare acceptance.
6. Only after successful production-domain acceptance and separate owner approval should the Lovable mirror, publish workflow and Lovable build dependency be retired. This PR does not remove or disconnect them.

The steps above are a procedure only. The PR and automated workflow do not perform any DNS, route, or production traffic cutover.

## Cost and current limitations

The deployment uses the existing Cloudflare account and existing Workers service, with no new paid product, subscription upgrade, storage, or Durable Object. It makes bounded B2 read-only requests under the existing archive quota policy. GitHub Actions adds a build, live smoke, and Chromium desktop/mobile smoke on successful `main` updates; confirm the existing Actions quota before enabling the workflow in a protected environment.

This implementation is not migration completion. Cloudflare staging live acceptance, GitHub environment secret presence/approval settings, and an active Cloudflare DNS zone are not proven by repository tests. Lovable can be removed only after staging and then owner-approved production-domain acceptance.
