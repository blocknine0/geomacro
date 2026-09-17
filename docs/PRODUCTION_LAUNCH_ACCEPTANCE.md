# Production Launch Acceptance

Status: **PRELAUNCH · REAL FUNDS DISABLED · MARKETPLACE PROMOTION ON HOLD**

This is the release policy for avoiding a technically successful but operationally embarrassing commercial launch.

A provider integration is not launch-ready merely because one payment succeeds. Geomacro does not publicly promote, submit or announce a paid production service until payment, delivery, reconciliation, failure handling and incident controls are all proven for the exact release candidate.

## Required sequence

1. **P0 strict closure**
   - exact release candidate frozen;
   - isolated non-production staging;
   - real distributed 40k burst and five-minute soak evidence;
   - authenticated full-window telemetry closure;
   - same-SHA published-surface verification;
   - Strict Commercial Launch Closure PASS.

2. **Production credentials loaded with launch gates still closed**
   - dedicated production receiving wallets;
   - production provider credentials;
   - exact prices/plans;
   - no public production resource advertised yet;
   - no marketplace submission yet.

3. **Isolated real-money canary**
   - same exact release candidate deployed to a non-public canary/staging host;
   - owner explicitly authorizes only the controlled canary window;
   - one bounded real-money purchase per initial-cohort provider;
   - internal buyer identity/wallet only;
   - no public marketplace promotion during the canary.

4. **Every canary must reconcile end to end**
   - unpaid request returns correct 402/payment requirement;
   - exact runtime price, network, asset and payTo/merchant recipient match policy;
   - payment verification succeeds;
   - settlement succeeds exactly once;
   - the paid resource is delivered for the same request/order identity;
   - delivery ledger records the provider settlement reference;
   - replay/idempotent retry does not charge twice;
   - conflicting proof, wrong amount, wrong asset/network and expired proof fail closed;
   - ambiguous settlement enters manual review and is not counted as revenue;
   - accounting reconciliation matches payment amount, recipient, provider receipt/transaction and delivered product.

5. **Incident controls are exercised before public launch**
   - `GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true` blocks every real-funds provider immediately;
   - `GEOMACRO_COMMERCE_DISABLED_PROVIDERS` can quarantine one unhealthy provider without waiting for a deploy;
   - provider quarantine pauses promotion/listing verification for that provider;
   - disabling/quarantining a provider after launch is incident containment, not an approved partial launch strategy.

6. **Public production deployment**
   - exact canary-tested release candidate only;
   - production build marker verified;
   - public discovery is checked before marketplace submission;
   - runtime payment metadata must match provider/network/price/recipient policy.

7. **Marketplace promotion only after production smoke is clean**
   - Coinbase: verify live x402 challenge/settlement and then verify Bazaar discovery/indexing separately; payment success is not treated as proof of Bazaar visibility.
   - Circle: submit only after the live service is production-ready, then independently verify the resource through Circle's discovery surface.
   - Nevermined: publish only after the live plan and production settlement path are verified and the first real purchase is reconciled.
   - GOAT: remains outside the initial cohort until merchant approval and its own mainnet acceptance are complete.

8. **Post-listing verification**
   - confirm the marketplace entry points to the exact canonical endpoint;
   - compare listed price/network/asset/capability metadata to runtime-authoritative values;
   - run an unpaid 402 challenge probe;
   - run a bounded paid smoke when required by the provider/listing flow;
   - confirm the resulting delivery and settlement reconcile;
   - do not announce revenue until reconciliation is matched.

## Hard launch blockers

Any one of these blocks or freezes public paid operation:

- P0 strict closure absent or stale;
- exact release SHA mismatch;
- provider production credentials missing or invalid;
- stale or commercially ineligible intelligence dependency;
- wrong price/network/asset/recipient;
- 5xx, timeouts or transport instability in paid path;
- replay/double-charge risk;
- payment settled but delivery missing;
- delivery returned without verified payment;
- ambiguous or unreconciled settlement;
- discovery/listing metadata mismatch;
- marketplace listing points at an old/testnet/sandbox endpoint;
- emergency freeze active;
- provider explicitly quarantined;
- no clear support/incident owner.

## Provider-specific external realities

Marketplace visibility is an external provider decision and cannot be guaranteed by Geomacro code.

The safe operating rule is therefore:

**healthy payable service first → reconciled canary → public production smoke → marketplace submission/indexing → independent listing verification → public promotion.**

Never reverse that sequence.

## Revenue semantics

A payment is not commercial revenue merely because the provider says "settled".

Geomacro may classify a transaction as reconciled commercial revenue only when:

- environment is an approved production/mainnet/fiat environment;
- payment status is settled;
- reconciliation status is matched;
- delivery completed for the same request/order identity;
- source-rights and freshness gates passed;
- amount, asset, network, recipient and provider settlement proof match the ledger.

## Emergency response

For a global commerce incident:

```text
GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true
```

For a single provider incident:

```text
GEOMACRO_COMMERCE_DISABLED_PROVIDERS=provider_id
```

Examples of provider ids:

```text
coinbase_x402
circle_gateway_x402
nevermined
goat_x402
```

After an incident, do not re-enable the provider until a bounded canary plus reconciliation passes again.

## Public communication

Do not announce "live", "production", "available in marketplace", "revenue", or a provider relationship beyond its documented scope until the corresponding evidence exists.

Automatic social publication remains disabled.
