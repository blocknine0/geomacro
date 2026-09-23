const DEFAULT_TABLES = {
  macro: "commercial_macro_observations",
  geopolitical: "commercial_structural_geopolitical_observations",
  geopoliticalCountryLatest: "commercial_structural_country_latest",
  geopoliticalProfiles: "commercial_structural_country_profiles",
  geopoliticalCorridors: "commercial_structural_corridor_latest",
  rareEarth: "rare_earth_canonical_observations"
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeRows(body) {
  if (!Array.isArray(body)) throw new Error("Historical Supabase response was not an array");
  return body;
}

async function queryTable({ table, select="*", filters={}, limit=1000, order }) {
  const base = requireEnv("HISTORICAL_SUPABASE_URL").replace(/\/$/, "");
  const key = requireEnv("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(`${base}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 5000)));
  if (order) url.searchParams.set("order", order);
  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(field, typeof value === "string" ? `eq.${value}` : `eq.${String(value)}`);
  }
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  if (!response.ok) {
    throw new Error(`Historical Supabase HTTP ${response.status}: ${await response.text()}`);
  }
  return normalizeRows(await response.json());
}

export async function fetchHistoricalMacro(options = {}) {
  return fetchHistoricalEvidence({
    table: options.table ?? DEFAULT_TABLES.macro,
    source_id: "geomacro_historical_macro",
    ...options
  });
}

export async function fetchHistoricalGeopolitics(options = {}) {
  return fetchHistoricalEvidence({
    table: options.table ?? DEFAULT_TABLES.geopoliticalCountryLatest,
    source_id: "geomacro_historical_geopolitics",
    ...options
  });
}

export async function fetchHistoricalRareEarths(options = {}) {
  return fetchHistoricalEvidence({
    table: options.table ?? DEFAULT_TABLES.rareEarth,
    source_id: "geomacro_historical_rare_earths",
    ...options
  });
}

export async function fetchHistoricalEvidence({
  table,
  source_id,
  select="*",
  filters={},
  limit=1000,
  order="observed_at.desc"
} = {}) {
  const rows = await queryTable({table, select, filters, limit, order});
  return {
    source_id,
    source_repository: "blocknine0/geomacro-historical-data",
    source_table: table,
    fetched_at: new Date().toISOString(),
    rows,
    count: rows.length,
    methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_OR_GRO_UNTIL_SEPARATELY_VERSIONED",
    raw_warehouse_access: false
  };
}

export const historicalDataSourcePolicy = {
  repository: "blocknine0/geomacro-historical-data",
  role: "provenance-first historical evidence layer",
  allowed: [
    "historical_macro_context",
    "historical_geopolitical_evidence",
    "rare_earth_supply_chain_history",
    "cross_source_reconciliation",
    "country_profile_context"
  ],
  forbidden: [
    "direct_raw_warehouse_reads",
    "browser_exposure_of_historical_service_role",
    "silent_zero_fill",
    "automatic_GRI_GRO_score_changes",
    "unversioned_methodology_changes"
  ],
  source_terms_review_required: true
};
