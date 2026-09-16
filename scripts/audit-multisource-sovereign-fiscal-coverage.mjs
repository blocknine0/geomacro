import fs from "node:fs";
import { createHash } from "node:crypto";

const OUTPUT = process.env.MULTISOURCE_FISCAL_COVERAGE_OUTPUT ?? "multisource-sovereign-fiscal-coverage.json";
const AS_OF = new Date(process.env.MULTISOURCE_FISCAL_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.MULTISOURCE_FISCAL_MAX_AGE_DAYS ?? 800);
const WB_API = "https://api.worldbank.org/v2";

const INDICATORS = Object.freeze([
  { id: "GC.DOD.TOTL.GD.ZS", key: "central_government_debt_pct_gdp", family: "debt_stock", label: "Central government debt, total (% of GDP)" },
  { id: "GC.BAL.CASH.GD.ZS", key: "cash_balance_pct_gdp", family: "fiscal_flow", label: "Cash surplus/deficit (% of GDP)" },
  { id: "GC.REV.XGRT.GD.ZS", key: "revenue_ex_grants_pct_gdp", family: "fiscal_capacity", label: "Revenue, excluding grants (% of GDP)" },
  { id: "GC.XPN.TOTL.GD.ZS", key: "expense_pct_gdp", family: "fiscal_capacity", label: "Expense (% of GDP)" },
  { id: "DT.DOD.DECT.GN.ZS", key: "external_debt_stocks_pct_gni", family: "external_debt", label: "External debt stocks (% of GNI)" },
  { id: "DT.TDS.DECT.EX.ZS", key: "total_debt_service_pct_exports", family: "debt_service", label: "Total debt service (% of exports of goods, services and primary income)" },
]);

const REGIONAL_CANDIDATES = Object.freeze([
  {
    source_id: "idb_lac_standardized_public_debt_2024",
    provider: "Inter-American Development Bank",
    geography: "Latin America and Caribbean",
    documented_country_count: 26,
    dataset: "Latin America and the Caribbean Standardized Public Debt Database: Data as of December 2024",
    license: "CC BY 4.0",
    metadata_url: "https://data.iadb.org/dataset/latin-america-and-the-caribbean-standardized-public-debt-database-data-as-of-december-2024",
    production_status: "CANDIDATE_NOT_ACTIVATED",
    concept_boundary: "standardized public debt supplied by participating debt management offices; exact field-level concept mapping required before scoring",
  },
  {
    source_id: "adb_basic_statistics_2026",
    provider: "Asian Development Bank",
    geography: "Asia and Pacific",
    documented_economy_count: 47,
    dataset: "Basic Statistics 2026, Asia and the Pacific",
    license: "CC BY 3.0 IGO unless otherwise indicated",
    metadata_url: "https://data.adb.org/dataset/basic-statistics-asia-and-pacific",
    production_status: "CANDIDATE_NOT_ACTIVATED",
    concept_boundary: "includes fiscal balance and external debt; sovereign-only mapping and exact indicator definitions required before scoring",
  },
  {
    source_id: "eurostat_gov_10q_ggdebt",
    provider: "Eurostat",
    geography: "EU plus Iceland and Norway",
    documented_country_count: 29,
    dataset: "Quarterly government debt (gov_10q_ggdebt)",
    license: "European Commission reuse policy subject to dataset/item exceptions",
    metadata_url: "https://ec.europa.eu/eurostat/cache/metadata/en/gov_10q_ggdebt_esms.htm",
    production_status: "EXISTING_REGIONAL_CANDIDATE",
    concept_boundary: "general-government Maastricht debt; do not mix raw values with central-government concepts",
  },
]);

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function requestText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json,text/plain,*/*",
          "user-agent": "Geomacro-Multisource-Fiscal-Coverage-Audit/1.0 (+https://geomacro.live)",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return { text, sha256: sha256(text), status: response.status, content_type: response.headers.get("content-type") };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error("request failed");
}

async function requestJson(url) {
  const response = await requestText(url);
  return { ...response, parsed: JSON.parse(response.text) };
}

async function fetchWorldBankCountries() {
  const url = `${WB_API}/country?format=json&per_page=500`;
  const { parsed, sha256: responseSha256 } = await requestJson(url);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) throw new Error("World Bank country metadata response shape invalid");
  const rows = parsed[1]
    .map((row) => ({
      iso3: String(row?.id ?? "").trim().toUpperCase(),
      name: String(row?.name ?? "").trim(),
      region_id: String(row?.region?.id ?? "").trim(),
    }))
    .filter((row) => /^[A-Z]{3}$/.test(row.iso3) && row.region_id && row.region_id !== "NA");
  return { rows, response_sha256: responseSha256, url };
}

function observationDate(year) {
  if (!/^\d{4}$/.test(String(year))) return null;
  return new Date(Date.UTC(Number(year), 11, 31, 23, 59, 59, 999));
}

function ageDays(observedAt) {
  return Math.max(0, (AS_OF.getTime() - observedAt.getTime()) / 86_400_000);
}

function unavailableIndicator(indicator, url, reason, responseSha256 = null) {
  return {
    indicator_id: indicator.id,
    key: indicator.key,
    family: indicator.family,
    label: indicator.label,
    query_url: url,
    response_sha256: responseSha256,
    available_from_live_api: false,
    unavailable_reason: reason,
    latest_non_null_country_count: 0,
    fresh_country_count: 0,
    fresh_iso3: [],
    fresh_rows: [],
  };
}

async function fetchIndicator(indicator, countrySet) {
  const startYear = Math.max(1960, AS_OF.getUTCFullYear() - 6);
  const endYear = AS_OF.getUTCFullYear();
  const params = new URLSearchParams({ format: "json", per_page: "20000", date: `${startYear}:${endYear}` });
  const url = `${WB_API}/country/all/indicator/${indicator.id}?${params.toString()}`;

  let response;
  try {
    response = await requestJson(url);
  } catch (error) {
    return unavailableIndicator(indicator, url, error instanceof Error ? error.message : String(error));
  }

  const { parsed, sha256: responseSha256 } = response;
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) {
    const apiMessage = Array.isArray(parsed?.message)
      ? parsed.message.map((item) => String(item?.value ?? item?.key ?? "")).filter(Boolean).join(" | ")
      : "invalid response shape";
    return unavailableIndicator(indicator, url, apiMessage || "invalid response shape", responseSha256);
  }

  const latest = new Map();
  for (const row of parsed[1]) {
    const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
    if (!countrySet.has(iso3)) continue;
    const value = row?.value == null ? null : Number(row.value);
    const observedAt = observationDate(row?.date);
    if (!Number.isFinite(value) || !observedAt || observedAt > AS_OF) continue;
    const current = latest.get(iso3);
    if (!current || observedAt > current.observed_at_date) {
      latest.set(iso3, {
        iso3,
        value,
        observed_at: observedAt.toISOString(),
        observed_at_date: observedAt,
        period: String(row.date),
      });
    }
  }

  const fresh = [...latest.values()]
    .filter((row) => ageDays(row.observed_at_date) <= MAX_AGE_DAYS)
    .map(({ observed_at_date, ...row }) => row)
    .sort((a, b) => a.iso3.localeCompare(b.iso3));

  return {
    indicator_id: indicator.id,
    key: indicator.key,
    family: indicator.family,
    label: indicator.label,
    query_url: url,
    response_sha256: responseSha256,
    available_from_live_api: true,
    unavailable_reason: null,
    latest_non_null_country_count: latest.size,
    fresh_country_count: fresh.length,
    fresh_iso3: fresh.map((row) => row.iso3),
    fresh_rows: fresh,
  };
}

async function probeRegionalCandidate(candidate) {
  try {
    const result = await requestText(candidate.metadata_url);
    return {
      source_id: candidate.source_id,
      reachable: true,
      http_status: result.status,
      response_sha256: result.sha256,
      content_type: result.content_type,
    };
  } catch (error) {
    return {
      source_id: candidate.source_id,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("MULTISOURCE_FISCAL_AS_OF must be a valid timestamp");
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) throw new Error("MULTISOURCE_FISCAL_MAX_AGE_DAYS must be positive");

  const countries = await fetchWorldBankCountries();
  const countrySet = new Set(countries.rows.map((row) => row.iso3));
  const indicatorResults = [];
  for (const indicator of INDICATORS) indicatorResults.push(await fetchIndicator(indicator, countrySet));

  const availability = new Map();
  for (const country of countries.rows) availability.set(country.iso3, { iso3: country.iso3, name: country.name, metrics: [], families: new Set() });
  for (const result of indicatorResults) {
    for (const row of result.fresh_rows) {
      const country = availability.get(row.iso3);
      if (!country) continue;
      country.metrics.push(result.key);
      country.families.add(result.family);
    }
  }

  const perCountry = [...availability.values()].map((row) => {
    const families = [...row.families].sort();
    const metrics = [...row.metrics].sort();
    const hasDebtSignal = families.some((family) => ["debt_stock", "external_debt", "debt_service"].includes(family));
    const hasFiscalFlow = families.some((family) => ["fiscal_flow", "fiscal_capacity"].includes(family));
    return {
      iso3: row.iso3,
      name: row.name,
      fresh_metric_count: metrics.length,
      fresh_family_count: families.length,
      metrics,
      families,
      candidate_two_signal_coverage: metrics.length >= 2,
      candidate_fiscal_plus_debt_coverage: hasDebtSignal && hasFiscalFlow,
    };
  });

  const regionalProbes = [];
  for (const candidate of REGIONAL_CANDIDATES) regionalProbes.push(await probeRegionalCandidate(candidate));

  const report = {
    schema_version: "geomacro-multisource-sovereign-fiscal-coverage-1.1",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    max_age_days: MAX_AGE_DAYS,
    writes_performed: false,
    production_activation_allowed: false,
    scoring_changed: false,
    country_payability_changed: false,
    current_production_baseline_accepted_countries: 26,
    target_accepted_countries: 100,
    source_contract: {
      world_bank_default_dataset_terms: "CC BY 4.0 unless specifically labelled otherwise; exact indicator provenance and third-party exceptions remain binding",
      raw_cross_source_value_pooling_allowed: false,
      cross_concept_peer_pooling_allowed: false,
      missing_is_zero_risk: false,
      unavailable_indicators_fail_closed_without_aborting_discovery: true,
      regional_candidates_are_not_automatically_commercially_activated: true,
    },
    world_bank_country_metadata: {
      non_aggregate_country_count: countries.rows.length,
      response_sha256: countries.response_sha256,
      query_url: countries.url,
    },
    world_bank_indicator_coverage: indicatorResults.map(({ fresh_rows, ...result }) => result),
    candidate_coverage_summary: {
      live_indicator_count: indicatorResults.filter((result) => result.available_from_live_api).length,
      unavailable_indicator_count: indicatorResults.filter((result) => !result.available_from_live_api).length,
      countries_with_any_fresh_signal: perCountry.filter((row) => row.fresh_metric_count >= 1).length,
      countries_with_two_or_more_fresh_signals: perCountry.filter((row) => row.candidate_two_signal_coverage).length,
      countries_with_fiscal_flow_plus_debt_signal: perCountry.filter((row) => row.candidate_fiscal_plus_debt_coverage).length,
      countries_with_three_or_more_fresh_signals: perCountry.filter((row) => row.fresh_metric_count >= 3).length,
      target_100_plausible_from_world_bank_multimetric_layer: perCountry.filter((row) => row.candidate_two_signal_coverage).length >= 100,
      production_supported_country_count_added: 0,
    },
    regional_source_candidates: REGIONAL_CANDIDATES,
    regional_metadata_probes: regionalProbes,
    countries: perCountry,
    next_required_proof: [
      "Map candidate observations to the authoritative Geomacro sovereign registry.",
      "Pin exact indicator/source rights and third-party provenance at field level.",
      "Define a versioned sovereign-fiscal composite that never mixes incompatible central-, general-, public-sector or external-debt concepts into one raw peer universe.",
      "Run shadow scoring with unchanged confidence and minimum-peer gates.",
      "Ingest only promoted source contracts and rerun the production global Risk Gate census.",
      "Publish only the measured accepted-country set; unavailable countries remain non-payable.",
    ],
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ generated_at: report.generated_at, candidate_coverage_summary: report.candidate_coverage_summary, regional_metadata_probes: report.regional_metadata_probes }, null, 2));
  console.log(`MULTISOURCE_FISCAL_COVERAGE_OUTPUT=${OUTPUT}`);
  console.log("PASS: MULTISOURCE SOVEREIGN FISCAL COVERAGE AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
