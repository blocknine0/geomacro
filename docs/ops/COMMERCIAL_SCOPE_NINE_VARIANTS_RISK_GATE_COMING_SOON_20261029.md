# GeoMacro launch scope: 9 sellable-intent variants, Risk Gate Coming Soon

Date: 2026-10-29. Applies ONLY to GeoMacro-owned public Store, paid agents, and x402 routes.

## Product discovery vs public sale

- Keep all **12** founder-approved, non-retired priced variants visible as an indicative catalog: 9 launch-scope variants and 3 Risk Gate **Coming Soon** variants. GRI Read stays retired from the public Store.
- **Launch-scope (conditional, not automatically payable):** four country/corridor structural products; three Intelligence query variants; two Signed Risk Object variants.
- **Coming Soon / NO NEW SALE:** all `risk_gate_bundle` variants (existing proof preflight 0.10 USDC, standard 0.15 USDC, complex multi-source 0.25 USDC). Their founder-approved prices and historical contracts remain immutable, but the public buyer must not receive a new quote/charge for them.
- A price listing does NOT prove source eligibility, signed output, processor configuration, production website publication, or commercial settlement authorization.

## Public ingress / no-funds behavior

- Website Store and pricing discovery identify Risk Gate as **Coming Soon**. No Risk Gate purchase or enquiry button is displayed; other products retain the existing enquiry-only flow.
- Data-only availability and structured-product setup reject new Risk Gate request proofs before source reads (HTTP 422, `RISK_GATE_COMING_SOON_NO_CHARGE`).
- Coinbase and Circle paid request handlers preserve existing authenticated already-settled replay, but block any new Risk Gate quote, verification or settlement before live availability reads.
- Common x402 offer issuance also refuses newly requested Risk Gate products. Missing data, stale evidence, unverifiable signed proofs, source rights, provider authorization, and merchant settlement gates remain fail-closed for the other nine variants.
- The existing 72-hour Website Intelligence → canonical Cloudflare D1 → PREDGE data-sharing and owner B2 archive ingestion are reused as *evidence inputs*. Shared unscored news or 72-hour static Finds alone do **not** qualify a paid signed Risk Object, transfer any private/raw upstream data to a customer, or grant rights to redistribute it.

## Explicitly untouched

No edits to PREDGE code, partner auth, partner quota, research-feed endpoints, PREDGE contracts, deployments, workflows or credentials. Do not change Risk Gate partner integration or remove historical Risk Gate pricing, signatures, settlement receipts or paid replay support.

## Live activation is separate

This GitHub change is a catalog/commerce-policy code change, **not** a production deployment or merchant enablement. Before real purchases: confirm live source and signed-proof eligibility, owner-approved payout wallet and payment rail, exact request/quote/settlement reconciliation, actual paid customer response and no-charge negative tests, plus website publication/worker SHA parity. Do not self-enable USDC merchant credentials or alter PREDGE.
