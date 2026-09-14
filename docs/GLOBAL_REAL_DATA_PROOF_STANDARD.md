# Global Real-Data and Real-Time Proof Standard

**Status:** hard production requirement  
**Effective:** 2026-09-14

Geomacro may call a country, module or workflow **supported** only when that claim is backed by current production evidence. The goal is broad sovereign-country coverage using real external data and real source freshness, without inventing values for countries or domains that are not actually covered.

## Core rule

`real source -> governed ingest -> deterministic normalization -> source freshness/release proof -> country mapping -> versioned methodology -> Risk Gate module state -> country/workflow census -> supported claim`

If any required link is missing, the result is `FAIL_CLOSED`.

No missing country/module is represented by a synthetic zero, average, stale placeholder or LLM-estimated number.

## What “real-time” means

Not every risk domain produces legitimate real-time data.

Geomacro therefore uses four explicit evidence clocks:

1. **REAL_TIME**: source is updated on a minute-scale or continuously, for example USGS earthquake feeds.
2. **NEAR_REAL_TIME**: source is updated on a 15-minute/hour-scale or shortly after observation, for example GDELT 2.0 releases or NASA FIRMS NRT detections.
3. **RELEASE_DRIVEN**: authoritative official statistics are updated on a daily/monthly/quarterly/annual release cycle, for example sovereign debt, GDP or governance statistics.
4. **STRUCTURAL**: slower-moving structural evidence whose methodology explicitly tolerates a longer horizon.

Geomacro must never relabel a quarterly debt statistic as “real-time.” For periodic official statistics, **latest official release + release timestamp + freshness policy** is the truthful equivalent.

## Three proofs required for every production source

### 1. Source-contract proof

Record:

- exact provider;
- exact dataset/API/dataflow/version;
- official source URL;
- licence/terms URL;
- commercial reuse conclusion;
- attribution requirement;
- raw redistribution boundary;
- third-party-content exceptions;
- access/authentication contract;
- expected release cadence;
- review date.

Public availability alone is insufficient.

### 2. Live-source proof

Every active source must have an automated proof showing that the live endpoint/release is actually reachable and current according to its source-specific clock.

Examples:

- GDELT 2.0 latest release timestamp is recent enough for its 15-minute release contract;
- USGS GeoJSON feed metadata was generated within the accepted minute-scale window;
- UCDP Candidate release manifest matches the active governed release;
- WGI release manifest proves the exact global release written to production;
- World Bank/OECD/Eurostat/ADB periodic sources record reference period and retrieval/release timestamps.

A successful HTTP response is not enough. The proof must validate the timestamp/version/release identity.

### 3. Country/workflow proof

Source freshness does **not** automatically prove country support.

For every country/workflow claim, the production census must show:

- country is inside the canonical sovereign registry;
- all required modules for that action profile exist;
- each module uses commercially eligible observations;
- observations meet source-specific freshness/release rules;
- methodology has sufficient peer/data coverage;
- confidence and coverage thresholds are met;
- module methodology versions are recorded;
- Risk Gate executes deterministically;
- `execution_authorized=false` remains true unless a separate explicit execution product is created;
- calculation/data hashes are preserved;
- any source gap remains visible in the result.

## Country denominator

The authoritative denominator is the enabled sovereign-country registry, not “countries that happened to have source rows.”

Every production census must publish:

- sovereign denominator count;
- accepted country count;
- fail-closed country count;
- accepted percentage;
- missing module distribution;
- stale/freshness failure distribution;
- source-rights failure distribution;
- unverified module distribution;
- explicit source gaps such as Vatican/Holy See where relevant;
- exact accepted ISO3 list;
- exact fail-closed ISO3 list with machine-readable reasons.

## Source absence semantics

Absence must be interpreted according to source type.

### Global-release sources

If a complete global release manifest proves that a source checked the whole eligible universe, a missing event can sometimes legitimately mean zero events for that release period. This is allowed only where the adapter and methodology explicitly define that semantic.

### Event/news feeds

No row for a country in GDELT, USGS, FIRMS or another event stream does **not** automatically mean zero country risk. It means “no matching event in the checked feed/window.” Country risk remains dependent on the versioned mapping methodology and other modules.

### Periodic official statistics

No current observation means unavailable/stale. It must fail closed if the metric is required.

## Multi-source rule

Geomacro should avoid provider monoculture, but multi-source does not mean mechanically averaging incompatible datasets.

A second source may be used as:

- a compatible substitute under a documented harmonisation rule;
- a corroborating source;
- a regional supplement;
- a separate feature inside the same module;
- a freshness/event overlay.

The exact role must be versioned.

### Forbidden shortcut

Do not merge two metrics merely because both contain the word “debt,” “risk,” “trade,” “conflict,” “energy” or “governance.”

For example, OECD general-government D3/D4 debt is not silently interchangeable with World Bank central-government debt. Government sector, instrument coverage, valuation and frequency must be reconciled in a new methodology version first.

## Current source layers

### Geopolitical / security

- UCDP governed conflict data: authoritative conflict evidence and release manifests.
- GDELT 2.0 events: near-real-time global event/news metadata, 15-minute release layer, commercial-use terms recorded.
- ReliefWeb/OCHA-derived paths: derived-only where exact source policy permits.

GDELT may improve timeliness and corroboration but does not replace UCDP conflict methodology by default.

### Governance

- World Bank WGI is the current production base.
- V-Dem remains review-gated until share-alike implications for proprietary paid outputs are deliberately resolved.

### Sovereign fiscal / macro

- World Bank WDI production base.
- OECD public finance candidate for fresh D3/D4 government-debt evidence.
- Eurostat government finance candidate for EU/EFTA regional supplement.
- ADB exact open-data datasets candidate for developing-Asia supplement.
- IMF and BIS remain permission/review-gated for paid production use.

### Banking / currency / external buffers

- World Bank WDI production base.
- BIS candidate remains review-gated until paid-product use is explicitly cleared.

### Energy / commodities

- EIA international energy is a commercially usable candidate under U.S. public-domain reuse rules, with API key.
- USGS Mineral Commodity Summaries remains the current verified critical-minerals source.
- IEA/JRC legacy registry entries remain disabled until exact current dataset rights + adapter evidence are closed.

### Natural hazards / environment

- USGS Earthquake Hazards: global real-time event feed, minute-scale updates.
- NASA FIRMS MODIS NRT: global near-real-time fire detections, free MAP_KEY required.
- GDACS: useful near-real-time multi-hazard candidate but reuse/decision-use boundary remains review-gated.

### Agriculture / food / trade

- FAOSTAT has broad 245+ country/territory coverage and dataset-level open licences, but its additional terms include commercial-enterprise-promotion restrictions and third-party exceptions. Keep paid Risk Gate activation review-gated until exact use is cleared.
- UN Comtrade remains permission-required for the current commercial use case.

### Labour / health / societal

- ILOSTAT offers global programmatic statistics but exact statistical-database paid-product reuse terms must be recorded before commercial activation.
- WHO GHO covers all 194 WHO Member States but WHO dataset terms constrain commercial-enterprise use and broader modification, so it remains permission-required for paid Risk Gate use.

## Production promotion checklist

A module/source is promoted only when all are true:

- [ ] exact source rights are reviewed;
- [ ] source registry state matches the review;
- [ ] operational adapter exists;
- [ ] secrets/API keys, if required, are configured in production;
- [ ] input schema is validated;
- [ ] deterministic normalized identity is used;
- [ ] duplicate/revision semantics are explicit;
- [ ] release/freshness manifest is written;
- [ ] country coverage is measured;
- [ ] source gaps are explicit;
- [ ] methodology is versioned;
- [ ] source-to-feature semantics are documented;
- [ ] unit and contract tests pass;
- [ ] production ingest passes;
- [ ] global census passes for at least the countries actually claimed supported;
- [ ] evidence artifact is retained;
- [ ] public/commercial copy states the exact claim boundary.

## Industry-ready definition

Geomacro is industry-ready for a specific country/action only when an independent reviewer can trace:

`Risk Gate output -> action profile -> module states -> normalized features -> source observations -> source release/freshness manifests -> official source references -> commercial-rights decision -> timestamps -> methodology version -> calculation hashes`.

Anything less is a development candidate, not a supported production claim.
