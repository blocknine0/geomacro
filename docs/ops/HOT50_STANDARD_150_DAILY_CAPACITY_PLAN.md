# GeoMacro Hot50 Standard Risk Gate — 150 successful paid checks/day target

**Owner requirement (10 Nov 2026):** deliver genuine Standard Risk Gate
checks to paying customers, with a *minimum commercial target* of 150
successfully delivered and settled checks per UTC day, then scale with demand.

**This is a target, never a sales promise, synthetic event count or request
ceiling.** 150 completed orders require actual buyers, suitable transactions,
merchant activation and provenance-qualified evidence. A test endpoint,
HTTP-healthy source, generic signed triage score or benchmark cannot establish
150 sales.

## Three independent country/category evidence lanes

- Geopolitics — original issuer sanctions, peace/security, armed conflicts,
  official export controls, sovereign foreign/trade ministry notices,
  plus independently verified second publisher for each admitted event.
- Macro/FX — original central banks and statistics authorities, policy rates,
  sovereign releases, verified trade and macro datasets, with actual dated
  source-native events; slow structural datasets must not pose as breaking news.
- Critical Minerals — first-party USGS, NRCan, mining/geology ministries,
  supply-chain export notices, commodity-specific national issuers and
  independent original-event confirmation.

Hot50 is the **only** commercial Risk Gate country set. Worldwide source
discovery (195 × 3) may continue but does not silently enlarge the paid
country set. The protected 20-minute multi-domain Cloudflare original
feed lane already prioritizes Hot50; separate Supabase research-only
stream uses a locked original eight-feed manifest and isolated optional
four-feed discovery overlay. Discovery candidates do NOT become a commercial
proof because a feed responds with HTTP 200.

## Standard qualification and delivery sequence

1. Retain dated native first-party original, country category subject
   attribution and traceable fact/evidence digest. Denied/blocked publishers
   stay denied. Different syndication copies within six hours are not
   independent corroboration.
2. Confirm **at least two genuinely independent original issuers for
   the same event**, three verified category fact sheets for the requested
   country and unexpired source/evidence validity.
3. Generate a qualified Standard risk evaluation only from the protected
   canonical verifier. Any missing category, source rights, evidence freshness,
   signatures or independent confirmation => `INSUFFICIENT_CORROBORATION`
   / `INCONCLUSIVE_NO_CHARGE`, not a fabricated rating.
4. Return advisory-only result (`execution_authorized=false`) with
   cryptographically signed delivery receipt, idempotency and customer
   settlement **only after qualified successful delivery**.
5. Keep Basic/Standard/Complex tier semantics and present deployed pricing
   unchanged. Direct customer pricing and Predge partner settlement terms
   are separate; this work does not activate PayPal, Predge paid traffic,
   Coinbase payments or modify crypto contracts.

## Commercial throughput math

A 150/day objective corresponds to 6.25 successful paid Standard
deliveries/hour or one every 9.6 minutes on average. Existing qualified
risk evidence may be reused for multiple independent legitimate requests
**only while still valid**. Thus 150 purchases do not require 150 newly
published real-world events, but every invoice does require an actual
qualified paid result and independent unique idempotency key.

Scaling must be measured from actual settlement ledger counts and verified
response delivery; do **not** substitute:
- number of publisher feeds or HTTP 200 responses;
- raw candidates, D1 inserts, verified event counts;
- cache hits, synthetic load tests, 50x3 readiness snapshots;
- signed *research-only* scores or internal source-transport HMAC.

The current no-funds monitor adds the 150/day **target**, 50x3 audited
country/category gaps and genuine per-country Standard product READY states
to the existing Risk Gate tier-check receipt. It explicitly reports daily
paid delivery capacity and observed actual sales as UNKNOWN until an
independent paid ledger is observed. The existing scheduled one-country
sample is not extrapolated to all 50.

## Automated sustainable expansion

* Always-on source ingestion: prioritize original Hot50 first; bound source
  GETs, obey provider Retry-After, rotate global research separately and
  record per-category source clock/transport health. Retain B2/D1 parity and
  reconciliation; no queue delay is allowed in synchronous Risk Gate reads.
* Source repair: any missing three-category verified evidence is a priority
  to revalidate source URLs, native article clocks, country scope, original
  rights and independent same-event confirmation. A source failure triggers
  a different authorized original-publisher candidate; never mimic the
  blocked publisher or count duplicate syndications.
* Scale to higher demand using measured traffic and spend telemetry:
  request concurrency, worker CPU/timeout, D1 rows_read/written, B2
  request/storage costs, cache hit rate, evidence TTL, signed-GRO freshness,
  refund rate and confirmed settlement throughput. Recompute headroom before
  increasing quota/admission; preserve the account-level spend policy.
* On outages, only authorized source ingestion retries and durable hold/replay
  should recover automatically. API verdicts fail closed on missing proof,
  and paid settlement must not retry using a fresh request ID after an
  unknown COMMIT acknowledgement.
* Independent acceptance: a live original article + distinct corroboration
  receipt for each required category, signed verdict readback, real Standard
  successful-delivery receipt, and paid ledger counters. A sustained
  150/day result requires at least one complete UTC day of actual
  independently verified deliveries, not future projections.

No commercial launch or provider quota/canary hold is waived by this runbook.

## Continuous source-gap repair triage (11 Nov 2026)

The protected tier proof now emits an additional `standard_source_recovery` artifact:
the precise missing Hot50 country/category cells, ranked by (a) upstream
tier-contract failure, (b) zero eligible **candidate** first-party host groups,
(c) only one candidate host group, then (d) verification/signing deficit.
It excludes retired transport pins. Grouping by host is deliberately conservative
and is **not** proof of an independently authored same-event claim. All
candidates still require native publication timestamps, legal use-term review,
distinct original authorship, exact-event corroboration and cryptographically
verified current signed GRO. No Google News, Telegram or editorial syndication
counts as an original first-party issuer.

A complete governed 50-country x three-tier no-funds census is now scheduled
once daily at 00:07 UTC after provider quota admission. Other 20-minute
samples continue unchanged. The periodic full census does not imply successful
payments, lift paid product launch holds, increase spending permissions or
weaken the independent production release/canary requirements.

Scaling is limited by measured genuine paid delivery/settlement and verified
provider headroom. Initial daily target: 150 (6.25/hour), then capacity can
increase only against real concurrency, p95 latency, no-charge ratio, webhook
delivery and D1/B2 usage evidence. The plan is an actionable repair queue
for operators, **not** a newly deployed source-poller or a certified uptime SLA.

## Authenticated transport proof — direct Worker origin

The daily Hot50 no-funds verifier now uses the direct deployed control-plane
Worker endpoint already configured as the commercial API's default
`RISK_EVIDENCE_ORIGIN`. The historical `api.geomacro.live` custom-domain
proxy is not certified by the deploy canary
(`UNIFIED_RISK_207_PRODUCTION_ACCEPTANCE_20261103.md`).
An authorized HTTP 401/503 JSON response is not conflated with network failure,
invalid JSON, unexpected HTML or an unexpected redirect. Results expose
only aggregate transport classes, HTTP statuses, symbolic tier states and
source-gap counts; credentials and response body stay private.

Run 42878465451 on 10 Nov returned all 150 tier probes as
`TRANSPORT_UNAVAILABLE` against the uncertified custom domain, so the
result cannot assess original source coverage or real qualified delivery.
This change fixes probe origin and classification, not issuer eligibility,
production source rights, signing, canary holds or actual paid throughput.
