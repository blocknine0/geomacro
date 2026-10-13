# Geomacro first earning pilot — one x402 endpoint, one narrowly labelled product

## What is being sold

The **structural_baseline** tier is *derived structural intelligence* computed only from currently eligible first-party governed modules. It may cover one ISO3 country and **one explicit** Geopolitics, Macro/FX or Critical Minerals baseline topic. This is not a live risk score, signed GRO, GRI, prediction or verified current event; buyers must never be promised those fields in this tier.

It reuses the **same canonical x402 payment and exact prepared delivery** as the existing adaptive API, avoiding a new wallet, agent engine, marketplace backend, ledger or Supabase dependency.

The existing `signed_risk_intelligence` contract is unchanged, including its previously issued query-plan payment hashes.

## Buyer flow — no wallet or funds touched in discovery

1. The buyer discovers category templates with `GET /api/v1/intelligence/availability`. This is an advertisement of supported *request types*, **not** a claim that any country has payable data.
2. The buyer sends a request to `POST /api/v1/intelligence/availability` with `Content-Type: application/json`:

```json
{
  "schema_version": "geomacro.agent-query.v1",
  "delivery_tier": "structural_baseline",
  "fulfillment_mode": "published_only",
  "subjects": [{"type": "country", "country_iso3": "USA"}],
  "topics": ["macro_risk"],
  "detail": "compact"
}
```

3. The response requires actual module availability, source-native freshness, rights eligibility and an identical `query_plan_hash`. HTTP **422** means the request is **not deliverable**; never offer a payment. HTTP **200** with `ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED` means data preflight passes but owner/facilitator/mainnet setup is still locked. HTTP **200** with `ELIGIBLE_FOR_X402_QUOTE` only means the buyer *may ask* for a quote; it does not request or collect payment.
4. The buyer POSTs the **exact same JSON body** to `/api/v1/intelligence/query`. The canonical adaptive handler independently checks deliverability **again** and may return HTTP **422**. If real Coinbase production config is authorized, it returns the authoritative **402 PAYMENT-REQUIRED** quote. The price in this quote—not a guessed website price—is the contractual amount.
5. After the buyer explicitly pays through its own x402 client, the unchanged Coinbase flow validates proof, claim/idempotency, final deliverability, prepared sanitized/hash-bound derived response and settlement **in that order**, and returns the paid answer. Failed availability never becomes chargeable. Ambiguous settlement is frozen for reconciliation, never charged again automatically.

Other supported pilot topics: `sovereign_risk`, `fx_external_risk`, `critical_minerals`, `conflict_geopolitics`. Only one topic and one country per pilot purchase; corridor, multi-country, ranking, current news, risk gate, signed risk object or GRI requests remain on their own existing gated contracts.

## Guardrails and zero-cost constraint

- No novel LLM, new paid provider, raw source resale, publisher URL, Supabase write, extra storage or third-party consumer analytics.
- Public preflight limited to three requests/minute/client and 24 globally; cannot accept a `PAYMENT-SIGNATURE` header.
- Each provider and methodology is **never automatically declared payable**. A baseline may be sold only if the existing canonical source rights, freshness and deliverability guards all pass.
- Production Coinbase x402 remains behind **both** `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH` and `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`, plus mainnet recipient, valid credentials, no emergency freeze and explicit founder real-money authorization. **Do not set either ACK** until independent zero-funds preflight and owner approval.
- The free Intelligence website's original-publication lag (15min) and Global Risk lag (60min) remain unchanged.
- A confirmed transaction receipt / ledger reference and successful purchase response is the first revenue proof. A GET/200, green CI, x402 quote or signed hash does **not** mean a customer paid.
- Before first buyer invitation, obtain an independently observed eligible pilot topic and country, and run three negative checks (unavailable, stale, and ineligible-source) plus positive no-funds quote/delivery rehearsal. If none eligible, do not invent availability.

## Production acceptance checklist

- [ ] Latest PR-head Product CI, CodeQL, no-funds x402, Website Lock and route inventory pass.
- [ ] Merge and deploy canonical main + verify exact live SHA.
- [ ] Confirm `GET /api/v1/intelligence/availability` and POST live for at least one actually eligible country/topic, or state precisely if none exists.
- [ ] Confirm existing canonical x402 422 → 402 only for genuinely deliverable cases in **no-funds** run.
- [ ] Explicit user real-money ACK before any mainnet payment; run first 0.05 USDC payment *only* against actual ready signed or properly labelled baseline intelligence.
- [ ] Verify Coinbase settlement on Base and idempotent ledger replay; then earn and expand gradually.

The large signed GRO/GRI B2/D1 hot recovery remains a separate blocker for **signed risk products**. Structural_baseline does not pretend it solved #2124.
