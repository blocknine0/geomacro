import fs from "node:fs";
import { createHash } from "node:crypto";

const API = "https://api.worldbank.org/v2";
const SOURCE_ID = "6";
const OUTPUT = process.env.WORLD_BANK_IDS_FISCAL_OUTPUT ?? "world-bank-ids-sovereign-fiscal-coverage.json";
const AS_OF = new Date(process.env.WORLD_BANK_IDS_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_IDS_MAX_AGE_DAYS ?? 800);
const QUERY_START_YEAR = AS_OF.getUTCFullYear() - 5;
const QUERY_END_YEAR = AS_OF.getUTCFullYear();

const SERIES = Object.freeze([
  {
    id: "DT.TDS.DPPG.GN.ZS",
    concept: "PPG_EXTERNAL_DEBT_SERVICE_PCT_GNI",
    expected_label: "Public and publicly guaranteed debt service (% of GNI)",
    role: "PRIMARY_SOURCE_SPECIFIC_SOVEREIGN_FISCAL_STRESS_CANDIDATE",
  },
  {
    id: "DT.TDS.DPPG.XP.ZS",
    concept: "PPG_EXTERNAL_DEBT_SERVICE_PCT_EXPORTS",
    expected_label: "Public and publicly guaranteed debt service (% of exports of goods, services and primary income)",
    role: "SECONDARY_SOURCE_SPECIFIC_SOVEREIGN_FISCAL_STRESS_CANDIDATE",
  },
  {
    id: "DT.DOD.DECT.GN.ZS",
    concept: "TOTAL_EXTERNAL_DEBT_STOCKS_PCT_GNI",
    expected_label: "External debt stocks (% of GNI)",
    role: "EXTERNAL_VULNERABILITY_COMPARATOR_NOT_SOVEREIGN_FISCAL_ALONE",
  },
]);

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

async function requestJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "Geomacro-World-Bank-IDS-Fiscal-Audit/1.2 (+https://geomacro.live)",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed[0]?.message) {
        throw new Error(`World Bank API: ${JSON.stringify(parsed[0].message)}`);
      }
      return { parsed, response_sha256: sha256(text), url };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) throw lastError;
      await sleep(600 * 2 ** (attempt - 1));
    }
  }
  throw lastError ?? new Error("World Bank IDS request failed");
}

function parseYearEnd(value) {
  const match = /^(\d{4})$/.exec(String(value ?? "").trim());
  return match ? new Date(Date.UTC(Number(match[1]), 11, 31, 23, 59, 59, 999)) : null;
}

function ageDays(older, newer) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 86_400_000);
}

async function fetchIdsDebtorCountries() {
  const url = `${API}/sources/${SOURCE_ID}/country?per_page=500&format=json`;
  const { parsed, response_sha256 } = await requestJson(url);
  const variables = parsed?.source?.[0]?.concept?.[0]?.variable;
  if (!Array.isArray(variables)) throw new Error("World Bank IDS debtor-location response shape was invalid");
  const rows = variables
    .map((row) => ({ iso3: String(row?.id ?? "").trim().toUpperCase(), name: String(row?.value ?? "").trim() }))
    .filter((row) => /^[A-Z]{3}$/.test(row.iso3));
  return { rows, iso3: sorted(rows.map((row) => row.iso3)), response_sha256, url };
}

async function fetchWorldBankCountries() {
  const url = `${API}/country?format=json&per_page=500`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) throw new Error("World Bank country metadata response shape was invalid");
  const rows = parsed[1]
    .map((row) => ({
      iso3: String(row?.id ?? "").trim().toUpperCase(),
      name: String(row?.name ?? "").trim(),
      region_id: String(row?.region?.id ?? "").trim(),
    }))
    .filter((row) => /^[A-Z]{3}$/.test(row.iso3) && row.region_id && row.region_id !== "NA");
  return { rows, iso3: sorted(rows.map((row) => row.iso3)), response_sha256, url };
}

async function fetchSeries(series) {
  const params = new URLSearchParams({
    format: "json",
    source: SOURCE_ID,
    per_page: "20000",
    date: `${QUERY_START_YEAR}:${QUERY_END_YEAR}`,
  });
  const url = `${API}/country/all/indicator/${series.id}?${params.toString()}`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    throw new Error(`World Bank IDS ${series.id} response shape was invalid`);
  }

  const metadata = parsed[0] ?? {};
  const validRows = parsed[1]
    .map((row) => {
      const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
      const period = String(row?.date ?? "").trim();
      const observedAt = parseYearEnd(period);
      const value = row?.value == null ? null : Number(row.value);
      return {
        iso3,
        period,
        observed_at: observedAt?.toISOString() ?? null,
        value,
        label: String(row?.indicator?.value ?? "").trim(),
      };
    })
    .filter((row) => /^[A-Z]{3}$/.test(row.iso3) && row.observed_at && Number.isFinite(row.value));

  const labels = sorted(validRows.map((row) => row.label).filter(Boolean));
  if (!labels.includes(series.expected_label)) {
    throw new Error(`World Bank IDS ${series.id} label mismatch: ${labels.join(" | ") || "none"}`);
  }

  const latestByCountry = new Map();
  for (const row of validRows) {
    const current = latestByCountry.get(row.iso3);
    if (!current || Date.parse(row.observed_at) > Date.parse(current.observed_at)) latestByCountry.set(row.iso3, row);
  }
  const latest = [...latestByCountry.values()].sort((a, b) => a.iso3.localeCompare(b.iso3));
  const current = latest.filter((row) => {
    const observedAt = new Date(row.observed_at);
    return observedAt <= AS_OF && ageDays(observedAt, AS_OF) <= MAX_AGE_DAYS;
  });

  return {
    series_id: series.id,
    concept: series.concept,
    role: series.role,
    exact_label: series.expected_label,
    source_id: SOURCE_ID,
    query_url: url,
    response_sha256,
    api_metadata: {
      page: metadata.page ?? null,
      pages: metadata.pages ?? null,
      per_page: metadata.per_page ?? null,
      total: metadata.total ?? null,
      lastupdated: metadata.lastupdated ?? null,
    },
    latest_non_null_country_count: latest.length,
    current_or_aging_country_count: current.length,
    current_or_aging_iso3: current.map((row) => row.iso3),
    latest_period_distribution: latest.reduce((acc, row) => {
      acc[row.period] = (acc[row.period] ?? 0) + 1;
      return acc;
    }, {}),
    current_or_aging_rows: current,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("WORLD_BANK_IDS_AS_OF must be a valid timestamp");
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) throw new Error("WORLD_BANK_IDS_MAX_AGE_DAYS must be positive");

  const [idsDebtors, worldBankCountries] = await Promise.all([fetchIdsDebtorCountries(), fetchWorldBankCountries()]);
  const debtorSet = new Set(idsDebtors.iso3);
  const nonAggregateSet = new Set(worldBankCountries.iso3);
  const eligibleCountrySet = new Set(idsDebtors.iso3.filter((iso3) => nonAggregateSet.has(iso3)));

  const results = [];
  for (const series of SERIES) {
    const result = await fetchSeries(series);
    result.non_aggregate_ids_debtor_iso3 = result.current_or_aging_iso3.filter(
      (iso3) => debtorSet.has(iso3) && eligibleCountrySet.has(iso3),
    );
    result.non_aggregate_ids_debtor_count = result.non_aggregate_ids_debtor_iso3.length;
    results.push(result);
  }

  const ppgGni = results.find((item) => item.concept === "PPG_EXTERNAL_DEBT_SERVICE_PCT_GNI");
  const ppgExports = results.find((item) => item.concept === "PPG_EXTERNAL_DEBT_SERVICE_PCT_EXPORTS");
  const totalExternal = results.find((item) => item.concept === "TOTAL_EXTERNAL_DEBT_STOCKS_PCT_GNI");
  if (!ppgGni || !ppgExports || !totalExternal) throw new Error("World Bank IDS audit did not return all exact series");

  const gniSet = new Set(ppgGni.non_aggregate_ids_debtor_iso3);
  const exportSet = new Set(ppgExports.non_aggregate_ids_debtor_iso3);
  const fiscalUnion = sorted([...gniSet, ...exportSet]);
  const fiscalIntersection = ppgGni.non_aggregate_ids_debtor_iso3.filter((iso3) => exportSet.has(iso3));

  const report = {
    schema_version: "geomacro-world-bank-ids-sovereign-fiscal-coverage-1.2",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    query_year_range: `${QUERY_START_YEAR}:${QUERY_END_YEAR}`,
    max_age_days: MAX_AGE_DAYS,
    writes_performed: false,
    source: {
      provider: "World Bank",
      database: "International Debt Statistics",
      api_source_id: SOURCE_ID,
      license: "CC BY-4.0",
      official_api_guide: "https://worldbank.github.io/debt-data/api-guide/ids-api-guide-python-1.html",
      primary_indicator_page: "https://data.worldbank.org/indicator/DT.TDS.DPPG.GN.ZS",
      secondary_indicator_page: "https://data.worldbank.org/indicator/DT.TDS.DPPG.XP.ZS",
      comparator_indicator_page: "https://data.worldbank.org/indicator/DT.DOD.DECT.GN.ZS",
      rights_review_status: "EXACT_PRIMARY_INDICATOR_CC_BY_4_0_VERIFIED_CANDIDATE",
    },
    source_population: {
      ids_debtor_location_count: idsDebtors.iso3.length,
      world_bank_non_aggregate_country_count: worldBankCountries.iso3.length,
      non_aggregate_ids_debtor_count: eligibleCountrySet.size,
      ids_debtor_query_url: idsDebtors.url,
      ids_debtor_response_sha256: idsDebtors.response_sha256,
      world_bank_country_query_url: worldBankCountries.url,
      world_bank_country_response_sha256: worldBankCountries.response_sha256,
    },
    methodology_boundary: {
      discovery_only: true,
      primary_metric: "public_and_publicly_guaranteed_debt_service_pct_gni",
      secondary_metric: "public_and_publicly_guaranteed_debt_service_pct_exports_goods_services_primary_income",
      comparator_metric: "total_external_debt_stocks_pct_gni",
      primary_and_secondary_are_public_or_publicly_guaranteed_external_debt_service_burden_metrics: true,
      these_metrics_are_not_total_government_debt_stock: true,
      comparator_contains_private_debt_and_cannot_be_sovereign_fiscal_primary: true,
      direct_pooling_across_ppg_gni_and_ppg_exports_raw_values_allowed: false,
      direct_pooling_with_wdi_central_government_debt_allowed: false,
      direct_pooling_with_eurostat_general_government_debt_allowed: false,
      direct_pooling_with_qpsd_general_government_debt_allowed: false,
      source_specific_peer_universe_required: true,
      fixed_peer_minimum_unchanged: true,
      freshness_thresholds_unchanged: true,
      direct_production_fallback_allowed: false,
    },
    coverage_summary: {
      ppg_debt_service_pct_gni_country_count: ppgGni.non_aggregate_ids_debtor_count,
      ppg_debt_service_pct_exports_country_count: ppgExports.non_aggregate_ids_debtor_count,
      either_ppg_debt_service_metric_country_count: fiscalUnion.length,
      both_ppg_debt_service_metrics_country_count: fiscalIntersection.length,
      primary_ppg_gni_peer_minimum_met: ppgGni.non_aggregate_ids_debtor_count >= 20,
      secondary_ppg_exports_peer_minimum_met: ppgExports.non_aggregate_ids_debtor_count >= 20,
      target_100_country_path_plausible_from_primary_alone: ppgGni.non_aggregate_ids_debtor_count >= 100,
      target_100_country_path_plausible_from_either_source_specific_metric: fiscalUnion.length >= 100,
      current_production_accepted_country_count_assumed: 26,
      production_supported_country_count_added: 0,
    },
    candidate_country_sets: {
      primary_ppg_gni_iso3: ppgGni.non_aggregate_ids_debtor_iso3,
      secondary_ppg_exports_iso3: ppgExports.non_aggregate_ids_debtor_iso3,
      either_ppg_metric_iso3: fiscalUnion,
      both_ppg_metrics_iso3: fiscalIntersection,
      primary_only_iso3: ppgGni.non_aggregate_ids_debtor_iso3.filter((iso3) => !exportSet.has(iso3)),
      secondary_only_iso3: ppgExports.non_aggregate_ids_debtor_iso3.filter((iso3) => !gniSet.has(iso3)),
    },
    activation_boundary: {
      production_activation_allowed: false,
      scoring_changed: false,
      country_payability_changed: false,
      source_registry_changed: false,
      required_before_activation: [
        "Map exact IDS rows to the authoritative Geomacro sovereign registry",
        "Build deterministic source-specific PPG debt-service observation adapters",
        "Define a versioned sovereign-fiscal stress methodology that never mixes unlike raw metrics",
        "Run shadow normalization with >=20 peers per exact metric and unchanged confidence/freshness gates",
        "Persist exact source provenance, retrieval hashes and CC BY 4.0 attribution",
        "Measure overlap with currently accepted countries and other source-specific fiscal methods",
        "Run the full production global Risk Gate census before making any additional country payable",
      ],
    },
    series: results,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ generated_at: report.generated_at, source_population: report.source_population, coverage_summary: report.coverage_summary, activation_boundary: report.activation_boundary }, null, 2));
  console.log("PASS: WORLD BANK IDS SOVEREIGN-FISCAL COVERAGE AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
