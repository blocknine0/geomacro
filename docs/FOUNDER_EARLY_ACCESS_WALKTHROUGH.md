# Founder Early Access Walkthrough

This is the recommended founder-led order for a first external Geomacro Early Access conversation. It is a commercial walkthrough, not a claim of general production availability.

## 1. Start with the problem

Open `/institutional`.

Explain Geomacro in one sentence:

> Geomacro turns geopolitical and macro developments into explainable risk intelligence that people and software can inspect before making an operational decision.

Use one real buyer workflow rather than a broad platform tour, for example a treasury team reviewing a cross-border payment or a risk team reviewing country exposure.

## 2. Show current intelligence

Open `/intelligence`, then `/global-risk`.

Demonstrate:

- current scored events;
- source and evidence context;
- confidence and freshness;
- the current Global Risk Index;
- methodology/proof details and change attribution where available.

Do not present GRI as a market probability or a prediction guarantee.

## 3. Move from intelligence to a decision

Open `/risk-gate`.

Explain the sequence:

1. A customer or agent has a proposed action.
2. Geomacro supplies signed country or directional-corridor risk context.
3. Integrity, freshness, confidence and policy conditions are evaluated.
4. Risk Gate returns a recommendation such as `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL`, `PAUSE` or `REROUTE`.
5. The customer controls any execution after the recommendation.

State the current boundary explicitly: `execution_authorized=false`.

## 4. Show the machine path only when useful

Use the direct `/demo` link for technical buyers or partners. It remains outside the public sitemap.

Show the free browser pre-flight first. Explain that the separate x402 endpoint proves agent-native pay-per-call access with USDC on Arc Testnet.

The `0.001 USDC` x402 price is technical proof only. It is not institutional pricing.

## 5. Show integration surfaces

Open `/data-api`.

Position machine-readable Risk Objects and Private Pilot API delivery as the integration path. Do not imply a general institutional SLA or automated enterprise onboarding that does not yet exist.

## 6. Close with methodology and trust

Open `/research` and, when needed, the technical docs.

Emphasize:

- versioned methodology;
- evidence/provenance;
- confidence and missing-coverage disclosure;
- signed Risk Objects;
- fail-closed behavior;
- explicit separation between intelligence, customer policy and execution.

Arc, Circle/x402 and prediction markets are supporting technical proof, not the primary product identity.

## Founding-pilot ask

Use a narrow close:

> Bring one real country, corridor or treasury workflow. We will test whether Geomacro's evidence, risk context and Risk Gate recommendation are useful enough to support that workflow before expanding scope.

A first pilot should define the buyer, decision, geography/corridor, expected inputs, output format, review cadence, success criteria and limitations before discussing broader deployment.
