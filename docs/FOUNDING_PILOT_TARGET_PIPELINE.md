# Geomacro Founding Pilot Target Pipeline

This is the first evidence-backed outbound pipeline for Geomacro's founding-pilot program. It is intentionally narrow. The goal is to convert product readiness into qualified conversations with companies whose existing products already need policy, wallet, payment or agent controls.

Pipeline status definitions are in `docs/BUYER_QUALIFICATION_AND_OUTREACH.md`.

## Priority 1: Crossmint

**Status:** `IDENTIFIED`

**Why now**

Crossmint publicly positions an agentic payments platform with agent wallets, stablecoin infrastructure, x402 support, auditable logs and programmable guardrails such as spending limits, whitelists and human-approval thresholds.

Evidence:

- https://www.crossmint.com/solutions/agentic-payments
- https://www.crossmint.com/contact

**Geomacro fit**

Crossmint already governs what an agent is allowed to spend. Geomacro can complement that permission layer with external geopolitical and macro risk context before a payment or purchase is allowed to continue.

Potential flow:

`agent intent -> Crossmint wallet / spending policy -> Geomacro country or corridor risk pre-flight -> approval / limit / escalation decision -> Crossmint execution`

Geomacro should not pitch itself as a competing wallet, compliance or payment product.

**Best buyer roles**

- Agentic Payments product lead
- Risk / compliance product lead
- Partnerships / ecosystem lead
- Solutions engineering lead

**First message**

> I am building Geomacro, an explainable geopolitical and macro risk layer for operational and agent-initiated financial decisions. Crossmint already gives agents programmable wallet and spending guardrails. Geomacro could add external country or corridor risk context before those policies allow an action to continue. We now have signed Risk Objects, a fail-closed Risk Gate and an x402 testnet proof. I would like to test whether one real agent-payment workflow is worth a narrow design-partner pilot.

**Ask**

20-minute technical/product discovery around one real agent payment or purchase workflow.

**Channel**

Crossmint Contact Sales / Reach Out form.

**Next action**

Submit a short product/partnership inquiry using the message above. If a named product or partnerships contact is identified later, personalize to that person rather than sending the same generic copy twice.

---

## Priority 2: Turnkey

**Status:** `IDENTIFIED`

**Why now**

Turnkey publicly markets agentic payments, delegated wallet access and policy enforcement. It describes policies as a way to determine what agents may execute and emphasizes security controls around autonomous money movement.

Evidence:

- https://www.turnkey.com/solutions/ai-agents
- https://www.turnkey.com/blog/agentic-payments-secure-onchain-money-movement
- https://www.turnkey.com/blog/100m-policies--turnkey-protecting-transactions

**Geomacro fit**

Turnkey's policies govern authorization and signing. Geomacro can provide an upstream risk signal that informs whether a transaction should continue, reduce limits, require human review or pause before the Turnkey signing policy is exercised.

Potential flow:

`agent transaction request -> Geomacro signed risk context -> Risk Gate recommendation -> customer policy -> Turnkey policy/signing -> execution`

The division of responsibility must remain explicit: Geomacro supplies risk context and recommendation; Turnkey or the customer retains wallet authority and signing.

**Best buyer roles**

- AI Agents / Agentic Payments product lead
- Partnerships lead
- Wallet policy / security product lead
- Solutions engineering

**First message**

> Turnkey's agentic payments stack already solves wallet authority, policy and signing. Geomacro is building the external geopolitical-risk layer immediately before that decision. We produce signed country and directional-corridor Risk Objects and a fail-closed Risk Gate recommendation while execution remains customer-controlled. I would like to test one Turnkey-style agent payment flow where geopolitical context changes approval, limits or escalation.

**Ask**

20-minute technical fit discussion, with the option of a 30-day design-partner pilot if one real workflow is identified.

**Channel**

Turnkey Contact Sales from the AI Agents / Agentic Payments product pages.

**Next action**

Send the product-fit note through Contact Sales. Avoid opening with Arc or x402; mention those only as implementation proof after the risk-layer value is understood.

---

## Priority 3: Fireblocks

**Status:** `IDENTIFIED`

**Why now**

Fireblocks publicly offers an Agentic Payments Suite for PSPs and fintechs, including x402, delegated agent wallets, policy enforcement, pre-transfer controls, compliance checks and audit trails. Fireblocks also actively seeks technology partners whose services complement its transaction lifecycle.

Evidence:

- https://www.fireblocks.com/products/agentic-payments
- https://www.fireblocks.com/products/payments
- https://www.fireblocks.com/solutions/partners

**Geomacro fit**

Fireblocks has strong execution, wallet, policy and compliance infrastructure. Geomacro's strongest partnership angle is complementary external geopolitical and macro risk intelligence before a transaction enters the final policy/compliance/execution path.

Potential flow:

`payment intent -> Geomacro geopolitical/corridor risk -> Risk Gate -> Fireblocks policy/compliance controls -> customer authorization -> settlement`

Do not claim Geomacro replaces KYT, Travel Rule, sanctions screening or Fireblocks policy controls.

**Best buyer roles**

- Agentic Payments product team
- Payments partnerships
- Technology partnerships
- Product strategy / innovation

**First message**

> Fireblocks already provides the wallet, policy, compliance and settlement layers for agentic payments. Geomacro is building a complementary external geopolitical and macro risk layer before those controls execute. We now have signed machine-readable Risk Objects, a fail-closed Risk Gate, current evidence/provenance and a paid x402 testnet proof. I would like to explore whether country or corridor risk could become an additional pre-transaction signal for one PSP or fintech workflow.

**Ask**

Start as a technology-partnership / product-fit discussion rather than a broad customer sales pitch.

**Channel**

Fireblocks Partner application or Agentic Payments request-access / payments expert channel.

**Next action**

Use the partner route first because the value proposition is complementary infrastructure. If routed to sales, preserve the same narrow technical-pilot framing.

---

## Account order

1. Crossmint
2. Turnkey
3. Fireblocks

Reason: Crossmint and Turnkey appear more likely to support a fast product/technical design conversation around a narrow agent workflow. Fireblocks is strategically strong but likely to involve a larger enterprise partnership motion.

## Do not send generic deck first

For all three accounts:

1. establish the concrete workflow;
2. confirm the buyer or internal champion;
3. show the relevant intelligence and Risk Gate flow;
4. show x402 / Arc only when the buyer is technical;
5. propose the 30-day founding pilot only after the workflow is real.

Use:

- `docs/EARLY_ACCESS_COMMERCIAL_PACKAGE.md`
- `docs/FOUNDING_PILOT_PRICING_GUARDRAILS.md`
- `docs/SECURITY_RESILIENCE_LAUNCH_EVIDENCE.md`

## Initial commercial objective

The first outbound milestone is not three demos. It is one qualified account that reaches `PILOT_PROPOSED` with:

- a named champion;
- one operational decision;
- one country/corridor/exposure;
- measurable success criteria;
- a paid continuation owner.
