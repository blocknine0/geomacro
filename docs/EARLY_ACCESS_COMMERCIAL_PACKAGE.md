# Geomacro Early Access Commercial Package

This is the canonical founder-use source of truth for the first paid Geomacro Early Access engagements. It is not public pricing, a general-availability announcement, or an enterprise SLA.

## 1. Commercial position

Geomacro sells geopolitical and macro risk intelligence for operational decisions.

The primary commercial value is not prediction-market participation or onchain activity. The buyer receives explainable current risk context, evidence, confidence, freshness, machine-readable Risk Objects, and a Risk Gate recommendation before a customer-controlled action.

Current product order:

1. Risk Intelligence
2. Global Risk Index (GRI)
3. Risk Gate
4. Ask Geomacro
5. Data / API
6. Research and methodology
7. Arc, Circle/x402 and prediction markets as supporting technical proof

The current Risk Gate boundary remains `execution_authorized=false`.

## 2. Who to sell first

Prioritize buyers with a narrow operational decision and a short path to technical evaluation.

### Priority A: fintech, payments, treasury and agent infrastructure

Best first workflow:

> Before a cross-border payment or automated financial action, check the relevant country or directional-corridor risk and return evidence-backed policy context.

Good buyer roles:

- Head of Risk
- Treasury lead
- Payments product lead
- Compliance engineering / risk engineering lead
- AI-agent or automation platform founder
- Infrastructure / API product lead

Why first: the Risk Gate and machine-readable delivery path are easiest to demonstrate against a concrete action, and these teams can often run a technical pilot faster than a large bank procurement cycle.

### Priority B: professional risk, strategy and supply-chain teams

Best first workflow:

> Track one country, corridor or strategic-resource exposure and explain what changed, why it changed, how confident the system is, and what evidence supports the move.

Good buyer roles:

- geopolitical risk lead
- strategy lead
- supply-chain risk lead
- commodities / critical-minerals analyst
- corporate treasury risk lead

### Priority C: financial-data, enterprise-risk and intelligence platforms

Best first workflow:

> Add signed, machine-readable geopolitical risk context to an existing data, workflow or agent product.

These prospects may become customers, distributors, strategic partners, licensing partners or acquisition candidates. Treat them as both commercial and strategic accounts.

## 3. Founding Pilot offer

The first offer should be one paid, narrow workflow for 30 days.

### Included

- one agreed operational decision or monitoring workflow;
- up to two countries or one directional corridor as the default scope;
- public Geomacro intelligence and current verified GRI where relevant;
- evidence, confidence, freshness and reason-code review;
- signed Risk Objects where the machine path is relevant;
- controlled Risk Gate / Risk API access when technically appropriate;
- founder-led onboarding and one weekly review;
- final evidence-based go / no-go review.

### Not included by default

- autonomous execution by Geomacro;
- wallet custody or transaction signing;
- sanctions-screening replacement;
- full route, port, vessel, counterparty or intermediary-jurisdiction modelling under the current endpoint-composed corridor pilot;
- custom enterprise SLA;
- unlimited API volume;
- custom data licensing that has not been cleared for commercial use;
- production mainnet execution;
- unsupported security or methodology certification claims.

## 4. Pilot deliverable

At the end of the pilot, the buyer should have a reproducible evidence package showing:

- the agreed workflow and decision;
- each risk output delivered during the pilot;
- the underlying evidence and confidence state;
- methodology / integrity information where relevant;
- Risk Gate recommendations where used;
- any unavailable or unverifiable inputs that failed closed;
- buyer feedback on usefulness and workflow fit;
- measured integration effort where an API path was used;
- a documented continue / expand / stop decision.

## 5. Buyer-facing demo sequence

Use a 12 to 15 minute sequence. Do not give a general product tour first.

### Minute 0 to 2: buyer problem

Ask:

1. What decision are you making today without enough geopolitical or macro context?
2. Is the decision human-reviewed, automated, or both?
3. Which country, corridor or exposure matters most?
4. What would make an external risk signal useful enough to change the workflow?

Then state:

> Geomacro turns geopolitical and macro developments into explainable risk intelligence that people and software can inspect before making an operational decision.

### Minute 2 to 5: current intelligence

Open `/intelligence` and `/global-risk`.

Show:

- current scored events;
- evidence and source context;
- confidence and freshness;
- GRI and change attribution;
- methodology / proof details.

Do not describe GRI as a probability or forecasting guarantee.

### Minute 5 to 9: decision layer

Open `/risk-gate`.

Map the buyer's real workflow to:

`proposed action -> signed risk context -> integrity/freshness checks -> buyer policy -> recommendation -> buyer-controlled execution`

State `execution_authorized=false` explicitly.

### Minute 9 to 12: machine path, only if relevant

Use the direct `/demo` link for a technical buyer.

Show the browser pre-flight first. Then explain that Circle x402 and USDC on Arc Testnet demonstrate agent-native pay-per-call delivery. The `0.001 USDC` technical-demo price is not institutional pricing.

### Minute 12 to 15: close

Ask for one real founding-pilot workflow, not a broad partnership commitment.

Suggested close:

> If this is relevant, I would rather test one real workflow with you than sell a broad platform promise. We can define one decision, one country or corridor, the output you need, and measurable success criteria for a 30-day founding pilot.

## 6. Pilot qualification gate

Do not start a custom pilot unless all six are known:

1. named buyer or internal champion;
2. real operational decision;
3. country / corridor / exposure scope;
4. desired human or machine-readable output;
5. measurable success criteria;
6. a commercial owner who can discuss continuation if the pilot works.

If the prospect only wants an interesting demo, keep the interaction as a demo rather than committing custom engineering.

## 7. Success criteria

Use `docs/PILOT_SUCCESS_CRITERIA.md` as the base and convert it into buyer-specific measures before starting.

A strong first pilot should answer:

- Did the risk context materially improve the agreed decision?
- Could the buyer trace the output to useful evidence?
- Were confidence, freshness and limitations understandable?
- Could the output fit the buyer's actual workflow?
- If machine-delivered, was integration practical?
- Did the system fail closed instead of fabricating unavailable values?
- Does the buyer want a paid continuation or wider scope?

## 8. Security and trust evidence

Use `docs/SECURITY_RESILIENCE_LAUNCH_EVIDENCE.md` when a buyer asks what has been tested.

Only claim the measured scope actually completed. Do not call the current evidence a third-party audit, certification, SLA benchmark or proof that the system is unhackable.

## 9. Technical proof boundary

Arc Testnet, USDC, Circle x402 and prediction markets are valuable when they prove machine delivery or programmable integration.

They must not displace the main commercial story. A non-crypto buyer should be able to understand and evaluate Geomacro without knowing anything about Arc or x402.

## 10. Commercial close and expansion

The pilot ends with one of three outcomes:

- `STOP`: insufficient value or workflow fit;
- `CONTINUE`: same workflow moves to a paid recurring arrangement;
- `EXPAND`: additional countries, corridors, users, API volume or workflows are justified by pilot evidence.

Do not promise a wide enterprise deployment before the pilot demonstrates value, source eligibility, operational reliability and a support model Geomacro can actually sustain.
