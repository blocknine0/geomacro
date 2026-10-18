# Canonical read-only web candidate

The existing app already builds for Cloudflare Workers. `Deploy Canonical Read-Only Web Candidate` publishes that same exact canonical main build to the isolated `geomacro-web-candidate` Worker after same-head Product CI succeeds. It does not change `geomacro.live`, DNS, the Lovable mirror, product signing or the launch decision. No scheduled polling is added.

The deployment uses the existing Cloudflare account and credential only for deployment. The app build receives no private credentials. The generated candidate configuration has no B2, D1, signing, provider, merchant or ledger secrets; it rejects an existing candidate with private or unknown bindings. Supabase remains standby. CPU is capped at 10 ms; no paid plan, extra storage, cron or external service is enabled.

The wrapper allows only GET/HEAD and refuses authorization/payment headers before calling the app. It also runs before static asset serving. POST-based Ask, retrieval and all payment/write operations are unavailable in this candidate. It is marked noindex and is not an alternate commercial API. The app's original HTTP statuses and response bytes are preserved, including signed-product deep-health 503.

Independent GET readback requires the exact build SHA, the read-only wrapper header and actual three-category `live-structured` source health. It records the separate signed-product health result without changing 503 to 200. A successful candidate job is deployment evidence only: `commercial_launch_ready` always remains false. Current signed publication still needs authentic eligible inputs and quota-governed B2/D1 proofs. Production-domain promotion and usable POST endpoints need their own acceptance.

The existing Lovable mirror/publish path remains documented in `HOSTING_ALIGNMENT.md`. This candidate removes the need for a Lovable console session to review a running current-code build; it does not attest publication on the production domain.
