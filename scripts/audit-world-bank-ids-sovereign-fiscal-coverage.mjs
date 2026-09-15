import fs from "node:fs";
import { createHash } from "node:crypto";

const API = "https://api.worldbank.org/v2";
const SOURCE_ID = "6";
const OUTPUT =
  process.env.WORLD_BANK_IDS_FISCAL_OUTPUT ??
  "world-bank-ids-sovereign-fiscal-coverage.json";
const AS_OF = new Date(process.env.WORLD_BANK_IDS_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_IDS_MAX_AGE_DAYS ?? 800);

const SERIES = Object.freeze([
  {
    id: "DT.TDS.DPPG.GN.ZS",
    concept: "PPG_EXTERNAL_DEBT_SERVICE_PCT_GNI",
    expected_label: "Public and publicly guaranteed debt service (% of GNI)",
    role: "PRIMARY_SOURCE_SPECIFIC_SOVEREIGN_EXTERNAL_DEBT_SERVICE_CANDIDATE",
  },
  {
    id: "DT.DOD.DECT.GN.ZS",
    concept: "TOTAL_EXTERNAL_DEBT_STOCKS_PCT_GNI",
    expected_label: "External debt stocks (% of GNI)",
    role: "EXTERNAL_VULNERABILITY_COMPARATOR_NOT_SOVEREIGN_FISCAL_ALONE",
  },
]);

const sha256 = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent":
            "Geomacro-World-Bank-IDS-Fiscal-Audit/1.0 (+https://geomacro.live)",
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
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), 11, 31, 23, 59, 59, 999));
}

function ageDays(older, newer) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 86_400_000);
}

function sorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function fetchCountries() {
  const url = `${API}/country?format=json&per_page=500`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    throw new Error("World Bank country metadata response shape was invalid");
  }
  const rows = parsed[1]
    .map((row) => ({
      iso3: String(row?.id ?? "").trim().toUpperCase(),
      region_id: String(row?.region?.id ?? "").trim(),
      name: String(row?.name ?? "").trim(),
    }))
    .filter(
      (row) => /^[A-Z]{3}$/.test(row.iso3) && row.region_id && row.region_id !== "NA",
    );
  return {
    rows,
    iso3: sorted(rows.map((row) => row.iso3)),
    response_sha256,
    url,
  };
}

async function fetchSeries(series) {
  const params = new URLSearchParams({
    format: "json",
    source: SOURCE_ID,
    per_page: "10000",
    mrnev: "1",
  });
  const url = `${API}/country/all/indicator/${series.id}?${params.toString()}`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    throw new Error(`World Bank IDS ${series.id} response shape was invalid`);
  }

  const metadata = parsed[0] ?? {};
  const rows = parsed[1]
    .map((row) => {
      const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
      const period = String(row?.date ?? "").trim();
      const observedAt = parseYearEnd(period);
      const value = row?.value == null ? null : Number(row.value);
      const label = String(row?.indicator?.value ?? "").trim();
      return {
        iso3,
        period,
        observed_at: observedAt?.toISOString() ?? null,
        value,
        label,
      };
    })
    .filter(
      (row) =>
        /^[A-Z]{3}$/.test(row.iso3) &&
        row.observed_at &&
        Number.isFinite(row.value),
    );

  const labels = sorted(rows.map((row) => row.label).filter(Boolean));
  if (!labels.includes(series.expected_label)) {
    throw new Error(
      `World Bank IDS ${series.id} label mismatch: ${labels.join(" | ") || "none"}`,
    );
  }

  const latestByCountry = new Map();
  for (const row of rows) {
    const current = latestByCountry.get(row.iso3);
    if (!current || Date.parse(row.observed_at) > Date.parse(current.observed_at)) {
      latestByCountry.set(row.iso3, row);
    }
  }
  const latest = [...latestByCountry.values()].sort((a, b) =>
    a.iso3.localeCompare(b.iso3),
  );
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
    latest_non_null_iso3: latest.map((row) => row.iso3),
    current_or_aging_iso3: current.map((row) => row.iso3),
    latest_period_distribution: latest.reduce((acc, row) => {
      acc[row.period] = (acc[row.period] ?? 0) + 1;
      return acc;
    }, {}),
    current_or_aging_rows: current,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) {
    throw new Error("WORLD_BANK_IDS_AS_OF must be a valid timestamp");
  }
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("WORLD_BANK_IDS_MAX_AGE_DAYS must be positive");
  }

  const countries = await fetchCountries();
  const countrySet = new Set(countries.iso3);
  const results = [];
  for (const series of SERIES) {
    const result = await fetchSeries(series);
    result.non_aggregate_country_iso3 = result.current_or_aging_iso3.filter((iso3) =>
      countrySet.has(iso3),
    );
    result.non_aggregate_country_count = result.non_aggregate_country_iso3.length;
    results.push(result);
  }

  const ppg = results.find(
    (item) => item.concept === "PPG_EXTERNAL_DEBT_SERVICE_PCT_GNI",
  );
  const totalExternal = results.find(
    (item) => item.concept === "TOTAL_EXTERNAL_DEBT_STOCKS_PCT_GNI",
  );
  if (!ppg || !totalExternal) {
    throw new Error("World Bank IDS audit did not return both exact series");
  }
  const externalSet = new Set(totalExternal.non_aggregate_country_iso3);

  const report = {
    schema_version: "geomacro-world-bank-ids-sovereign-fiscal-coverage-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    writes_performed: false,
    source: {
      provider: "World Bank",
      database: "International Debt Statistics",
      api_source_id: SOURCE_ID,
      license: "CC BY-4.0",
      primary_indicator_page:
        "https://data.worldbank.org/indicator/DT.TDS.DPPG.GN.ZS",
      comparator_indicator_page:
        "https://data.worldbank.org/indicator/DT.DOD.DECT.GN.ZS",
      rights_review_status: "EXACT_INDICATOR_PAGES_CC_BY_4_0_VERIFIED_CANDIDATE",
    },
    country_metadata: {
      query_url: countries.url,
      response_sha256: countries.response_sha256,
      non_aggregate_world_bank_country_count: countries.iso3.length,
    },
    methodology_boundary: {
      discovery_only: true,
      primary_metric: "public_and_publicly_guaranteed_debt_service_pct_gni",
      comparator_metric: "total_external_debt_stocks_pct_gni",
      comparator_contains_private_debt_and_cannot_be_sovereign_fiscal_primary: true,
      primary_is_external_public_and_publicly_guaranteed_debt_service_not_total_government_debt_stock: true,
      direct_pooling_with_wdi_central_government_debt_allowed: false,
      direct_pooling_with_eurostat_general_government_debt_allowed: false,
      direct_pooling_with_qpsd_general_government_debt_allowed: false,
      source_specific_peer_universe_required: true,
      fixed_peer_minimum_unchanged: true,
      freshness_thresholds_unchanged: true,
      direct_production_fallback_allowed: false,
    },
    coverage_summary: {
      ppg_debt_service_current_or_aging_country_count: ppg.non_aggregate_country_count,
      external_debt_stocks_current_or_aging_country_count:
        totalExternal.non_aggregate_country_count,
      both_series_current_or_aging_count: ppg.non_aggregate_country_iso3.filter(
        (iso3) => externalSet.has(iso3),
      ).length,
      ppg_peer_minimum_met: ppg.non_aggregate_country_count >= 20,
      target_100_country_path_plausible_from_ids_primary_alone:
        ppg.non_aggregate_country_count >= 100,
      production_supported_country_count_added: 0,
    },
    activation_boundary: {
      production_activation_allowed: false,
      scoring_changed: false,
      country_payability_changed: false,
      source_registry_changed: false,
      required_before_activation: [
        "Map exact IDS rows to the authoritative Geomacro sovereign registry",
        "Build a deterministic source-specific PPG debt-service adapter",
        "Define and review a separate sovereign-fiscal vulnerability method for PPG debt-service burden",
        "Run shadow scoring with a concept-consistent peer universe and unchanged confidence/freshness gates",
        "Persist exact source provenance and CC BY 4.0 attribution",
        "Run a full production global Risk Gate census before making any country payable",
      ],
    },
    series: results,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        generated_at: report.generated_at,
        coverage_summary: report.coverage_summary,
        activation_boundary: report.activation_boundary,
      },
      null,
      2,
    ),
  );
  console.log("PASS: WORLD BANK IDS SOVEREIGN-FISCAL COVERAGE AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
