# 3. Product Surfaces

Every public Geomacro capability carries a stage label so technical proof is not confused with commercial availability.

## 3.1 Risk Intelligence

**Status: LIVE**

Structured geopolitical and macro event intelligence with severity, confidence, evidence and timestamps.

## 3.2 Global Risk Index

**Status: LIVE — gri-v1.2.0**

The current production GRI is a deterministic, versioned 0–100 index over three active product domains:

- geopolitics
- macro
- rare earth / critical minerals

GRI v1.2 uses confidence and recency weighting, source concentration caps, independent-story concentration controls, published proof artifacts and exact change attribution. Missing domains are disclosed as reduced coverage rather than treated as zero risk.

GRI is **not** a market probability.

## 3.3 Ask Geomacro

**Status: LIVE**

Ask Geomacro is a grounded query interface over stored Geomacro intelligence. The current answer engine does not use external web search or a general-purpose LLM to invent missing evidence. Weak matches cause interpretation to be withheld.

## 3.4 Risk Objects

**Status: PRIVATE PILOT**

Machine-readable risk objects package subject-specific risk context, evidence, confidence, freshness and verification metadata for downstream systems.

Current Private Pilot work includes signed Geomacro Risk Objects and verification infrastructure. Availability and schema guarantees remain subject to pilot-stage change.

## 3.5 Risk Gate

**Status: PRIVATE PILOT**

Risk Gate evaluates country or directional corridor context against a customer's policy before a financial workflow proceeds.

Current recommendation states include:

- `CONTINUE`
- `REDUCE_LIMIT`
- `REQUIRE_APPROVAL`
- `PAUSE`

Geomacro does not autonomously execute or authorize the customer's transaction. The external boundary remains `execution_authorized = false`.

## 3.6 Data & API

**Status: PUBLIC DATA SURFACES + PRIVATE PILOT MACHINE ACCESS**

Public intelligence and proof surfaces are available today. Authenticated machine delivery, signed Risk Objects and Risk Gate are Private Pilot rather than generally available production APIs.

## 3.7 Institutional Intelligence

**Status: EARLY ACCESS / PRIVATE PILOT CONVERSATIONS**

Geomacro is preparing institution-oriented workflows for treasury, payments, risk, strategy, supply chain, research and automated financial systems. Geomacro does not claim institutional deployment where none exists.

## 3.8 Technical Proof

**Status: TECHNICAL PROOF**

Arc Testnet contracts, prediction markets, USDC, CCTP and Bridge & Swap remain accessible as evidence of programmable-finance implementation. They are secondary to the intelligence product.
