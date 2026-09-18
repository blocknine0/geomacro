# Optional P0 Strict Capacity Certification

This document defines the separate first-party scalability certification track for Geomacro. It is **not required for the initial commercial pay-per-call launch**.

The initial commercial product is the canonical **0.05 USDC per successful paid intelligence delivery** contract, with the first **10,000 successful deliveries** treated as an adoption/revenue milestone. No founder pre-funding is required to reach that milestone.

The 40k capacity workflows remain available for a later scale-certification claim. They must stay isolated from production and real-funds activity.

## Evidence order

For the optional scale-certification track:

1. freeze one exact canonical `main` SHA;
2. deploy that exact SHA to isolated staging;
3. execute the real distributed 40k staging load workflow;
4. close the load run with full DB/edge/control-plane/provider-path evidence;
5. optionally publish the same exact SHA;
6. run the strict P0 closure workflow against the exact candidate and exact evidence.

No earlier run from a different SHA can be substituted.

## Required 40k profiles

The existing `Distributed 40k Staging Execution` workflow remains manual-only and requires its configured isolated staging environment and 40 concurrently available self-hosted load-generator runners.

The profiles are:

- burst: 1,000,000 requests at 40,000 requests/second aggregate for 25 seconds;
- soak: 12,000,000 requests at 40,000 requests/second aggregate for 300 seconds.

A pass is evidence for the recorded test conditions only. It is not a guarantee of unlimited production capacity and does not create commercial revenue evidence.

## Relationship to initial commercial launch

The optional P0 scale track is deliberately **not** included in `config/commercial-launch-manifest.json` as an initial required gate.

The initial commercial acceptance path is:

**exact release candidate → no-funds pay-per-call acceptance → production configuration/owner authorization → external production purchase/reconciliation → 10,000-delivery adoption tracking.**

The initial acceptance workflow never performs real-money settlement.

## No-funds boundary

Do not manufacture synthetic payments or self-buy 10,000 calls to satisfy the commercial milestone.

The 40k scale workflows and this document do not require, imply or authorize founder-funded production traffic.

Production revenue begins only from independently originating production purchases that complete payment verification, settlement, delivery and reconciliation.

## Current status rule

Until the optional scale evidence exists, Geomacro may still proceed through the initial commercial pay-per-call path when its required launch gates are satisfied.

A missing 40k proof should be reported as **scale certification not completed**, not as a blocker for the initial 0.05 USDC pay-per-call product.
