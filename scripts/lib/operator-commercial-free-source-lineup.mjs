import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

/**
 * Operator's October 13 source lineup, split into distinct provider families.
 * This is an executable private research inventory, NOT permission to pay,
 * sign, ingest raw redistributions or promote a source to current evidence.
 *
 * Entries: [id, provider/family, access class, exact existing policy ID?].
 * No credential is embedded. Provider credit duties stay in the canonical
 * dataset-specific rights record; public customer identities are untouched.
 */
const FAMILIES = Object.freeze({
  geopolitics: [
    ["gdelt_events", "GDELT 2.0 Events", "NO_KEY", "gdelt_v2_events"],
    ["ucdp_ged", "UCDP GED", "OPEN_DATA", "ucdp_ged"],
    ["nasa_firms", "NASA FIRMS", "FREE_KEY"],
    ["usgs_earthquakes", "USGS Earthquakes", "NO_KEY", "usgs_earthquake_hazards"],
    ["noaa_nhc", "NOAA National Hurricane Center", "NO_KEY"],
    ["copernicus_sentinel", "Copernicus Sentinel", "REGISTRATION"],
    ["state_dept_advisories", "US State Department Advisories", "NO_KEY"],
    ["marad_advisories", "US MARAD Maritime Advisories", "NO_KEY"],
    ["cisa_kev", "CISA Known Exploited Vulnerabilities", "NO_KEY"],
    ["uk_fcdo_advisories", "UK FCDO Travel Advisories", "NO_KEY"],
    ["abuse_ch", "abuse.ch threat indicators", "DATASET_REVIEW"],
    ["unhcr_refugee_statistics", "UNHCR Refugee Statistics", "NO_KEY", "unhcr_refugee_statistics"],
    ["ocha_hdx_hapi", "OCHA HDX HAPI", "DATASET_REVIEW"],
    ["wikimedia_pageviews", "Wikimedia Pageviews", "NO_KEY"],
    ["wikimedia_eventstreams", "Wikimedia EventStreams", "STREAM_ACCESS"],
    ["ofac_sdn", "US OFAC SDN sanctions", "NO_KEY"],
    ["un_security_council_sanctions", "UN Security Council Sanctions", "NO_KEY"],
    ["eu_consolidated_sanctions", "EU Sanctions List", "DATASET_REVIEW"],
    ["uk_ofsi_sanctions", "UK OFSI sanctions", "NO_KEY"],
    ["federal_register", "US Federal Register", "NO_KEY"],
    ["us_bis_export_controls", "US BIS Export Controls", "NO_KEY"],
    ["eur_lex", "EUR-Lex legislation", "NO_KEY"],
  ],
  macro: [
    ["bls", "BLS public data", "NO_KEY"],
    ["bea", "BEA data", "FREE_KEY"],
    ["census", "US Census", "NO_KEY"],
    ["treasury_fiscaldata", "US Treasury FiscalData", "NO_KEY"],
    ["treasury_tic", "US Treasury TIC", "DATASET_REVIEW"],
    ["treasury_yield_curve", "US Treasury Yield Curve", "NO_KEY"],
    ["ofr_financial_stress", "OFR Financial Stress Index", "NO_KEY"],
    ["eia", "US EIA", "FREE_KEY"],
    ["cftc_cot", "CFTC Commitments of Traders", "NO_KEY"],
    ["sec_edgar", "SEC EDGAR", "NO_KEY"],
    ["federal_reserve", "Federal Reserve", "NO_KEY"],
    ["ny_fed", "Federal Reserve Bank of New York", "NO_KEY"],
    ["world_bank_wdi", "World Bank WDI", "NO_KEY", "world_bank_indicators"],
    ["world_bank_pink_sheet", "World Bank Pink Sheet", "DATASET_REVIEW"],
    ["oecd", "OECD statistics", "NO_KEY"],
    ["eurostat", "Eurostat statistics (dataset-specific)", "NO_KEY"],
    ["eurostat_comext", "Eurostat Comext", "DATASET_REVIEW"],
    ["ecb_data_portal", "ECB Data Portal", "NO_KEY"],
    ["ecb_fx", "ECB foreign exchange rates", "NO_KEY"],
    ["ons", "UK ONS statistics", "NO_KEY"],
    ["abs", "Australian Bureau of Statistics", "NO_KEY"],
    ["statcan", "Statistics Canada", "NO_KEY"],
    ["destatis", "Destatis German statistics", "NO_KEY"],
    ["japan_estat", "Japan e-Stat", "REGISTRATION"],
    ["entsoe", "ENTSO-E Transparency (open subset only)", "FREE_KEY"],
    ["entsog", "ENTSOG transparency", "DATASET_REVIEW"],
    ["ember", "Ember energy datasets", "DATASET_REVIEW"],
    ["aemo", "AEMO market data", "DATASET_REVIEW"],
    ["caiso", "CAISO public market data", "DATASET_REVIEW"],
    ["ercot", "ERCOT market data", "DATASET_REVIEW"],
    ["defillama", "DeFiLlama", "TERMS_REVIEW"],
    ["pyth_hermes", "Pyth Hermes", "TERMS_REVIEW"],
    ["chainlink_onchain", "Chainlink on-chain feeds", "TERMS_REVIEW"],
    ["circle_usdc_transparency", "Circle USDC transparency", "DATASET_REVIEW"],
  ],
  rare_earth: [
    ["usgs_mcs", "USGS Mineral Commodity Summaries", "NO_KEY", "usgs_mcs"],
    ["usitc_dataweb", "USITC DataWeb", "REGISTRATION"],
    ["usaspending", "USASpending", "NO_KEY"],
    ["sam_gov", "SAM.gov data", "FREE_KEY"],
    ["geoscience_australia", "Geoscience Australia", "NO_KEY"],
    ["nrcan", "Natural Resources Canada", "NO_KEY"],
    ["bgs_world_minerals", "BGS World Mineral Statistics", "DATASET_REVIEW"],
    ["us_doe", "US Department of Energy critical minerals", "NO_KEY"],
    ["us_dod", "US Department of Defense critical minerals", "NO_KEY"],
    ["eu_crma", "EU Critical Raw Materials Act announcements", "NO_KEY"],
  ],
});

/** Only exact prior-reviewed datasets are inherited, not their entire provider. */
export const SOURCE_LINEUP = Object.freeze(
  Object.entries(FAMILIES).flatMap(([category, entries]) =>
    entries.map(([id, provider, access, rightsId]) => {
      const rights = rightsId ? COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[rightsId] : null;
      if (rightsId && rights?.approved_status !== "VERIFIED")
        throw new Error("SOURCE_RIGHTS_ALIAS_NOT_APPROVED:" + id);
      return Object.freeze({
        id, category, provider, access,
        canonical_exact_rights_id: rightsId ?? null,
        catalog_rights_status: rights ? "EXISTING_EXACT_DATASET_VERIFIED"
          : "REVIEW_REQUIRED_NO_COMMERCIAL_ACTIVATION",
        transport_state: "NOT_PROVEN_BY_THIS_LINEUP",
        publisher_original_event_verified: false,
        production_paid_eligible: false,
        customer_raw_distribution: false,
        requires_per_asset_license_check: true,
      });
    })
  )
);

export const SOURCE_LINEUP_BY_ID = new Map(SOURCE_LINEUP.map(x => [x.id, x]));

export function sourceLineupSummary() {
  const counts = Object.fromEntries(Object.keys(FAMILIES).map(category =>
    [category, SOURCE_LINEUP.filter(x => x.category === category).length]
  ));
  return {
    schema: "geomacro.operator-free-commercial-lineup.v1",
    total_families: SOURCE_LINEUP.length,
    by_category: counts,
    existing_exact_rights_verified:
      SOURCE_LINEUP.filter(x => x.canonical_exact_rights_id).map(x => x.id),
    new_paid_sources_activated: 0,
    signed_gro_generated: false,
    x402_payment_authorized: false,
    no_new_supabase_dependency: true,
  };
}
