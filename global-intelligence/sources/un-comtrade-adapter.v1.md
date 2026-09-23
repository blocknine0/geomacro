# UN Comtrade trade-flow adapter

UN Comtrade is wired as a machine-readable trade-flow evidence source for MACRO and CRITICAL_MINERALS.

## Access

- Public preview works without an account/key but is intentionally limited.
- The free basic individual account can subscribe to the Free APIs product and obtain a subscription key.
- Set `UN_COMTRADE_API_KEY` locally or in the runtime secret store. Never commit it.
- With the key present, this adapter uses the authenticated `data/v1/get` API. Without it, it uses the public preview API.

The current UN Comtrade documentation states that the free basic individual subscription provides up to 500 API calls/day, while the public preview is limited to 500 records.

## Global reporter coverage

Reporter codes are not hard-coded for only a few countries. The adapter resolves ISO3 → numeric reporter code from the current official UN Comtrade `partnerAreas.json` reference catalog at runtime.

This is important for the 195-country mesh because Comtrade requires numeric reporter codes.

## Evidence model

The adapter emits:

- `TRADE_EXPORT`
- `TRADE_IMPORT`
- `TRADE_BALANCE`

Trade balance is derived as exports minus imports for the exact query scope. Export and import claims remain separate observations.

## Query scope

Supported:

- annual `YYYY` and monthly `YYYYMM` periods;
- HS `cmdCode`;
- world partner `0` or a specific partner code;
- second partner;
- mode of transport;
- customs code;
- preview or authenticated access.

For critical-minerals production claims, `TOTAL` is not sufficient. A governed HS mineral-code catalog must be added before certification.

## Remaining certification gates

This adapter is not production-certified yet. We still need:

1. runtime probe success;
2. reporter resolution verified across all 195 canonical countries;
3. mineral-specific HS code catalog;
4. freshness/release-date checks;
5. provenance/query-scope persistence;
6. retry/rate-limit handling;
7. commercial/re-dissemination review.
