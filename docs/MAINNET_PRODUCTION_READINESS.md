# Geomacro production / mainnet readiness boundary

Status: **P0 release-control contract**

Geomacro does not treat "mainnet" as a synonym for production readiness. A capability may move toward production only after its own security, data-rights, resilience and operational gates are evidenced.

## Permanent product split

| Capability | Current status | Production/mainnet path |
| --- | --- | --- |
| Risk Intelligence | Live | Production hardening scope |
| Global Risk Index | Live | Production hardening scope |
| Ask Geomacro | Live | Production hardening scope |
| Country Risk Object | Private Pilot | Eligible only after P0 gates |
| Directional corridor Risk Object | Private Pilot | Eligible only after P0 gates |
| Risk Gate | Private Pilot | Eligible only after P0 gates |
| Governed commercial API | Private Pilot | Eligible only after P0 gates |
| Prediction markets / staking / claims / disputes | Arc Testnet technical proof | **Never mainnet; permanently Testnet-only** |

Arc/Circle/x402 or other transport/payment adapters do not create a second risk engine. They may evolve independently as delivery rails, but they cannot promote the prediction-market application to mainnet and they cannot bypass the production gates below.

## P0 gates before industry-ready production claims

The following are hard gates. Code existence is not evidence that a gate passed.

1. **Commercial source rights**
   - every source used in paid structured delivery has evidence-backed commercial eligibility;
   - unknown or review-required sources fail closed from paid delivery;
   - provenance remains attached to derived outputs.

2. **Credential and authorization lifecycle**
   - least-privilege scopes;
   - provisioning, rotation, disable/revoke and expiry;
   - last-used / audit observability;
   - incident-response path for compromised credentials;
   - secrets are never returned after issuance or written to logs/audit payloads.

3. **Signed Risk Object trust boundary**
   - active/retired/revoked issuer-key lifecycle;
   - validity windows and public verification material;
   - tamper, stale, expiry, unsupported-version and revoked-key cases fail closed;
   - rotation/compromise drill evidence is retained.

4. **Risk Gate non-authorizing boundary**
   - `execution_authorized=false` remains invariant;
   - Geomacro does not custody funds, sign the customer's transaction or own customer permissions/policy;
   - country and directional corridor remain the current Private Pilot scope until a separately verified contract expands it.

5. **Authenticated end-to-end capacity**
   - measure the real HTTP path across authentication, rate limiting, Risk Object loading/verification, idempotency and audit persistence;
   - retain request volume, concurrency, status distribution, latency percentiles, error classes and duplicate/audit outcomes;
   - deterministic core-engine throughput must not be presented as API capacity.

6. **Dependency outage and recovery**
   - exercise database/auth/rate-limit/audit/signing/read-path failures;
   - prove fail-closed or explicitly degraded behavior;
   - preserve last-known-good/freshness semantics where the implemented product contract allows them;
   - record recovery behavior rather than assuming restart success.

7. **Secret and privileged-boundary review**
   - service-role, signing, wallet and provider credentials remain server/CI only;
   - public bundles and client-visible responses contain no privileged secret material;
   - critical/high findings are remediated and re-tested.

8. **Independent security review**
   - an external review is still required before Geomacro describes the production system as externally audited/reviewed;
   - internal tests, CodeQL and repository review do not substitute for this claim.

9. **Operational launch controls**
   - readiness/health checks, alerting, incident ownership, rollback/revoke procedures and evidence retention are defined;
   - pricing/support/terms and customer responsibilities are explicit;
   - no SLA, certification, predictive-accuracy or institutional-grade claim is made without corresponding evidence.

## Existing P0 evidence and controls

The repository already contains controls that contribute to these gates, including:

- `/api/risk-gate-readiness` fail-closed readiness checks;
- authenticated Risk Gate idempotency/replay/conflict behavior;
- deterministic Risk Gate core resilience testing;
- a bounded staging HTTP load harness in `scripts/load-test-risk-gate-staging.ts` and `.github/workflows/risk-gate-staging-load.yml`;
- commercial source-rights policy and governed eligibility controls;
- signing-key lifecycle and public verification registry;
- Arc Testnet target verification before prediction-market automation exposes privileged transaction credentials.

These controls are necessary evidence inputs, not a declaration that every P0 gate is complete.

## Prediction-market safety invariant

The prediction-market application has one permitted execution network: **Arc Testnet, chain ID `5042002`**.

Official market automation must run `scripts/ops/verify-arc-testnet-target.mjs` before state-changing market jobs. The verifier checks every configured Arc RPC fallback and refuses execution if any configured target is not Arc Testnet or cannot see the configured market contract.

The `/arena` UI also refuses to mount the transaction surface when a wallet is on another known chain and explicitly switches only to Arc Testnet.

This invariant must remain true even if `ARC_MAINNET.live` becomes true for other Geomacro capabilities in the future.

## Release rule

A production/mainnet release decision for Risk Objects, Risk Gate or governed APIs must be based on retained evidence for the relevant gates above. Prediction markets are excluded from that release decision by design.
