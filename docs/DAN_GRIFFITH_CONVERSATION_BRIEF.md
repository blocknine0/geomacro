# Dan Griffith Conversation Brief

Internal founder-use only. This brief is for the next Geomacro conversation with Dan after the commercial-readiness acceptance run passes. Do not send this document as a customer-facing claims sheet.

## Why reopen the conversation now

Dan's earlier feedback was that Geomacro contains two different commercial stories: structured risk signals that professional risk or strategy teams may pay for, and an onchain/prediction-market layer aimed at a different buyer. The product has since been tightened around the first story.

The conversation should therefore start from a concrete B2B product and founding-pilot offer, not from a broad startup update.

## One-sentence product

Geomacro turns geopolitical and macro developments into explainable, machine-readable risk intelligence that people and software can inspect before making an operational or financial decision.

## Current commercial wedge

The recommended first wedge is a pre-flight risk decision for a narrow country or directional-corridor workflow:

`proposed action -> signed Risk Object -> integrity / freshness / confidence checks -> buyer policy -> Risk Gate recommendation -> buyer-controlled execution`

Geomacro does not authorize, sign or broadcast the customer's financial action. Current Risk Gate responses preserve `execution_authorized=false`.

## Best first ICP to validate with Dan

### Primary

Fintech, payments, treasury and agent-infrastructure teams that need geopolitical or macro context before a cross-border payment or automated financial action.

Likely buyer / champion roles:

- Head of Risk
- Treasury lead
- Payments product lead
- Risk or compliance engineering lead
- AI-agent / automation infrastructure founder
- API / infrastructure product lead

### Secondary

Professional geopolitical-risk, strategy, supply-chain, commodities and corporate-treasury teams that need explainable country or corridor monitoring with evidence, confidence, freshness and change attribution.

## Concrete demo to discuss

Use the USA -> CHN directional-corridor workflow as the technical commercial example.

Show the sequence rather than a general product tour:

1. Current country risk context is generated from qualifying evidence.
2. Each country Risk Object is versioned, integrity-hashed and Ed25519-signed.
3. A directional corridor Risk Object is composed from the endpoint risk context under the explicitly labelled corridor pilot methodology.
4. Risk Gate verifies integrity, freshness, confidence, commercial eligibility and buyer policy.
5. The system returns a recommendation such as `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL`, `PAUSE` or `REROUTE`.
6. The customer retains execution control. A non-`CONTINUE` decision leaves the executor unreachable in the pre-flight adapter.

Do not present corridor v0.1 as full route, port, vessel, counterparty or intermediary-jurisdiction modelling. It remains an endpoint-composed pilot methodology.

## Technical proof available before the call

The repository currently contains:

- deterministic Risk Gate evaluation with fail-closed handling;
- signed Risk Objects with Ed25519 verification and public verification keys;
- key lifecycle and revocation checks;
- country and directional-corridor Risk Object publication;
- customer-controlled execution pre-flight adapters;
- public Risk Gate readiness checks;
- Testnet developer/API access;
- scoped security and resilience evidence;
- Circle x402 / USDC on Arc Testnet as supporting machine-delivery proof, not the primary commercial product.

### Fresh acceptance evidence status

`PENDING FINAL PASS`

The Dan-readiness workflow must pass on the actual USA + CHN country pair and USA -> CHN corridor before this brief is treated as final. Do not replace an unavailable input with a synthetic score merely to make the demo pass.

## Founding Pilot offer

### Risk API / Risk Gate technical pilot

Default quote: **USD 2,500 for 30 days**.

Default scope:

- one agreed operational decision or integration workflow;
- up to two countries or one directional corridor;
- controlled Private Pilot API access;
- signed Risk Objects where applicable;
- Risk Gate integration support;
- agreed request volume;
- founder-led onboarding;
- one technical integration session;
- weekly review;
- final evidence-based continue / expand / stop review.

### Analyst / operational workflow pilot

Default quote: **USD 1,500 for 30 days**.

Use this when the workflow is primarily human-reviewed rather than API-integrated.

### Commercial boundary

Do not reduce a 30-day paid pilot below **USD 750** without a written strategic reason that buys something concrete, such as unusually valuable design feedback, reference potential, distribution, technical support, strategic introductions or investment / acquisition value.

## What the call with Dan needs to resolve

The goal is not generic feedback. Leave the call with sharper answers to these five questions:

1. **ICP:** If he had to choose one first buyer category now, would he lead with fintech / payments / treasury / agent infrastructure, or with professional risk / strategy teams? Why?
2. **Wedge:** Is the stronger initial offer a signed country Risk API, or a country/corridor Risk Gate pre-flight workflow tied to one concrete decision?
3. **Pricing:** Is USD 2,500 / 30 days the right founding technical-pilot anchor for the first credible B2B buyer, and what would justify moving it higher or lower?
4. **Proof threshold:** What proof is still missing before approaching the first 10 serious design partners or paid-pilot prospects?
5. **Sales motion:** How would he structure the first outreach, qualification call, pilot close and post-pilot continuation so this becomes a repeatable sales motion rather than founder-led custom consulting?

## Useful follow-up questions if time permits

- Which buyer title is most likely to feel the pain strongly enough to own budget?
- What objection will kill this sale first: trust in the methodology, integration effort, procurement, source rights, internal alternatives, or unclear ROI?
- What measurable pilot outcome would make a buyer comfortable continuing at USD 1,500-3,000 per month?
- At this stage, should the first 10 accounts be optimized for revenue, learning, logos, distribution or strategic acquisition value?
- What should Geomacro deliberately refuse to build for the first pilot?

## Call structure

### 0-3 minutes: show that the feedback changed the product

Explain that prediction markets and Arc/Circle technical work remain proof layers, while the commercial product is now Risk Intelligence + Risk Gate + machine-readable Risk Objects.

### 3-8 minutes: show one workflow

Use USA -> CHN and show evidence -> signed risk context -> Risk Gate -> buyer-controlled decision boundary.

Do not give a feature-by-feature tour.

### 8-12 minutes: show the offer

Explain the narrow 30-day paid founding pilot and the exact technical-pilot scope.

### 12-25 minutes: use Dan for GTM decisions

Work through the five primary questions above. Capture concrete choices, not only general advice.

## Claims to avoid

Do not claim:

- general enterprise production availability;
- an enterprise SLA;
- a third-party security certification or audit;
- autonomous transaction authorization or custody;
- complete sanctions screening;
- full route / vessel / counterparty corridor modelling;
- that the endpoint-composed corridor pilot is independently commercially verified;
- that Testnet x402 pricing represents institutional pricing;
- that a risk score is a guaranteed forecast or market probability.

## Desired result from Dan

A successful conversation produces:

- one primary ICP;
- one first commercial wedge;
- a validated or revised founding-pilot price anchor;
- the minimum proof package required for serious outreach;
- a first-10-account outreach and qualification pattern;
- a clear trigger for asking Dan for another review or a strategic introduction.
