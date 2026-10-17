# Capability prequote storage — no funds

The existing Commerce Ledger adds authenticated capability quote freeze/readback
and delivered-only replay. This extracts storage operations from draft #2242;
it does not merge or enable the provider payment-route integration.

The Worker imports the application's pure founder-locked price catalogue.
All fourteen approved variants, exact atomic/decimal amount, canonical Base
USDC, provider/environment, five-minute expiry, request/answer hashes and
quote identifier are checked before storage and again at readback. Invalid
or additional fields fail closed. These checks certify storage consistency,
not source rights, a registered signature or an eligible customer product.

Each provider/environment Durable Object holds at most 64 active capability
prequotes of at most 96 KiB. The transaction prunes expired prequotes only;
existing payment, audit, usage and WDI records remain untouched. Existing
delivery claim/prepare/complete contracts are preserved. Delivered replay
cannot create a claim, authorize a payment or promote a pending result.

Deployment uses the existing protected main workflow. Node 24 runs the shared
TypeScript catalogue's local contracts, Wrangler bundles it for Workers, and
health propagation waits for both WDI and capability markers. Protected
acceptance then checks exact synthetic UTF-8 bytes twice for each payment
rail, idempotency, corruption, immutable terms, expiry, auth and cross-rail
isolation. Tests and probe never invoke a provider settlement or use signing
keys or a wallet. A successful probe is not a real customer delivery.

Website publication/readback, genuine source/rights/signing admission,
current signed products, final HTTP envelope binding in #2242, and the owner
real-money ACK remain independent launch gates.
