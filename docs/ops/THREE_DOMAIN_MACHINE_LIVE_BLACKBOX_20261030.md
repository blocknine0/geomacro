# Three-domain machine delivery deeper black-box audit (no funds)

GeoMacro's normal post-deploy GET JSON acceptance is necessary but not sufficient: an HTTP 200 can mask malformed clock semantics, source data being misrepresented as paid, identical analysis in all 3 categories, stale canonical D1, or a shadow failure of the separate 25h factual source pipeline.

## New test and operational boundary
The read-only script `scripts/ops/audit-three-domain-machine-delivery-live.mjs` executes **a maximum of six fixed public HTTP requests** against GeoMacro's existing Cloudflare Worker:
1. cached public three-domain structured GET;
2. no-cache GET for canonical origin; 
3. no-cache canonical D1 three-domain continuity GET;
4. the registered-source 25h machine-factual D1 GET;
5. an unsupported country-filter GET, which MUST NOT return 200 (the structured route has no country filter);
6. an unsupported POST to the same public route, which MUST NOT return 200.

The runner validates record-level native publication datetimes versus historical `observation_period`, 72h news versus annual references, the exact 3 category keys, field count parity, stale versus current source checkpoint clocks, absent data, no unlicensed raw source leaks, no source-publisher country wrongly certified as event-country, no score, no commercial source grant, no payment request, no signed GRO, no source rights escalation, and correct negative-route rejection. An identical full event-specific `what_changed` + `why_it_matters` repeated across all 3 independent native news categories fails rather than being accepted as meaningful analysis.

It prints only category COUNTS, delivery states, protocol checks and source family aggregate **not news titles, source IDs, D1 rows, request secrets or transaction data**. Original RSS source discovery is not automatically promoted to a current country event. `first_page` for the separate 25h factual pipeline is explicitly not full coverage nor 195x3 proof. A stale or quota-held D1 endpoint returns a nonzero test exit; no synthetic success.

## Automation
The additional GitHub Actions workflow `Three-Domain Machine Delivery Deep Live Audit (No Funds)` runs unit tests and this limited black-box audit on the exact pull-request head and on main when these test/audit files change. It also has manual dispatch for a subsequent evidence check. **No new recurring cron or source poll**, no D1 or B2 writes, no x402 settlement or USDC transfer, and no PREDGE touch. Each run consumes up to four already-public valid D1 GETs plus 2 negative methods; it is not a zero-cost source-account SLA.

## Success claims
A green run proves source-derived observational JSON can be retrieved **at that specific time** and has consistent public source boundary. It does NOT prove current independently corroborated/geolocated/rights-approved events in 195 countries, full 72h reliability, valid signed numerical GRI, payable Store eligibility, main website parity, or an acknowledged real mainnet USDC purchase. Those are different acceptance gates.
