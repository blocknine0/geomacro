# 12 October 2026 — Private provider provenance / derived-only customer disclosures

## Product policy

All three public Geomacro category APIs and Intelligence website show only
Geomacro-derived risk information, or category-level **monitoring status**.
They must not expose original publisher URLs, feed item bodies, provider/source
IDs, lists of contributing upstream sources, original Telegram posts or
internal inventory receipts. Monitoring status is **not a signed risk result**.
Supplier rights checks remain mandatory where the specific upstream terms
restrict commercial analysis or require public attribution. Providers with
mandatory attribution incompatible with private-source delivery must be
excluded from commercial use until appropriate separate permission.

## Public exposure corrected in this patch

- The previous public client imported
  `config/public-intelligence-source-intake-coverage.v1.json` and showed
  its October 10 **778 source-entry** snapshot plus GitHub receipt URL in
  `/intelligence`. This was outdated and unnecessarily disclosed the internal
  registry composition.
- This patch updates the private control-plane reconciliation snapshot to
  independently observed **1,059 domain-specific references** from
  [main intake run #38223231621](https://github.com/blocknine0/geomacro/actions/runs/38223231621)
  at 2026-10-12T08:23:20.646Z. Internal lanes: core 48, free 28, roots
  535, Telegram candidates 152, historical 15, operator list 113,
  operator country 108 and operator corridor 60. These are neither unique
  original publishers nor commercial accepted/verified intelligence. A
  distinct named set of 58 candidate corridor geographies is not
  counted as publishers.
- The customer-facing `publicIntelligenceSourceCoverage()` now exposes a
  **constant derived-product capability summary**; it neither imports the
  private snapshot nor returns counts, provider names, source keys, internal
  workflow links, rights metadata, and repository identities. Its
  `intelligence_query_path` remains one of the three public fixed category
  APIs; POST still delegates to the canonical x402 safety path.
- `SourceNetworkMonitor` shows three category status cards and last checked
  monitor time, not source-count composition or internal evidence links.
- `categoryOriginalSourcePulse()` no longer includes the internal control
  plane `source_status_endpoint` URL in the public GET response. The
  private code still reads the existing endpoint boundedly.

## Important blocker: public Git source disclosure

**The main GitHub repository is public.** Previously committed source
registries (including the operator-76 and country/corridor files) can
reveal supplier names/endpoints through current files and historical commits.
This patch prevents additional customer-facing website/API leakage, but
cannot retroactively revoke public Git history or third-party caches.

Absolute source secrecy requires a **separate private Git repository** for
supplier registry/endpoint secrets, public-main imports replaced with
minimal sanitized runtime contracts, immutable deployment tokens stored in
secrets (not client bundles), and review of any publicly exposed history.
The private `geomacro-telegram-signals` and
`geomacro-historical-data` repositories are not a substitute for data
licensing authorization. Until such a migration is independently accepted,
do not claim that the full catalog is confidential.

## Pricing and acceptance

No prices, x402 payment logic, raw B2/Supabase/D1 writes, signer keys or
source rights records are changed by this patch. User will supply the
updated price separately.
