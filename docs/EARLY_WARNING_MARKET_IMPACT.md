# Early Warning structural market impact v0.1

Geomacro Early Warning can attach a deterministic cross-asset transmission map to a verified geopolitical or macro risk alert.

This layer is **decision-support context**, not a market-price prediction and not a trading instruction.

## Why this exists

A country-risk alert is more useful to traders, treasury teams and financial agents when the same verified event also explains how the pressure may transmit into markets.

The v0.1 flow is:

```text
verified event / structural driver
  -> deterministic transmission channels
  -> equities relevance + pressure direction
  -> crypto relevance + pressure direction
  -> FX relevance + pressure direction
  -> rates relevance + pressure direction
  -> commodities relevance + pressure direction
```

The methodology version is:

`early-warning-market-impact-v0.1-provisional`

It is explicitly uncalibrated.

## Asset direction semantics

`POSITIVE` and `NEGATIVE` always follow the declared asset-specific meaning:

- **equities:** broad equity price pressure
- **crypto:** broad crypto risk-asset price pressure
- **FX:** domestic-currency pressure versus major reserve currencies
- **rates:** sovereign yield pressure
- **commodities:** broad relevant-commodity price pressure

For example, `rates = POSITIVE` means upward sovereign-yield pressure. It does not mean that bonds are expected to rise in price.

`MIXED` is used when competing channels can plausibly push the asset class in opposite directions. `UNCERTAIN` is used when direct structural transmission is weak or insufficient to assign a directional pressure.

Crypto is deliberately allowed to remain `MIXED` or `UNCERTAIN`. Banking stress, capital controls or geopolitical escalation can create simultaneous risk-off pressure and alternative-rail / alternative-asset demand. The model must not force those cases into a BUY/SELL-style direction.

## Drivers in v0.1

The registered structural drivers are:

- monetary tightening / easing
- inflation upside
- growth downside
- liquidity tightening / easing
- energy supply disruption / relief
- conflict escalation / de-escalation
- sanctions escalation / relief
- banking stress / stabilization
- capital-controls tightening
- trade disruption / normalization
- sovereign stress
- critical-mineral disruption
- natural-hazard disruption

Each driver maps to a fixed, version-controlled set of transmission channels and per-asset categorical assessments.

## Persistence and auditability

Migration `939_early_warning_market_impact.sql` adds the following fields to the timestamped Early Warning ledger:

- `market_impact`
- `market_impact_methodology_version`
- `market_impact_calibrated`
- `market_impact_hash`

The market-impact object is SHA-256 bound. Once an Early Warning alert is published, these fields become part of the immutable alert core.

The existing CEWS `calculation_hash` remains the CEWS calculation hash. Market impact receives its own hash so that changing a market-transmission assessment cannot silently masquerade as the same alert.

## Legacy compatibility

Existing callers may continue to provide the older `transmission_channels` and `market_relevance` fields without a structural driver.

New callers should provide `market_impact_driver`. When that driver is present, Geomacro derives both the transmission channels and the legacy relevance map from the deterministic market-impact methodology.

A request is rejected if it supplies both `market_impact_driver` and caller-written `transmission_channels` or `market_relevance`. This prevents two conflicting market interpretations from being persisted under one alert.

## Current boundaries

v0.1 hard-codes:

- `calibrated=false`
- `structural_pressure_only=true`
- `market_price_prediction=false`
- `trading_instruction=false`
- `public_performance_claims_allowed=false`

There is no numeric Market Relevance Score in v0.1. A numeric score should only be introduced after historical outcome data is sufficient to calibrate and test it without look-ahead bias.

There are no BUY/SELL fields, target prices or automatic execution paths in this layer.
