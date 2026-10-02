# 3. Product Surfaces

Every public Geomacro capability carries an explicit availability label so technical proof is not confused with commercial delivery.

## 3.1 Risk Intelligence

**Status: LIVE**

Structured geopolitical, macroeconomic and critical-mineral event intelligence with severity, confidence, evidence and timestamps.

## 3.2 Risk Indices

**Status: LIVE**

The current public risk-index product presents three domains independently:

- **Geopolitical Risk Index**
- **Macroeconomic Risk Index**
- **Critical Minerals Risk Index**

Each index is a risk-intelligence signal with its own current reading, history and change context. Missing or unverifiable domain evidence is not converted into a synthetic zero-risk reading.

The three public indices preserve the audited `gri-v1.2.0` parent methodology and `gri-proof-v1.2.0` proof lineage. Historical combined-GRI snapshots remain versioned audit records and are not a second current headline product.

The Risk Indices are **not** prediction-market probabilities, investment recommendations or transaction authorization signals.

## 3.3 Ask Geomacro

**Status: LIVE**

Ask Geomacro is a grounded query interface over stored Geomacro intelligence. The current answer engine does not use external web search or a general-purpose LLM to invent missing evidence. Weak matches cause interpretation to be withheld.

## 3.4 Risk Objects

**Status: PRIVATE PILOT**

Machine-readable risk objects package subject-specific risk context, evidence, confidence, freshness and verification metadata for downstream systems.

Current Private Pilot work includes signed country and directional corridor Geomacro Risk Objects and verification infrastructure. Availability and schema guarantees remain subject to the agreed pilot scope. Event-specific Risk Objects are not part of the current Private Pilot contract.

## 3.5 Risk Gate

**Status: PRIVATE PILOT**

Risk Gate verifies country or directional corridor risk context and returns a bounded pre-flight recommendation. The customer's own identity, permissions and policy layer decides how that recommendation affects the financial workflow.

Current v1 recommendation states are:

- `CONTINUE`
- `REDUCE_LIMIT`
- `REQUIRE_APPROVAL`
- `PAUSE`

`REROUTE` is not a current v1 machine decision. It is reserved as a future/advisory alternative only when a lower-risk corridor or route is separately validated.

Geomacro does not autonomously execute or authorize the customer's transaction. The external boundary remains `execution_authorized = false`.

## 3.6 Data & API

**Status: PUBLIC DATA SURFACES + CONTROLLED MACHINE ACCESS**

Public intelligence, Risk Indices and proof surfaces are available today. Governed machine-readable delivery, signed Risk Objects and Risk Gate remain entitlement- or Private Pilot-scoped capabilities rather than anonymous public APIs.

Free Explorer is the public website/dashboard experience, not an anonymous free structured API.

## 3.7 Institutional Intelligence

**Status: CONTROLLED COMMERCIAL / PRIVATE PILOT**

Geomacro supports scoped institution-oriented conversations and workflows for treasury, payments, risk, strategy, supply chain, research and automated financial systems. Customer-specific delivery scope, quotas and service commitments are defined only where supported by the live operating evidence and agreement.

## 3.8 Technical Proof

**Status: TECHNICAL PROOF**

Programmable-finance, prediction-market, USDC, CCTP and Bridge & Swap implementations are secondary engineering proof. They do not imply that a payment, settlement or execution rail is active unless the corresponding live runtime contract explicitly advertises that state.
