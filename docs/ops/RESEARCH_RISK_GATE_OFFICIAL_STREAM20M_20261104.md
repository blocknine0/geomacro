# GeoMacro research-only Risk Gate: direct official 20-minute source-to-state

Status: CODE-LEVEL INTEGRATION, NOT VERIFIED 24/7 FULL-LIVE ACCEPTANCE.

## Canonical noncommercial flow

Pinned reviewed GOV.UK OGL Atom -> original entry with precise <published> ->
single unambiguous title-country and provisional three-domain severity ->
re-fetch the EXACT GOV.UK original article HTML and first-party Content API ->
confirm original title, document type, original first-published clock ->
direct service-role-only atomic Postgres RPC -> Ed25519 research-only
signature for severity >=70 -> independent Supabase signed row GET ->
SHA-256 + Ed25519 + exact version/expiry verification -> separate private
POST /api/research-risk-gate. No direct financial execution.

This is research observation, not incident truth, a paid GRO, sanctions
screening, independent same-event corroboration or proof of country risk.
Source rights are scoped to selected UK Crown/government publications under
OGL v3 and require excluding third-party material. The runner only handles
first-party page metadata and does not retain or redistribute article bodies.
Other publishers and all 195 countries are NOT covered by registration alone.

## Existing source inputs and stores are unchanged

The separate Hot-50/direct 20-minute private collection, protected AEAD
source queue, B2 and D1 original-evidence archive, verified production signed
GRO path, Predge pilot, payments and /api/risk-gate are untouched.
Queue-less means the RESEARCH decision-read path does not depend on pending
articles. It does NOT mean the existing 7,305 private evidence records were
removed or that RabbitMQ was decommissioned. Do not run rabbitmqctl purge_queue
or a service stop until the queue's actual broker/name, message identity,
owner, replay/retention controls and independent B2 readback have been
established. Zero blind deletion of evidence is authorized.

## Production credentials, all server-side only

The separate isolated Supabase staging/research project is
geomacro-risk-corridor-7d (ref ymjuwuvbialsevfawvvq).
The existing migration 20261104090800_research_country_risk_state_noqueue.sql
contains the correct seven-argument RPC. Do NOT run the user example
four-argument function: that removes dedupe and old evidence clocks.

GitHub Actions production-environment secrets required:
- GEOMACRO_RESEARCH_SUPABASE_SERVICE_ROLE_KEY
- GEOMACRO_RESEARCH_SIGNING_PRIVATE_KEY_PKCS8_B64
- GEOMACRO_RESEARCH_SIGNING_PUBLIC_KEY_SPKI_B64

The workflow supplies the exact staging URL and an independent signing key ID,
geomacro-research-2026-11, as public non-secret configuration.
Key pair must be NEW and must not use production signing
geomacro-risk-2026-03. The private PKCS#8 and public SPKI values must be
DER encoded and then base64 encoded; raw PEM is not the expected field shape.
Never paste keys or bearer tokens into chat, code, public logs or artifacts.

For the website runtime (NOT browser environment variables), provision
GEOMACRO_RESEARCH_RISK_GATE_ENABLE=1,
GEOMACRO_RESEARCH_SUPABASE_URL=https://ymjuwuvbialsevfawvvq.supabase.co,
GEOMACRO_RESEARCH_SUPABASE_SERVICE_ROLE_KEY,
GEOMACRO_RESEARCH_SIGNING_PUBLIC_KEY_SPKI_B64,
GEOMACRO_RESEARCH_SIGNING_KEY_ID=geomacro-research-2026-11,
GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN (independent >=32-character private
token). Website read requires public key, NOT the signing private key.
The production server must protect service role from browser exposure.
The worker must not be configured via a bare 'wrangler secret put' from
an arbitrary directory that may select the wrong service.

## Scheduling and acceptance

Scheduled: UTC 07/27/47; independent alternate workflow_run on the existing
Hot-50 Direct Original News workflow. GitHub scheduled tasks are best-effort,
not a guaranteed 20-minute SLA or high-availability daemon.
No state rows are initialized for a country lacking an actual qualifying
original. No candidate backlog or news index becomes a source-rights flag.
When official publishers return 403/429, malformed clocks, or no relevant
items, the job reports numbers instead of minting a fake GREEN score.
The feed reader caps original article rechecks, uses only pinned www.gov.uk,
prohibits redirects and records numeric receipts without article text.

Validation order:
1. GitHub PR source tests plus existing research signed state tests.
2. Confirm production environment/secret availability without printing secrets.
3. Observe real scheduled job and its sanitised counters with >0 exact
   publisher HTML + Content API original clocks.
4. Query public.country_risk_state in the ISOLATED project: require a genuine
   new country/version, correct updated_at and signed_version==version.
5. Authenticated /api/research-risk-gate read for TWO signed-current countries;
   require independently verified signatures and execution_authorized:false.
   A missing country means HTTP 503/PAUSE, never a fake 200.
6. Run k6 only with an owner-issued read token. Measure p50/p95/p99 and
   non-200 counts: scripts/ops/benchmark-research-risk-gate.k6.js.
   50 VUs for 10 seconds tests an end-to-end 10ms p95 TARGET, not a promise.
   Network TLS and round trip make <10ms globally unlikely; do not falsely
   claim 3-5ms from application caching. Responses are private/no-store.
7. Monitor repeated real source runs and state-age/expiry. Without a live
   freshness audit over >24h, '24/7 accepted' is NOT established.

## Architecture invariants

Research-only scores are provisional heuristics 0-100. Publication-time
verification validates the first-party page identity/clock, not whether
a sanctions policy is effective or a conflict is independently confirmed.
Country mention from a headline is a preliminary subject hint; a release
mentioning multiple countries is discarded by the one-country research
bridge to avoid inventing affected jurisdictions. Provisional risk must not
join the verified commercial signed GRO or grant execution. The protected
Postgres RPC retains evidence hash idempotency, exact original clock
guard, CAS signature version, RLS and no PUBLIC/anon/authenticated execute.

## Operational blockers not bypassed by code

Owner-managed GitHub production secrets and host server read-only token/keys
cannot be provisioned by repository code. Source feed outages, per-country
coverage limits, provider rate limits, 20-minute GitHub scheduler delays and
public network latency require independent live acceptance.
