# Geomacro x Chainlink CRE data-provider PoC

Status: isolated proof of concept. It does not change Geomacro production billing, x402 settlement, database state, or execution policy.

## Goal

Demonstrate that Chainlink CRE can independently fetch and reach identical consensus on Geomacro's public machine-readable capability contract while preserving Geomacro's commercial boundary.

This first PoC deliberately uses only:

- `GET https://geomacro.live/api/intelligence/capabilities`
- Chainlink CRE `HTTPClient`
- CRE identical-consensus aggregation
- an HTTP trigger for simulation

It does **not** call the paid intelligence endpoint, settle USDC, expose raw source material, or authorize execution.

## Why this shape

Geomacro's commercial intelligence remains behind the existing x402 resource. The free discovery contract proves the provider identity, product contract, signed-risk-object capability and read-only boundary without turning the paid product into a free API.

A later partnership phase can allow a Chainlink-managed workflow to consume a dedicated partner/data-provider contract or the paid x402 resource under agreed commercial terms.

## Local simulation

Prerequisites:

1. Bun >= 1.2.21
2. Chainlink CRE CLI
3. A Chainlink CRE account/login

Then:

```bash
cd integrations/chainlink-cre
bun install
cre workflow simulate --target staging-settings --config config.staging.json main.ts
```

Trigger the HTTP workflow when prompted. No payment credential or Geomacro secret is required for this discovery-only PoC.

## Expected result

The workflow should return a consensus-verified Geomacro capability document with:

- provider id `geomacro`
- product delivery `x402`
- asset `USDC`
- signed Risk Object attestation capability
- `execution_authorized: false`

The workflow fails closed if the HTTP request fails, the response schema changes unexpectedly, nodes do not reach identical consensus, or the discovery document ever claims execution authorization.

## Commercial safety boundary

This integration must not:

- create a second free structured intelligence product
- bypass x402 payment for commercial intelligence
- expose raw source identity/article material
- execute financial actions from Geomacro output
- write to production state as part of this PoC

## Partnership progression

1. Simulate this discovery workflow locally.
2. Share the working PoC with Chainlink Data Provider / CRE teams.
3. Ask for a data-provider integration discussion and CRE deploy access if useful.
4. Define a dedicated Chainlink-facing intelligence contract only after commercial/security terms are agreed.
5. Add testnet onchain delivery or a custom data feed as a separate reviewed phase.

The initial collaboration target is Chainlink's data-provider route, not Chainlink Build. Build can be reconsidered later if Geomacro intentionally adopts a token model and the program terms make sense.
