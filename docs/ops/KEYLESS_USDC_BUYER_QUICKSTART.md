# Geomacro USDC Pay-Per-Call — Buyer Quickstart

**Current status: controlled prelaunch; no production USDC payments authorized.**

Geomacro is preparing the same **buyer interaction pattern** used by public
keyless x402 merchant APIs (such as Predge), not their dataset or pricing:
free discovery → exact request-specific availability → HTTP 402 only for
genuinely eligible results → wallet-signed Base USDC → independently
verified, derived structured JSON. **Do not send Geomacro an API key or
the buyer wallet private key.** Managed API keys remain Coming Soon.

No subscription required for per-call x402 after activation. Fixed prices
are Geomacro's canonical founder-approved capability catalog, **not** the
prices of Predge or any other merchant.

## Discover without an account or wallet

```bash
curl -fsS https://geomacro.live/api/v1/pricing?view=buyer
curl -fsS https://geomacro.live/.well-known/x402.json
curl -fsS https://geomacro.live/openapi-x402.json
```

Before activation, the existing locked website x402 discovery correctly exposes `resources: []`
and `productionFundsAuthorized: false`. A future paid route will become
public only after production acceptance and explicit separate owner approval.
**Never construct your own 402 challenge from this static catalog.** The
real server's PAYMENT-REQUIRED header controls amount, USDC contract,
network, pay-to receiver and expiry.

## Check exact data eligibility, always free

```bash
curl -sS https://geomacro.live/api/x402/risk/availability \
  -H 'Content-Type: application/json' \
  -d '{
    "schema_version":"geomacro.agent-query.v1",
    "question":"What are the latest verified macro and FX risks for India?",
    "subjects":[{"type":"country","country_iso3":"IND"}],
    "topics":["macro_risk","fx_external_risk"],
    "evidence":"required",
    "detail":"standard",
    "fulfillment_mode":"published_only"
  }'
```

HTTP 422 + `availability.deliverable:false` is an honest, **non-chargeable**
answer. The evidence, commercial eligibility, current signed object, country
and corridor module requirements must all pass BEFORE any quote is payable.
Do not use an unrelated free news card to manufacture a paid score.

## Once (and ONLY once) the launch is independently enabled

Use your own x402 v2 client. For an authorized buyer wallet, an eligible paid
call can return `402 PAYMENT-REQUIRED` with exact USDC terms for Base
(`eip155:8453`). The client signs the exact authorization and retries the
same request. A successful response includes the bounded, structured
Geomacro answer and the receipt required by the provider contract.

The canonical route is `POST /api/v1/intelligence/query` and existing
Coinbase compatibility is `POST /api/x402/intelligence`. MCP agent tools
can be discovered from `POST /api/mcp`; the OpenAPI is at
`/openapi-x402.json`. Unlike Predge's simple GET signals, Geomacro's
intelligence is an exact-query-bound POST; the SAME body must be used for
availability, payment and delivery. Do not send payment proof to the free
availability route.

## Fixed founder pricing (USDC/request)

| Capability | Variant | USDC |
|---|---|---:|
| gri_read | verified_cached | 0.005 |
| gri_read | verified_change_attribution | 0.01 |
| structural_country_digest | standard | 0.02 |
| structural_corridor_digest | standard | 0.05 |
| structural_country_profile | standard | 0.03 |
| structural_corridor_profile | standard | 0.08 |
| intelligence_query | focused | 0.05 |
| intelligence_query | standard | 0.10 |
| intelligence_query | complex_multi_source | 0.15 |
| signed_risk_object (controlled pilot) | existing_valid_signed | 0.05 |
| signed_risk_object (controlled pilot) | newly_qualified_signed | 0.10 |
| risk_gate_bundle (controlled pilot) | existing_proof_preflight | 0.10 |
| risk_gate_bundle (controlled pilot) | standard | 0.15 |
| risk_gate_bundle (controlled pilot) | complex_multi_source | 0.25 |

Prices are immutable unless the owner approves a separate later revision.
The shared `src/lib/capability-pricing-catalog.ts` is the pricing source.
The public runtime API buyer catalog derives all variants and atomic prices directly from the canonical pricing source, and CI checks parity.

## Merchant and buyer safeguards

- No call may be priced while the product has no valid source/right/current
  evidence qualification. Historical/derived-only evidence may be usable
  for an explicitly structural non-score product, but does not magically
  satisfy an independently reviewed numerical GRI or signed hot product.
- Unavailable/expired/ineligible/4xx/5xx results do not create a new charge.
- Client-side budgets and max-price caps are advisable for buyer agents.
- Provider payment verification is bound to exact request, exact paid
  variant, chain, asset, payTo, amount and replay-safe request fingerprint.
- Real settled payments must reconcile with the same signed delivered output;
  uncertainty uses the existing manual-review/reconciliation state, not
  blind repeat settlement.
- Every consumer can check signed risk object proofs using existing public
  Geomacro verification surfaces. A generic derived news receipt is not a
  signed commercial GRO.
- The **initial launch cohort** remains locked until a valid live website
  SHA, current protected signed data, actual x402 verification/settlement,
  source rights and separate real-USDC owner acknowledgements pass.
- Geomacro does not take custody of the customer's trading/payment funds
  and `execution_authorized=false` is a standing product boundary.

### What Predge demonstrates vs. what Geomacro must still prove

Predge's public docs show a wallet-keyless x402 merchant offering with
OpenAPI, MCP, per-call prices and signed receipts. That is evidence of their
published product design, *not independently audited Geomacro revenue*.
Geomacro already has the relevant code pathways, but currently fails
live 503 / three signed hot products 0-of-3 and hasn't passed a real
reconciled mainnet purchase. This guide cannot activate payment, sign missing
source attestations, or prove live operational readiness.

See `docs/ops/COMMERCIAL_LIVE_NO_FUNDS_ACCEPTANCE_20261023.md` for the
required genuine protected publisher, B2/D1 and Lovable deployment sequence.

## Founder-published website lock

For security, approved website pages and public static discovery are pinned to a founder-approved published baseline. The free read-only **runtime GET /api/v1/pricing?view=buyer** is a backend-only API route, so it can ship and be validated without bypassing that lock. Public storefront layout and `/.well-known/x402.json` publication changes require a dedicated owner-approved website publish/baseline process; they are not claimed complete by this API change.

This catalog reuses the existing **free** \`GET /api/v1/pricing\` endpoint with exactly one \`view=buyer\` parameter; every other query parameter remains rejected. No additional filesystem route is introduced or added to the released TanStack router tree.\n