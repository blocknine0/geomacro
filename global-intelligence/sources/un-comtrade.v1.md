# UN Comtrade trade-flow source contract

## Purpose
UN Comtrade is used as an independent machine-readable trade-flow evidence source for MACRO and CRITICAL_MINERALS. Trade flow is evidence of reported imports/exports, not proof of production, reserves, capacity, or physical availability.

## Evidence types
- `TRADE_EXPORT`
- `TRADE_IMPORT`
- `TRADE_BALANCE`

## Request model
- Reporter: country ISO3 resolved to the official numeric reporter code.
- Period: year or supported Comtrade period value.
- Commodity: HS code or `TOTAL`.
- Partner: default `0` for world aggregate; a specific partner may be supplied.
- Flow: `X` export or `M` import.
- The adapter performs separate export/import requests when trade balance is requested.

## Credentials
- `UN_COMTRADE_API_KEY` is an application secret and must never be committed.
- The adapter can attempt the preview endpoint without a key when `allowPreview=true`.
- Production certification should use the free registered API key so rate limits and access are explicit.

## Country-code safety
Only a curated numeric reporter map is shipped initially. For countries outside that map, the caller must supply `reporterCode` obtained from the official Comtrade reference data. This prevents silent ISO-to-number guessing.

## Interpretation rules
- Export/import observations remain separate evidence.
- Trade balance is derived as exports minus imports for the same reporter, period, commodity and partner scope.
- A trade-flow observation must not be relabeled as production, reserves, capacity or disruption.
- Conflicting trade observations from different sources remain separate until an explicit reconciliation step.
- Missing, stale, rate-limited or unauthorized responses must be surfaced as source-health failures, never silently converted to zero.

## Certification status
Adapter implemented; runtime PASS has not yet been established in this branch.
