# Commercial discovery-provider policy

**Status:** engineering commercialization control  
**Reviewed:** 2026-09-10

This document explains the commercial-rights boundary for the live `admitted_events` handoff used by current country Risk Objects.

## Why this exists

The live news ingestion layer preserves the **original evidence publisher** as `source_name`, `source_domain` and `source_url`. That is correct for source independence and provenance, but it means an internal structured fragment does not directly reveal which discovery service found the item.

The current ingestion code has exactly four discovery providers:

- Guardian Open Platform
- GDELT
- ReliefWeb
- GDACS

A regression test extracts every `discoveryProvider` literal from `scripts/ingest-news.js` and fails if this set changes. A new discovery provider therefore cannot silently inherit the commercial treatment documented here.

## Current policy

### Guardian Open Platform

**Engineering state:** `INELIGIBLE` for the current automated commercial intelligence path.

Current Guardian Open Platform terms include restrictions on machine-learning/AI use and text/data aggregation, analysis and mining of Content API / Open Platform content. Geomacro therefore must not use direct Guardian Open Platform content as an input to the paid automated Risk Object / Risk Gate path under the existing developer terms.

Reference: `https://www.theguardian.com/open-platform/terms-and-conditions`

A separately negotiated Guardian rights-managed/full-access agreement would require a new review and explicit policy change. No such agreement is claimed here.

### GDELT discovery

**Engineering state:** `DERIVED_ONLY`.

GDELT is used as discovery infrastructure. Geomacro keeps the original publisher identity for provenance and does not treat GDELT itself as the evidence publisher. Current commercial delivery may use the resulting event only inside a derived Risk Object / Risk Gate output. Raw publisher payload redistribution is not permitted by this policy.

Reference: `https://www.gdeltproject.org/about.html`

### ReliefWeb discovery

**Engineering state:** `DERIVED_ONLY`.

ReliefWeb is used as discovery infrastructure and Geomacro preserves the original information-partner URL/domain. Current commercial delivery is restricted to derived intelligence. Raw source-document or payload redistribution is outside this permission state.

Reference: `https://www.unocha.org/reliefweb`

### GDACS

**Engineering state:** `REVIEW_REQUIRED`.

The public GDACS terms/disclaimer describe the service, limitations and validation requirements but do not provide a sufficiently explicit commercial reuse licence for Geomacro to promote this path automatically. GDACS evidence therefore remains outside paid machine delivery until a specific rights review is closed.

Reference: `https://data.gdacs.org/About/termofuse.aspx`

## Derived-only delivery contract

`DERIVED_ONLY` does **not** mean raw content may be resold. It means a reviewed discovery lane may support a Geomacro-derived Risk Object when the delivered product does not expose the provider's raw payload or private warehouse data.

For country GROs, the current machine contract contains Geomacro's calculated score, attribution, confidence, event-level evidence references/provenance summaries and integrity fields. `DERIVED_ONLY` restrictions stay attached to `commercial_eligibility.reason_codes` as `derived_only_delivery_no_raw_redistribution`.

A country GRO can be commercially eligible when every used event is either `VERIFIED` or `DERIVED_ONLY`, provided there is no other verification blocker. Any `UNVERIFIED`, `REVIEW_REQUIRED`, missing-policy or `INELIGIBLE` evidence continues to fail closed.

## Permanent boundaries

This policy does not:

- grant rights to an entire publisher website;
- grant raw article/body/image redistribution rights;
- turn a public URL into commercial permission;
- override provider-specific terms;
- authorize execution, custody or payment;
- make the corridor pilot methodology independently verified;
- replace formal legal review where a provider or customer contract requires it.

`execution_authorized=false` remains the product boundary.
