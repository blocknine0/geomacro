# Geomacro Groq strict browser acceptance + current signed hot recovery

Production lock, 22 October 2026. The owner confirmed the Groq account is
Free and existing `GROQ_API_KEY` is configured in Lovable and in protected
GitHub. GitHub and Lovable are connected, and Lovable AI edit credits are
exhausted. Use no new API key or paid provider.

## A. Real Groq browser-search and strict structured contract

**Why two stages?** Groq explicitly does **not** support structured outputs
in the same request as built-in `browser_search` for GPT-OSS. A normal
tool call can return citations and model prose rather than raw JSON.
Production code `scripts/lib/groq-browser-live-fallback.mjs` is locked to:

1. Original first-party sources/GDELT indexing before any Groq request.
   Groq receives only canonical country code/name and fixed category
   terms. No user question, raw article, private key, URL or dataset.
2. Groq `openai/gpt-oss-20b` tool request `tools:[{type:"browser_search"}]`,
   `tool_choice:"required"` (one bounded 22-second call).
3. Parse only exact schema `geomacro.groq.browser-research-leads.v1`.
   If the browser response is cited prose, at most one **separate**, tool-free
   `response_format:{type:"json_schema",json_schema:{strict:true,...}}`
   Groq call transforms the untrusted browser text. No browser+JSON-schema
   same-call fallback and no retries. Total <= 2 provider calls.
4. Run **the same independent Geomacro post-validator** on either JSON result:
   keys exact, category enum, max three leads, own 25–320-character
   paraphrases, private source host fingerprint only, no URL/HTML or copied
   upstream text, no future/invalid publisher calendar date. Empty `leads:[]`
   accepted by schema but **no event** is invented or published.
5. Mark outputs `provisional`, not authenticated original news, not
   independently certified GRI/Indices, not commercial licence and not paid.
   No B2/D1 writes, customer payment or rights/signing authority generated.
6. A GitHub `production`-environment **real** one-off browser acceptance
   workflow `groq-live-browser-structured-production.yml` runs on merge
   (or explicit manual request); it prints sanitized booleans/counters only,
   never provider snippets or credentials. The live HTTP200 and strict
   schema acceptance must be observed before claiming actual search success.
   No cron and no Lovable AI editor credit requirement.

Groq docs:
- https://console.groq.com/docs/tool-use/built-in-tools/browser-search
- https://console.groq.com/docs/structured-outputs

## B. Current signed hot products: exact missing dependencies

**As of 2026-10-22 07:39 UTC, not recovered.** The latest isolated D1
metadata query shows:
- Intelligence: source-age 18,054 minutes, expired 17,695 minutes
- Global Risk GRI: source-age 19,289 minutes, expired 19,200 minutes
- Risk Indices: source-age 20,266 minutes, expired 20,177 minutes

All three are rejected with `SOURCE_TOO_OLD` + `EXPIRED`.
Control-plane D1 health 200 is real; commercial hot snapshot endpoints
return 503 `HOT_SNAPSHOT_STALE_OR_INVALID`.
Actual deep website: `production_data_runtime_configured:false`,
`b2_runtime_configured:false`, signed 3/3 ready **false**. Existing
B2 snapshot source histories and/or serving proofs are unavailable.

The **real** dependency/order to restore continuously, without an always-on
owner laptop:
1. **Current original evidence**: use automated official-source intake
   (Global/Category first-party sources), native publication and event
   timestamps, source identity, retractions/contradictions, exact supported
   original byte hashes. 195-country routing already exists; do not pretend
   a source was published today because its feed was fetched today. Fresh
   optional Groq research is not an authentic original HTML readback.
2. **Lawful use review**: only publish original Geomacro factual synthesis
   on unrestricted factual terms; third-party expression, database access
   restrictions and licensing must still be honored where applicable.
   Do not blanket-mark all publisher rights `true`. Raw article not
   delivered helps but is not a global license.
3. **Machine Facts + Rights**: existing distinct pinned Ed25519 PUBLIC key
   authorities are configured on protected GitHub. Only genuine approved
   event-scoped Facts/rights signatures from their actual separately
   governed custodians pass the existing machine Intelligence publisher.
   An AI analyst can create a research suggestion, not a fake signature.
   Owner currently has no human independent GRI reviewer; do not spoof it.
4. **Current global-risk scoring**: the strict reviewed-GRI contract
   requires a genuine separate review signature, numerical GRI v1.2,
   country-category certificates and exact historically pinned B2 input.
   Existing production reviewer PUBLIC PEM is absent. An alternative
   *Geomacro AI-internal-reviewed* trust profile can be developed as a
   separately declared signed product but cannot masquerade as existing
   `independent-reviewed` GRI or silently satisfy old paid contract.
5. **Protected cloud publication**: immutable signed inputs (not filename
   hints alone) → quota-governed exact B2 staging, gzip/hash readback →
   D1 three hot product promotions via the existing canonical publishers.
   Risk Indices must derive from the **verified current** GRI parent, not
   arbitrary daily risk classifications.
6. **Health and longevity**: independently verify current source-native
   freshness and correct schema, Ed25519 signatures, 3 unique product
   B2+payload hashes, D1 exact readback and public GET 200. Keep
   `/api/health?deep=1` HTTP **503** until all mandatory conditions pass.
   Existing 15m SHA-hint cadence is already cloud-hosted and dispatches
   ONLY real, approved qualified input; it is **not** a source signatory.

## C. Permanent source/backstop operations

- Keep 5-minute official ingest, hourly free Geomacro derived news,
  15-minute signed-ready hints and signed hot pre-expiry guard operating
  in GitHub/Cloudflare/D1. Laptop does not run as a daemon.
- Free news and provisional AI research may remain available while signed
  commercial three-product health returns 503; do not label free news as
  certified GRI/Indices or stop free Find publication because no reviewer.
- Existing `Public D1 Hot Serving Root Cause` workflow is a real
  read-only production diagnostic, including source ages/expiry and missing
  approved signed hints; it cannot safely auto-sign a missing reviewer.
- Public B2 serving mismatch requires **real** current hot-publisher output
  plus verification of serving bindings/provenance, not a fake `200` or
  increased TTL/retimestamp to hide expired origin evidence.
- Preserve x402 no-funds until a separate actual paid acceptance succeeds.

## Acceptance status

| Contract | Required proof | At implementation |
|---|---|---|
| Groq production search | Protected real HTTP 200, strict schema parsed | New one-shot workflow; wait for actual run |
| Free 3-domain structured Finds | D1 exact SSR and public readback | Existing free pipeline operational, sparse minerals |
| Intelligence signed hot | Fresh three-domain independently approved source package + B2/D1 | BLOCKED |
| GRI signed hot | Real independent numerical GRI reviewer/certificates and B2 | BLOCKED |
| Risk Indices signed hot | Verified current GRI parent and independent indices publication | BLOCKED |
| Deep health 200 | All three above current, exact deployed build SHA | BLOCKED |

## D. Latest actual production proof (22 Oct 2026 08:47 UTC)

**Groq resolved:** [Run 39749895271](https://github.com/blocknine0/geomacro/actions/runs/39749895271)
used the existing protected Free-plan Groq key and **real built-in
browser_search**. Provider HTTP 200, executed_tools browser_search marker
observed, production exact-schema validator accepted the result; one
Groq API call, zero payments/B2/D1 writes. It returned `leads:[]`,
so source-authenticated structured **event coverage is zero in this
canary**: that is a valid no-qualified-leads outcome, not a publication
failure or proof of new factual coverage.

The 2026-10-22 quota fix charges BOTH provider requests when a cited
browser response needs a separate tool-free structured JSON conversion;
previously the per-runtime limiter counted only the initial browser
request. It remains a **per Node process** guard, not a shared
organization-level limiter. Canary now also rejects a fake
schema-conformant completion without actual `executed_tools:browser_search`.
Do not bypass Groq Free plan limits or create a second paid account.

**Signed products still unresolved:** [Public D1 Hot Serving Root Cause run
39750306729](https://github.com/blocknine0/geomacro/actions/runs/39750306729)
independently found D1 control-plane HTTP 200 but hot endpoints all
HTTP 503, original native timestamps 18,122 / 19,357 / 20,334
minutes old (Intelligence / GRI / Indices respectively), all
`SOURCE_TOO_OLD` and `EXPIRED`. Its real production JSON places
`historical_b2_baseline_readable` on the top level and uses
`products.<product>.status`; corrected the recovery handoff to read those
actual fields. The fix **does not** mint a signed product, download B2
bytes, extend validity or turn 503 into 200.

There is no authenticated fresh three-domain Facts/Rights dual-signed
machine batch, independent numerical GRI and country/category
certificates, or current canonical B2/D1 publication proof. Existing
reviewer PUBLIC PEM was not configured, and owner has no independent
human reviewer. An internal AI research validator **cannot** claim a
separate independent authority. To monetize alternate AI-reviewed
Geomacro-original insights, explicitly establish and test a separate
`geomacro.ai-reviewed` product/trust/scoring contract; do not pass
unreviewed data to the current `independent-reviewed-gri-v1.2`
publisher or override `health?deep=1`.

The remaining operational steps are actual-source input/custody and the
protected publisher's real B2/D1 readback. The owner's laptop is **not**
needed 24/7. Keep source-only public Finds active and payments at
controlled prelaunch in the meantime.
