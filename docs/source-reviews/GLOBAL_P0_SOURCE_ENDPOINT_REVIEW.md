# Global P0 Source Endpoint Review

Date: 2026-09-24
Branch: `feat/global-source-p0-expansion`
Status: prelaunch, fail-closed

## Scope

This review covers the ten authoritative sources registered by the Global P0 source expansion. Registration does not activate ingestion or commercial signals.

Every source remains disabled until the full activation gate passes:

- endpoint_pass
- rights_review
- schema_pass
- freshness_pass
- provenance_pass
- independence_pass
- adapter_tested
- runtime_pass

## Authoritative source evidence

| Source ID | Category | Official discovery / data surface | Evidence status |
|---|---|---|---|
| `uk_sanctions_list` | GEOPOLITICS | UK Sanctions List publication and machine-readable list | Official source verified; machine-readable formats are published |
| `eu_sanctions_consolidated` | GEOPOLITICS | European Commission sanctions overview / consolidated financial sanctions list | Official source verified; exact production transport still requires runtime certification |
| `opcw_news` | GEOPOLITICS | OPCW media centre news | Official source verified |
| `icj_cases` | GEOPOLITICS | ICJ cases | Official source surface identified; runtime certification required |
| `icc_news` | GEOPOLITICS | ICC news | Official source surface identified; runtime certification required |
| `unctadstat_global` | MACRO | UNCTADstat Data Centre | Official source verified; multiple datasets are actively updated |
| `world_bank_commodity_prices` | MACRO | World Bank Commodity Markets / Pink Sheet | Official source verified; September 2026 monthly/annual data surfaces are published |
| `china_mofcom_trade_controls` | CRITICAL_MINERALS | China MOFCOM | Official government source verified; exact trade-control extraction requires certification |
| `australia_critical_minerals` | CRITICAL_MINERALS | Australian Government Critical Minerals | Official government source verified |
| `cochilco_minerals` | CRITICAL_MINERALS | Chilean Copper Commission (COCHILCO) | Official government source verified |

## External verification

The World Bank currently exposes September 2026 Pink Sheet monthly and annual XLS data, alongside the commodity-market page. urlWorld Bank Commodity Marketshttps://www.worldbank.org/en/research/commodity-markets

UNCTADstat currently lists regularly updated datasets including merchandise trade, balance of payments, commodity prices, and critical-minerals trade. urlUNCTADstat Data Centrehttps://unctadstat.unctad.org/datacentre/

The UK Sanctions List is the UK Government's current sanctions designation source and publishes machine-readable formats. Exact ingestion transport must still pass the repository's runtime and rights gates before activation.

## Runtime probe

The repository includes:

`node scripts/test-global-p0-source-endpoints.mjs`

The probe is read-only and does not activate sources. It records HTTP status, final URL, content type, response size, latency, and timestamp.

The model execution environment used during implementation cannot resolve external DNS hosts, so a local execution from that environment cannot be treated as a source-health result. A GitHub Actions workflow has therefore been added to execute the same read-only probe on GitHub-hosted infrastructure and retain the JSON result as an artifact.

## Activation rule

No source in this P0 expansion may be enabled solely because an official page is reachable. Activation requires the complete source certification evidence graph, including rights, schema, freshness, provenance, independence, adapter tests, and runtime health.
