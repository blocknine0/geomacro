# FAOSTAT + ILOSTAT country-series production observation

Reuse the official public FAO SDMX time-series endpoint for `SN_ITK_DEFC` and ILOSTAT REST endpoint for `EMP_TEMP_SEX_AGE_NB_A`. The existing 13-source probe only proved a nonempty HTTP response, not that the target statistical series, geography and period were valid.

The new independently fail-closed readers require an exact source-native indicator, ISO3 USA, year and finite observation; ambiguously duplicated same-period records are rejected. Original release date remains null because an observation year is not an issue/publication clock. Units are kept provider-defined unless supplied by the publisher. All country stats remain research-only and are not a global 195-country certification, current article, signed product or commercial right.

Production run: `FAO ILO exact country-statistics observation`, bounded GETs, no card, no Supabase, no B2/D1 writes, only sanitized metadata with no third-party numerical values. `node --test scripts/tests/official-fao-ilo-country-statistics.test.mjs` validates parser safety. The protected production receipt is mandatory; source API shape changes must fail closed.

**Still required:** Provider-produced live shape, country coding and exact public rights verification, indicator-specific units/interpretation, full 195-country coverage census and native release times. These paths do not automatically feed the paid signed Intelligence publisher or Global Risk methodology.
