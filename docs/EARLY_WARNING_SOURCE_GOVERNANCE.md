# Early Warning Source Governance

Status: PRELAUNCH FOUNDATION

Geomacro Early Warning must not treat a free/public feed as commercially usable merely because it can be fetched. Source rights, observation quality, operational readiness and customer-delivery boundaries are separate gates.

## Derived-intelligence rule

Early Warning is designed to publish Geomacro-derived structural intelligence, not third-party raw payloads.

A source/observation may enter the governed Early Warning persistence path only when:

1. the source exists in `live_external_sources`;
2. its `commercial_usage_status` is `COMMERCIAL_OK` or `DERIVED_ONLY`;
3. `enabled_for_ingestion = true`;
4. `enabled_for_commercial_signals = true`;
5. the contributing observation is `quality_status = VERIFIED`;
6. observation commercial eligibility is `VERIFIED` or `DERIVED_ONLY`;
7. customer/public serialization remains derived-only and never exposes `raw_payload`.

Raw redistribution permission is therefore not a prerequisite for a derived signal, but raw payload publication remains forbidden even when a source separately permits raw redistribution.

The runtime implementation is `src/lib/early-warning-source-eligibility.server.ts`.

## Governed persistence path

Source-connected watchers should use:

`persistGovernedEarlyWarningAlert(...)`

This entrypoint:

- requires at least one source reference;
- runs the Early Warning source/observation commercial gate;
- rejects any ineligible source;
- normalizes the event into the canonical event-family vocabulary;
- rejects an unclassified (`other`) family for a public alert;
- then calls the canonical Early Warning ledger persistence function.

Direct database writes by watcher adapters are not the intended production path.

## Existing governed data sources

### GDELT 2.0 Event Database

Geomacro already has a rights-reviewed and operational GDELT v2 ingestion path. The current workflow polls the official 15-minute release family four times per hour.

Important: current runtime policy deliberately keeps `enabled_for_commercial_signals = false`. GDELT therefore remains governed ingestion/research context for Early Warning until a separate, evidence-backed promotion is approved.

### USGS Earthquake Hazards

Geomacro already ingests the official USGS earthquake feed under the rights-reviewed USGS boundary. The upstream feed is updated frequently, while the current Geomacro workflow is hourly.

Important: current runtime policy also keeps `enabled_for_commercial_signals = false`. It must not become a public/commercial Early Warning source merely because the dataset rights are reviewed.

## Official source candidates

`config/early-warning-watchers.json` records candidate discovery surfaces for future zero-cost official-source adapters, including:

- European Central Bank RSS/MID;
- Bank of England RSS;
- Bank of Japan RSS;
- Federal Reserve official releases/data surfaces;
- U.S. Treasury / OFAC recent sanctions actions.

These candidates are `REVIEW_REQUIRED`, `NOT_IMPLEMENTED` and `enabled=false`. Their presence in the config is discovery metadata only. It is not commercial approval.

Before any candidate is activated, close all of the following:

- exact feed/API endpoint;
- exact licence/reuse terms;
- commercial derived-use conclusion;
- attribution requirements;
- raw-content restrictions;
- adapter implementation;
- country/location mapping;
- timestamp semantics;
- duplicate/idempotency handling;
- source freshness expectations;
- negative/failure tests;
- explicit database registry promotion.

## Canonical event families

The first stable Early Warning vocabulary includes:

- conflict
- sanctions
- political_instability
- trade_policy
- monetary_policy
- inflation
- labor_market
- currency_fx
- sovereign_fiscal
- banking_liquidity
- capital_controls
- shipping_logistics
- commodity_supply
- critical_minerals
- natural_disaster
- regulatory_policy
- cyber_infrastructure
- other

Common aliases are normalized exactly. Unknown labels become `other`; the normalizer does not fuzzy-guess a high-impact category.

Each family also has candidate transmission channels. These are hypotheses for downstream analysis, not asserted causal outcomes. Customer-facing transmission claims require evidence from the alert pipeline.

## Zero-cost watcher strategy

The initial operational order is:

1. reuse governed existing ingests;
2. keep commercial-signal promotion disabled until source-specific proof is complete;
3. implement official-source adapters one by one;
4. use free scheduled polling only where the upstream contract supports it;
5. later move genuinely time-critical sources to a more reliable near-live scheduler without changing the source-rights gate;
6. never use scraping or unofficial mirrors to manufacture a latency advantage.

The goal is not the highest possible alert volume. The goal is a small number of source-backed, auditable signals that can later prove lead time and usefulness.
