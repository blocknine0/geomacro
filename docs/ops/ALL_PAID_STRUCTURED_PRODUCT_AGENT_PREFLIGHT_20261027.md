# Live structured-product API: governed buyer / agent preflight

**Scope:** Geomacro direct Store / commercial API only. No Predge paths, credentials,
contracts, partner delivery, data, or workflows are modified.

## Existing producer-to-buyer chain

1. The existing GitHub Actions / original-source collectors ingest candidates.
2. Canonical private D1 retains current observations and governed source clocks;
   B2 contains immutable archives/evidence and historical structural snapshots.
3. The existing structural context and query-plan engine qualify real original
   observations by requested ISO3, topic, module, native timestamp, source
   rights and (for signed products) authentic signer/expiry.
4. A user or agent selects one of the **12 active variants** in the existing
   7-capability founder-locked USDC Store catalog. The retired GRI read is not
   publicly advertised.
5. **New read-only data readiness**:
   `GET /api/v1/intelligence/products-availability` discovers all 12 variants
   and examples; `POST` with one exact canonical request checks live data
   eligibility without relying on merchant configuration. This cannot create
   signed proofs, missing evidence or paid output. It never charges.
6. The customer / agent calls the **existing**
   `POST /api/v1/intelligence/query` with the *same JSON request* to
   re-check current proof, assemble sanitized buyer-value fields, enforce
   exact price/data limits, freeze the answer in the existing Durable Object
   ledger, and receive a 402 only if live merchant configuration and all
   independently required authorizations are present. Payment is a separate
   explicit buyer choice. The same ledger guarantees immutable post-settlement
   delivery and replay without a second charge.

## Example: independent data readiness, zero USDC

```bash
curl -sS https://geomacro.live/api/v1/intelligence/products-availability
curl -sS -X POST https://geomacro.live/api/v1/intelligence/products-availability \
  -H 'Content-Type: application/json' \
  -d '{"schema_version":"geomacro.agent-query.v1","product":{"capability":"structural_country_digest","variant":"standard"},"fulfillment_mode":"published_only","delivery_tier":"structural_baseline","subjects":[{"type":"country","country_iso3":"USA"}],"topics":["critical_minerals"],"detail":"compact"}'
```

The example is a request template, **not proof of a currently purchasable USA
digest**. Use the exact same JSON in a subsequent authorized canonical POST.
For `signed_risk_object/newly_qualified_signed`, supply a new legitimate
`product.issued_after` bound to the desired issuance window.

- HTTP 200 `DATA_ELIGIBLE_NOT_YET_PREPARED_OR_PAYABLE`: existing
  qualification and precise catalog class pass **as data readiness only**.
  The canonical endpoint must independently prepare genuine buyer bytes and
  prove signed validity / price / funds before any charge.
- HTTP 422 `DATA_NOT_CURRENTLY_DELIVERABLE` or
  `STORE_PREFLIGHT_CAPABILITY_PROOF_UNVERIFIED`: insufficient, stale,
  mismatched or ineligible proof. No charge. Do not turn unscreened Website
  Intelligence candidate headlines into signed commercial events.
- HTTP 429: rate limited; back off, do not loop or force D1 reads.
- HTTP 503: proof engine unavailable; no charge, do not treat as positive.
- HTTP 400 / 413 / 415: bad or unsupported request. Payment/authorization
  headers are prohibited here.

## What this change does NOT certify

A merged branch, good CI, valid catalog or data-only preflight **does not**
verify currently deployed production executable SHA, latest source freshness,
12-of-12 commercial product availability, current signed Intelligence/GRI/Risk
Indices, cloud quota headroom, recipient ownership, mainnet approval, x402
settlement, actual USDC earnings, or external partner delivery. Maintain the
existing mandatory merchant/funds approval and all canonical payment gates.

## Acceptance to record before advertising any product LIVE

- Canonical website and Worker SHA parity with the serving deployment.
- Real original-dated D1/B2 readback; no stale or missing module promoted.
- Independent source-use / signed proof where the priced capability requires it.
- Nonpayable data preflight and canonical exact buyer response byte verification
  for the **same request hash**, including 422 and replay cases.
- Existing ledger, quote signature, amount, chain, token, payee and successful
  settlement reconciliation after explicit separate launch/funds approval.
- A real external user / agent receives the precise immutable purchased
  structured JSON; failed products receive no charge.

This adds no separate ingestion workflow, database, cron, queue, paid provider,
mainnet authorization or Predge integration.
