import fs from "node:fs";
import { createHash } from "node:crypto";

const API = "https://api.worldbank.org/v2";
const SOURCE_ID = "3009";
const OUTPUT =
  process.env.WORLD_BANK_QPSD_COVERAGE_OUTPUT ??
  "world-bank-qpsd-sovereign-fiscal-coverage.json";
const AS_OF = new Date(process.env.WORLD_BANK_QPSD_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_QPSD_MAX_AGE_DAYS ?? 550);

const SERIES = Object.freeze([
  {
    id: "DP.DOD.DECT.CR.GG.Z1",
    concept: "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    expected_label:
      "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
    production_role:
      "PREFERRED_SOURCE_SPECIFIC_GENERAL_GOVERNMENT_FISCAL_CANDIDATE",
  },
  {
    id: "DP.DOD.DECT.CR.CG.Z1",
    concept: "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    expected_label:
      "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
    production_role:
      "SOURCE_SPECIFIC_CENTRAL_GOVERNMENT_COMPARATOR",
  },
]);

const sha256 = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent":
            "Geomacro-World-Bank-QPSD-Coverage-Audit/1.0 (+https://geomacro.live)",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const parsed = JSON.parse(text);
      return { parsed, response_sha256: sha256(text), url };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) throw lastError;
      await sleep(600 * 2 ** (attempt - 1));
    }
  }
  throw lastError ?? new Error("World Bank QPSD request failed");
}

function parseQuarterEnd(value) {
  const match = /^(\d{4})Q([1-4])$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59, 999));
}

function ageDays(older, newer) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 86_400_000);
}

function sorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function fetchWorldBankCountries() {
  const url = `${API}/country?format=json&per_page=500`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    throw new Error("World Bank country metadata response shape was invalid");
  }

  const rows = parsed[1]
    .map((row) => ({
      iso3: String(row?.id ?? "").trim().toUpperCase(),
      name: String(row?.name ?? "").trim(),
      region_id: String(row?.region?.id ?? "").trim(),
      region_name: String(row?.region?.value ?? "").trim(),
    }))
    .filter(
      (row) => /^[A-Z]{3}$/.test(row.iso3) && row.region_id && row.region_id !== "NA",
    );

  return {
    iso3: sorted(rows.map((row) => row.iso3)),
    rows,
    response_sha256,
    url,
  };
}

async function fetchSeries(series) {
  const params = new URLSearchParams({
    format: "json",
    source: SOURCE_ID,
    per_page: "20000",
    mrnev: "1",
    frequency: "Q",
  });
  const url = `${API}/country/all/indicator/${series.id}?${params.toString()}`;
  const { parsed, response_sha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    throw new Error(`World Bank QPSD ${series.id} response shape was invalid`);
  }

  const metadata = parsed[0] ?? {};
  const rows = parsed[1]
    .map((row) => {
      const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
      const period = String(row?.date ?? "").trim();
      const observedAt = parseQuarterEnd(period);
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
      `World Bank QPSD ${series.id} label mismatch: ${labels.join(" | ") || "none"}`,
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
  const fresh = latest.filter((row) => {
    const observedAt = new Date(row.observed_at);
    return observedAt <= AS_OF && ageDays(observedAt, AS_OF) <= MAX_AGE_DAYS;
  });

  return {
    series_id: series.id,
    concept: series.concept,
    production_role: series.production_role,
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
    fresh_or_aging_country_count: fresh.length,
    latest_non_null_iso3: latest.map((row) => row.iso3),
    fresh_or_aging_iso3: fresh.map((row) => row.iso3),
    latest_period_distribution: latest.reduce((acc, row) => {
      acc[row.period] = (acc[row.period] ?? 0) + 1;
      return acc;
    }, {}),
    fresh_or_aging_rows: fresh,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) {
    throw new Error("WORLD_BANK_QPSD_AS_OF must be a valid timestamp");
  }
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("WORLD_BANK_QPSD_MAX_AGE_DAYS must be positive");
  }

  const countryMetadata = await fetchWorldBankCountries();
  const countrySet = new Set(countryMetadata.iso3);
  const seriesResults = [];
  for (const series of SERIES) {
    const result = await fetchSeries(series);
    result.world_bank_country_intersection_iso3 = result.fresh_or_aging_iso3.filter(
      (iso3) => countrySet.has(iso3),
    );
    result.world_bank_country_intersection_count =
      result.world_bank_country_intersection_iso3.length;
    seriesResults.push(result);
  }

  const generalGovernment = seriesResults.find(
    (item) => item.concept === "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
  );
  const centralGovernment = seriesResults.find(
    (item) => item.concept === "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
  );
  if (!generalGovernment || !centralGovernment) {
    throw new Error("World Bank QPSD audit did not return both fiscal concepts");
  }

  const ggSet = new Set(generalGovernment.world_bank_country_intersection_iso3);
  const cgSet = new Set(centralGovernment.world_bank_country_intersection_iso3);

  const report = {
    schema_version: "geomacro-world-bank-qpsd-sovereign-fiscal-coverage-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    writes_performed: false,
    source: {
      provider: "World Bank",
      database: "Quarterly Public Sector Debt",
      api_source_id: SOURCE_ID,
      api_version: "v2",
      official_api_documentation:
        "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392",
      official_dataset_terms:
        "https://www.worldbank.org/ext/en/legal/terms-conditions/datasets",
      rights_review_status: "WORLD_BANK_OPEN_DATA_TERMS_REVIEWED_CANDIDATE",
      rights_note:
        "World Bank dataset terms default datasets to CC BY 4.0 unless a dataset is specifically labelled otherwise. Production activation still requires exact-dataset metadata and attribution review to remain recorded in Geomacro source governance.",
    },
    country_metadata: {
      query_url: countryMetadata.url,
      response_sha256: countryMetadata.response_sha256,
      non_aggregate_world_bank_country_count: countryMetadata.iso3.length,
    },
    methodology_boundary: {
      discovery_only: true,
      current_wdi_metric: "central_government_debt_pct_gdp",
      current_eurostat_metric: "general_government_gross_debt_pct_gdp",
      qpsd_general_government_metric: "DP.DOD.DECT.CR.GG.Z1",
      qpsd_central_government_metric: "DP.DOD.DECT.CR.CG.Z1",
      raw_cross_source_value_pooling_allowed: false,
      cross_concept_peer_pooling_allowed: false,
      direct_production_fallback_allowed: false,
      source_specific_peer_universe_required: true,
      fixed_peer_minimum_unchanged: true,
      freshness_thresholds_unchanged: true,
    },
    coverage_summary: {
      general_government_current_or_aging_country_count:
        generalGovernment.world_bank_country_intersection_count,
      central_government_current_or_aging_country_count:
        centralGovernment.world_bank_country_intersection_count,
      both_concepts_current_or_aging_count: sorted(
        generalGovernment.world_bank_country_intersection_iso3.filter((iso3) =>
          cgSet.has(iso3),
        ),
      ).length,
      general_government_only_count: sorted(
        generalGovernment.world_bank_country_intersection_iso3.filter(
          (iso3) => !cgSet.has(iso3),
        ),
      ).length,
      central_government_only_count: sorted(
        centralGovernment.world_bank_country_intersection_iso3.filter(
          (iso3) => !ggSet.has(iso3),
        ),
      ).length,
      target_100_country_path_plausible_from_qpsd_alone:
        Math.max(
          generalGovernment.world_bank_country_intersection_count,
          centralGovernment.world_bank_country_intersection_count,
        ) >= 100,
      production_supported_country_count_added: 0,
    },
    activation_boundary: {
      production_activation_allowed: false,
      source_registry_changed: false,
      scoring_changed: false,
      country_payability_changed: false,
      next_required_proof:
        "Map QPSD coverage against the authoritative Geomacro sovereign registry, verify exact dataset rights metadata, build a deterministic adapter, run source-specific shadow scoring with >=20 concept-consistent peers, then run a full production country census before any promotion.",
    },
    series: seriesResults,
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
  console.log("PASS: WORLD BANK QPSD FISCAL COVERAGE AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
