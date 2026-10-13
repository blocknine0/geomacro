# Commercial-free source lineup — 13 October 2026

## Operator request and scope

Source families submitted by the operator have been reconciled into
[scripts/lib/operator-commercial-free-source-lineup.mjs](../../scripts/lib/operator-commercial-free-source-lineup.mjs).
The launch domains remain **Geopolitics**, **Macro/FX**, and **Critical Minerals**.
Sanctions and security-advisory sources belong to Geopolitics; where sanctions
involve strategic minerals the same *event* may inform Critical Minerals, but
must not be counted as an independent second publisher.

**Source inventory is not a live intake, intelligence verification, paid
deliverability, provider redistribution licence or signed GRO.**

## What is wired now

- Every listed family receives a unique internal source ID, home domain,
  access class (no key, free registration/key, dataset/terms review),
  exact rights-evidence alias when independently approved, and fail-closed
  commercial state.
- The exact existing commercial rights evidence register is reused for
  GDELT Events, UCDP GED, USGS Earthquakes, UNHCR refugee statistics,
  World Bank WDI and USGS MCS. This does NOT extend approval to GDELT DOC
  article text, unrelated UCDP derivatives, third-party imagery, other World
  Bank products, other UNHCR content, or unrelated USGS publications.
- 9 pinned official endpoints have bounded **transport-only** probes:
  three geopolitical/regulatory sources, three Macro/FX, three
  Critical Minerals/context sources.
- GitHub Actions
  [free-commercial-source-lineup.yml](../../.github/workflows/free-commercial-source-lineup.yml)
  runs one public no-card endpoint per domain twice daily, rotating three
  candidates per domain. It is low-cost independent transport telemetry only.
- Each request is HTTPS, fixed allowlist, no redirects, <=7-second timeout,
  bounded body bytes, and no third-party text/name/URL printed. No B2/D1/
  Supabase writes; no API secret or USDC payment.
- Tests verify identity deduplication, missing licences held, 3×3 coverage,
  schema-specific response checks, no HEAD-only feed promotion, and
  negative 429/network cases.

## Licence, attribution and transport boundaries

- US government-origin works are usually reusable, but pages may embed
  third-party works and commercial access may be subject to API rules.
- UCDP GED and World Bank WDI are **dataset-specific** CC BY reuse contracts,
  not a generic permission to distribute every document from the provider.
- OCHA HDX HAPI may aggregate datasets with different licences; the HAPI
  software repository's open-source licence is NOT a data licence.
- NASA FIRMS requires a free MAP_KEY for data API use. We do not fake,
  borrow or hard-code one. Free registration remains optional until the
  operator supplies one via appropriate server-only secrets.
- ENTSO-E Transparency terms describe a **subset** of data available for
  free reuse; generic ENTSO-E/ENTSOG provider approval is not established.
- Pyth/Chainlink/DeFiLlama/market operator feeds are not declared freely
  resellable or redistributable; per-feed terms and access models must be
  checked. Reading public/on-chain data is not a blanket right to sell an
  identical stream.
- The user requests private source identities in customer output, while some
  reviewed CC BY / OGL datasets require attribution. Existing public signing
  and payment schemas therefore **must not silently drop required credits**.
  Exact rights evidence and source attribution must be honored before a
  source contributes to any newly activated paid deliverable.

## What needs evidence to advance a source

1. Pin exact dataset/endpoint/version, format, original publication/reference
   period and source attribution requirements.
2. Independently probe access and rate limits using safe authorized credentials
   where necessary. No raw upstream re-publication.
3. Preserve qualified evidence clocks (an annual MCS table, monthly BLS
   CPI value, hazard measurement and sanctions update are different objects).
4. Normalize and deduplicate actual records with Geomacro's existing
   intelligence pipeline; don't equate HTTP 200 with news.
5. Verify source certification, semantic fitness, reuse rights and required
   credits; only then consider explicit commercial eligibility.
6. Independently verify GRO signature, x402 no-funds protocol, exact deployed
   website build SHA and real purchase *after* founder's explicit money ACK.

This phase improves the operator's source **lineup and transport monitoring**
without pretending all families are active or current scored intelligence.
