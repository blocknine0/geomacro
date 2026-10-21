# Three category APIs and question agents

Implementation checkpoint: 21 October 2026. This document is an operational
handoff, not a statement that production payment or marketplace listing is live.

## One engine, three product identities

| Product | API POST | Agent tool |
| --- | --- | --- |
| Geomacro Geopolitics | `/api/v1/intelligence/geopolitics` | `geopolitics_query` |
| Geomacro Macro / FX | `/api/v1/intelligence/macro-fx` | `macro_fx_query` |
| Geomacro Critical Minerals | `/api/v1/intelligence/critical-minerals` | `critical_minerals_query` |

All three agent tools use `POST /api/v1/agent` with `{tool, arguments}`.
They also appear in the existing MCP tool discovery. These are separate
category profiles, not independently hosted reasoning engines or a claim of
unrestricted ChatGPT functionality. Query, evidence, pricing, response freezing,
payment and replay remain in the existing canonical engine.

Discover agent profiles at `/api/v1/agent`, exact input examples at
`/api/v1/agent?view=openapi`, and prices at `/api/v1/pricing`.

Example (unpaid request):

```json
{
  "tool": "critical_minerals_query",
  "arguments": {
    "country_iso3": "IND",
    "question": "What critical minerals risks affect India?",
    "fulfillment_mode": "published_only",
    "max_age_seconds": 3600,
    "detail": "compact",
    "client_request_id": "minerals-ind-0001"
  }
}
```

For a direct category API, use `subjects: [{type: "country", country_iso3:
"IND"}]` instead of the agent envelope, with the same question and fulfillment
mode. The category API fixes the topics. An out-of-category inferred question
is rejected before payment. The new tools preserve the customer's actual
question instead of replacing it with a generic risk-state prompt.

## Current delivery boundary

- `live_on_demand` is the default on category APIs and new question tools. It
  currently performs bounded research and returns a no-charge pending result.
  It cannot emit a payable offer, even if it finds current news.
- `published_only` explicitly invokes the existing commercial delivery path.
  It offers payment only if the exact requested product is available and passes
  the existing evidence, freshness, rights, pricing and durable preparation checks.
- Neither mode is a guarantee of fresh coverage in every country. A 195-country
  routing registry is not proof of 585 currently deliverable category cells.
- A payment signature never turns research candidates into commercial evidence.

## Payment and immediate response

The required buyer flow is:

1. Submit the exact query without a payment signature.
2. On `400`, `422`, `429` or `503`, do not authorize payment. Correct the request,
   wait as instructed, or show the returned availability problem.
3. On `402`, verify the exact resource, current query-bound quote, amount,
   network, native USDC contract and recipient against the buyer's spending policy.
4. Echo the Geomacro query and quote binding when signing. Retry the same
   request with `PAYMENT-SIGNATURE`; do not replace its question, topics,
   fulfillment mode, detail or client request ID.
5. On `200`, verify the immutable response hash using
   `X-Geomacro-Delivery-SHA256`; retain `PAYMENT-RESPONSE` and the quote ID.
6. Recover an interrupted delivery with the same proof and exact request.
   An ambiguous settlement needs reconciliation; never automatically generate
   a fresh payment authorization for it.

The server freezes the answer before issuing the quote and settles only after
its final eligibility checks. Retrieval and settlement latency still exist;
there is no unconditional instant-response SLA. Direct category and agent
facades quote the canonical `/api/v1/intelligence/query` payment resource.

The locked intelligence query prices remain 0.05 USDC focused, 0.10 standard
and 0.15 complex multi-source. Structural and other capability prices remain
in the existing catalog. Request `detail` is not permission to select a lower
price. The server determines the verified capability and variant.

## Production acceptance sequence

1. Merge the tested changes and deploy the same SHA. Verify live agent discovery
   contains all three question tools and existing category route identities.
2. Run `node scripts/ops/verify-live-category-endpoints.mjs`. It sends six bounded
   requests, uses `published_only` explicitly, never sends a payment signature,
   and writes a source-free blocked/pass report. It is a one-country check.
3. Resolve actual missing production configuration through the existing
   protected operator workflows. Use the existing recipient, provider credentials
   and durable ledger; never place secrets or a receiving-wallet private key in
   a public artifact. Runtime discovery must prove the active mainnet rail.
4. Produce an authentic qualifying answer for each launch category using the
   existing source eligibility and preparation path. Current signed products
   are needed where the selected product requires them; unsigned research is
   never represented as a signed score.
5. For paid live retrieval, connect accepted request-bound evidence to canonical
   durable preparation and prove its current rights and answer readback. The
   current unconditional pending research branch is not this acceptance.
6. Complete the existing capped operator payment, exact-byte customer readback,
   same-proof replay and reconciliation acceptance under the owner's applicable
   real-money authorization. This patch performs no payment.
7. Run prelisting and post-listing health against the deployed SHA. Both now
   compare dynamic 402 prices with the same query's free availability result;
   null GET discovery prices are expected under capability pricing.

## Marketplace distribution

Use `config/agent-marketplace-distribution.json` as the submission inventory.
Its three category products share canonical payment and evidence controls.
Do not report all targets as listed because the inventory exists.

| Surface | Verified publication route on 21 October 2026 | Required evidence |
| --- | --- | --- |
| Coinbase Bazaar | https://docs.cdp.coinbase.com/x402/buyer/discover-services | Observe the actual canonical resource in the public catalog |
| Circle Agent Marketplace | https://developers.circle.com/agent-stack/agent-marketplace/get-listed | Working payable endpoint, OpenAPI, confirmed payout address, intake submission and manual approval |
| x402scan | https://www.x402scan.com/discovery/quickstart | Origin discovery, review of detected resources, registration and observed listing |
| Other configured directories and Nevermined | Recheck current provider instructions before submission | Account/plan compatibility and exact listing observation |

Circle's marketplace review is manual. Supporting Arc as a network candidate
does not establish an active Arc merchant payment rail. Do not advertise a
network that the live payment challenge and settlement acceptance do not support.
Directory accounts, approvals, permitted pricing and quotas differ. Use only
free compatible distribution under the zero-subscription launch constraint.

Public listing verification, paid delivery verification and real external
customer revenue are three separate observations. Record each independently.

## Owner-approved three-chain launch update (21 October 2026)

The owner approved Base, Polygon PoS and Arc mainnet with a single NEW receiving
address. The actual new public address has not yet been supplied. Configuration
must not guess it, reuse an old receiver without confirmation, or place a private
key in the browser. `config/mainnet-three-chain-launch.env.example` names the
settings. Mainnet Coinbase and Circle configuration now rejects conflicting
recipient aliases before any payment offer.

The API page now has a bounded country/category query form. It checks actual
payable availability, validates native USDC and locked capability pricing for the
selected chain, shows the recipient and expiry, and asks the customer's wallet
to sign only after an explicit payment click. It never sends a direct token
transfer. It verifies exact delivered UTF-8 bytes and retains the same payment
proof in memory for recovery instead of automatically creating another charge.
A chain selection cannot enable an unsupported server payment rail. Native
EIP-3009 authorizations and Circle Gateway batching are different protocols;
the browser does not sign a batching requirement as a native transfer.

Current code still has a Base-only Coinbase paid adapter and a Base-only Circle
Gateway batching adapter. The separately existing native Circle verification
helper is not a complete Arc/Polygon settlement/status-to-delivery integration.
The three-chain merchant settlement acceptance remains OPEN. The owner approval
permits implementation and launch but does not fabricate missing credentials,
wallet control, signed products, or paid customer readback.

## The three acceptance requirements

1. **195 countries x 3 categories:** the proof rollup now emits all 585 cells,
   last-probe times and specific repair reasons. It accepts complete current
   coverage only when all 585 have actual country-relevant original-page proof
   observed within 24 hours. Older successful transport checks stay stale. The
   default 65-day bounded sweep does not claim simultaneous daily global proof.
   A repair queue is emitted; it does not trigger uncontrolled global polling.
2. **Original publication to served website <=20 minutes:** Intelligence article
   markup exposes only its existing derived story ID. The five-minute fastlane
   independently reads served HTML after publication and matches it to original
   timestamps. Receipt time is a conservative upper latency bound. Exact-clock
   stories visible at 15-20 minutes qualify; embedded JSON, D1 insertion time,
   day-only dates and older releases do not. Evidence is retained for seven days.
   This verifies actual samples, never an unconditional universal SLA.
3. **Signed commercial launch:** the launch report reads real deep health and
   payment runtime metadata and separately reports each current hot product.
   A successful unsigned Find or source scan never substitutes for certified
   inputs, rights, actual signatures and paid delivery. Receiver and provider
   configuration, current eligible signed products and per-chain settlement,
   exact customer-byte readback and replay must pass before closure.

Run `node scripts/ops/three-launch-blockers-report.mjs` for the source-free gap
report. Missing local coverage/latency receipts are explicitly unverified. The
weekly proof audit also writes this report; the five-minute source workflow
retains its own actual website sample receipts. No additional recurring workflow
or paid infrastructure was added.

The website source changes are founder-authorized by the request to put the
existing website into launch mode. The general website baseline is updated in
a separate commit after the approved UI commit; the independent frozen Global
Risk presentation is not changed. Existing Lovable source mirroring is retained.
Publishing still needs the existing project's authenticated deployment access.
