# Initial Commercial Pay-Per-Call Launch Acceptance

Status: **PRELAUNCH · REAL FUNDS DISABLED · INITIAL PAY-PER-CALL PATH**

This is the authoritative acceptance policy for Geomacro's initial commercial pay-per-call release.

The initial commercial product is the bounded machine-readable intelligence service at the canonical launch price of **0.05 USDC per successful paid intelligence delivery for the first 10,000 deliveries**.

The first 10,000 deliveries are an adoption and revenue milestone. They are **not** a requirement to pre-fund 500 USDC. At the launch price, 10,000 successful customer-paid deliveries would represent 500 USDC gross receipts before provider/network costs and any applicable commercial adjustments.

The separate 40,000 requests/second staging workflows remain useful as future scalability certification. They are not required to activate the initial commercial pay-per-call path.

## Initial launch sequence

1. **Freeze one exact release candidate**
   - current canonical `main` SHA is frozen;
   - product, security, database, source-rights and payment-contract checks pass on that SHA;
   - production acknowledgements remain disabled.

2. **Run Initial Commercial Pay-Per-Call Acceptance**
   - exact candidate SHA is verified against `main`;
   - production build succeeds;
   - canonical intelligence contract is `0.05 USDC`;
   - launch target is 10,000 successful paid deliveries;
   - production atomic amount for six-decimal USDC is 50,000;
   - payment delivery ledger, replay/idempotency and fail-closed tests pass;
   - no real-money payment is performed by this acceptance workflow.

3. **Prepare the production runtime without spending founder capital**
   - dedicated receiving address;
   - provider credentials;
   - exact price/network/asset configuration;
   - production source/freshness controls;
   - monitoring and reconciliation access;
   - all real-funds launch acknowledgements remain off until final owner authorization.

4. **Owner-authorized production activation**
   - activate only the provider rails that are actually configured and approved for launch;
   - preserve `execution_authorized=false`;
   - do not expose paid intelligence before payment verification;
   - do not treat testnet or sandbox payments as revenue.

5. **First production buyer**
   - an external buyer pays the configured price;
   - payment is verified and settled exactly once;
   - the corresponding intelligence is delivered for the same request/order identity;
   - the delivery ledger reconciles payment and delivery;
   - replay cannot create a second charge;
   - ambiguous settlement enters manual review;
   - this first independently originating production purchase becomes the first commercial revenue evidence.

6. **Marketplace promotion is a separate step**
   - only after production smoke and reconciliation are clean;
   - verify marketplace endpoint, price, network, asset and capability metadata;
   - marketplace visibility is external and is never inferred from payment success alone.

## No-funds rule

The founder does not need to purchase 10,000 calls in order to reach the 10,000-delivery milestone.

The acceptance work before launch is designed to be non-revenue and non-prefunded. Customer payments are the source of commercial receipts after the production route is genuinely enabled.

An internal real-money canary is therefore not a prerequisite for this initial no-funds acceptance path. When an internal canary cannot be funded, the first independent production purchase is the authoritative commercial purchase/reconciliation event.

## Hard blockers for initial paid operation

- exact release SHA mismatch;
- required product/security/source-rights/database checks failing;
- production payment credentials or receiving configuration missing;
- runtime price/network/asset/recipient mismatch;
- paid response available without verified payment;
- payment verification or settlement failure;
- payment settled but delivery missing;
- replay or double-charge protection failure;
- ambiguous settlement without manual-review handling;
- stale or commercially ineligible intelligence dependency;
- production emergency freeze active;
- provider explicitly quarantined;
- no clear incident/support owner.

The following are **not** initial launch blockers:

- the 40k distributed staging capacity certification;
- 12M-request five-minute stress evidence;
- marketplace listing approval;
- an internal founder-funded real-money canary.

They remain separate operational or post-launch evidence tracks.

## Optional scale certification

The existing:

- `Distributed 40k Staging Execution`;
- `Distributed 40k Evidence Closure`;
- `P0 Strict Prepublic Closure`

workflows are retained for future high-scale capacity certification.

Passing or failing those workflows does not change the canonical 0.05 USDC commercial price and does not create revenue evidence.

## Revenue semantics

A commercial revenue event requires:

- approved production/mainnet environment;
- successful payment settlement;
- matched reconciliation;
- completed delivery for the same request/order identity;
- source-rights and freshness eligibility;
- amount, asset, network and recipient matching the authoritative contract.

Testnet, sandbox and controlled internal evidence are never counted as commercial revenue.

## Emergency response

Global freeze:

`GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true`

Provider quarantine:

`GEOMACRO_COMMERCE_DISABLED_PROVIDERS=provider_id`

After an incident, do not re-enable the affected production rail until the bounded remediation and reconciliation checks pass.

## Public communication

Do not announce "live", "production", "revenue", or marketplace availability until the corresponding evidence exists.
