The project has baseline sources for all three categories plus the dedicated global P0 expansion.

| Category | Global baseline | P0 additions | Country primary | Telegram | Trade/supply cross-check | Main remaining risk |
|---|---|---|---|---|---|---|
| GEOPOLITICS | GDELT + UN/official | UK/EU sanctions, OPCW, ICJ, ICC | Government/official | Yes | Optional | Live endpoint extraction and reuse-rights certification |
| MACRO | World Bank + IMF/BIS/ECB/OECD | UNCTADstat + World Bank commodity prices | Statistics/Central Bank | Yes | UN Comtrade | Dataset/API-level normalization and reuse-rights certification |
| CRITICAL_MINERALS | USGS + BGS + national | China MOFCOM, Australia, COCHILCO | Minerals authority | Yes | UN Comtrade | Dataset extraction and commercial/reuse certification |

## Dedicated P0 expansion

The ten P0 sources are registered in both the production-facing source expansion registry and the global intelligence source catalog. All ten remain fail-closed:

- GEOPOLITICS: UK Sanctions List, EU Consolidated Financial Sanctions, OPCW News, ICJ Cases, ICC News
- MACRO: UNCTADstat, World Bank Commodity Markets / Pink Sheet
- CRITICAL_MINERALS: China MOFCOM, Australian Critical Minerals, COCHILCO

The goal is 195-country coverage with redundant, current, provenance-preserving evidence and a clear distinction between confirmed intelligence and early signals.

A P0 source is not promoted to production merely because an endpoint responds or a parser fixture passes. Activation remains gated by endpoint, rights, schema/runtime, freshness, provenance, independence and production-ingestion evidence.
