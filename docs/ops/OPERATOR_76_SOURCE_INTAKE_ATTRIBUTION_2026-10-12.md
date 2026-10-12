# Operator-provided 76-source registry reconciliation — 12 October 2026

**Status:** 76 named source candidates catalogued and deduplicated against the
existing canonical three-domain source registry, but **NOT 76 new live feeds,
NOT permission to resell upstream data, NOT 195×3 current scored intelligence**.

Canonical product categories remain **Geopolitics**, **Macro/FX**, and
**Critical Minerals**. The operator's `sanctions_policy` sources map to
Geopolitics and, where relevant, Critical Minerals. General-news feeds are
cross-domain **secondary context only**; `markets` feeds are auxiliary Macro/FX
candidates and deferred from this three-category production launch.

## Repository implementation

- [Exact source-by-source reconciliation](../../config/operator-76-source-attribution-intake.v1.json):
  76 unique IDs, user-requested public publisher name, source tier, proposed
  cadence, candidate endpoint, declared license (unverified), existing canonical
  source ID when equivalent, rights hold, original-freshness type, and explicit
  runtime state. **20 reconcile to an existing exact registry/catalog ID;
  that is not evidence of 20 healthy live transports.**
- Existing source IDs and adapters were **not duplicated or reactivated**.
- Rights, HTTP access and format checks are still required before enabling
  external scraping, paid feeds, unapproved Telegram accounts or financial
  market streaming. Placeholders (`multiple`, `tbd`, `onchain`) are never
  treated as functioning endpoints.
- The existing 90-minute Actions workflow now adds exactly three *read-only*
  official context probes: USGS Earthquake GeoJSON (Geopolitics/hazard context),
  U.S. Treasury FiscalData (Macro/FX *monthly* rate reference), and Federal
  Register (Critical Minerals **U.S.** policy search). These do not represent
  violence verification, near-real-time macro values, world mineral coverage,
  a scoring pipeline or commercial publisher clearance.
- Every probe has an explicit 10-second timeout, 512-KiB response maximum,
  no retries around provider restrictions, **zero** B2/D1/Supabase operations,
  no raw upstream storage and a three-day private sanitized receipt.

## Provider name, credits and paid results

User instruction: **when a dataset or publisher requires its name credited,
retain that credit.** The overlay stores the requested displayed provider name
for **all 76 sources**, but an unused source's name must never be presented as
evidence it contributed to a particular Geomacro finding.

`scripts/lib/operator-source-attribution.mjs` exposes
`mandatoryDerivedSourceCredits(usedSourceIds)`: it deduplicates the verified
provider credit **only for datasets actually used** in a result, and throws
closed for missing or non-verified dataset-specific commercial rights. This
isolated helper does not silently change the existing signed GRO/x402 response
schema or leak the private original-publisher evidence graph.

Examples of existing **dataset-scoped** credit evidence:
- GDELT 2.0 Events → `GDELT Project`. GDELT DOC-article text is **not**
  covered by the Events dataset right.
- World Bank World Development Indicators → `World Bank`, with CC BY and
  change indications wherever applicable.
- UCDP GED → `Uppsala Conflict Data Program (UCDP)`, with additional exact
  dataset/publication citation rules in the existing rights register.
- USGS Mineral Commodity Summaries and official earthquake data →
  `U.S. Geological Survey`.
- Eurostat government debt has its own reviewed attribution rules; that
  approval **does not automatically license Eurostat Comext**.
- ReliefWeb is a humanitarian aggregator that hosts **contributed reports**.
  Display `ReliefWeb` only as intermediary where supported; original content
  owner and permitted reuse must be reviewed separately. Provider approval
  and readable HTTP metadata **do not grant report-text redistribution**.
- `ACLED`, paid wire services, `OpenSanctions`, `SMM`, `ASX` and all
  unknown rights remain on hold until **exact** permission and any required
  credit wording is checked.

**Important integration boundary:** This PR installs the durable attribution
resolution contract. Customer-facing credits should be included when wiring an
*actually used, rights-verified* source into a signed derived intelligence
product. Existing endpoints which explicitly prohibit source-identity delivery
remain unchanged until that downstream schema and signature are reviewed.
Never promise customer-visible credits before that separate acceptance.

## Real operating evidence required

1. GitHub CI passes including source-registry, attribution, transport and
   source rights tests.
2. The new main-branch Actions job returns `ALL_THREE_CONTEXT_TRANSPORTS_LIVE`
   and exactly one successful HTTP response from each new provider.
3. Existing ReliefWeb approval-gated observation and 12 source lanes remain
   intact, with GDELT bulk fallback kept separate.
4. Never infer current event qualification, 195-country coverage,
   independent corroboration, commercial rights or GRO signature from these
   metadata probes.

References: existing
[`COMMERCIAL_SOURCE_RIGHTS.md`](../COMMERCIAL_SOURCE_RIGHTS.md)
and
[`STEP1_THREE_CATEGORY_OFFICIAL_FEED_AUDIT_2026-10-11.md`](../STEP1_THREE_CATEGORY_OFFICIAL_FEED_AUDIT_2026-10-11.md).
