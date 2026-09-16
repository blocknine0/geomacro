import fs from "node:fs";
import { createHash } from "node:crypto";

const SOURCE_ID = "2";
const SOURCE_NAME = "World Development Indicators";
const OUTPUT = process.env.WDI_SOURCE2_FISCAL_AUDIT_OUTPUT ?? "wdi-source2-fiscal-expansion.json";
const AS_OF = new Date(process.env.WDI_SOURCE2_FISCAL_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WDI_SOURCE2_FISCAL_MAX_AGE_DAYS ?? 800);
const API = "https://api.worldbank.org/v2";
const SERIES = Object.freeze([
  { id: "GC.DOD.TOTL.GD.ZS", metric: "central_government_debt_pct_gdp", family: "central_government_debt" },
  { id: "GC.REV.XGRT.GD.ZS", metric: "revenue_ex_grants_pct_gdp", family: "fiscal_capacity" },
  { id: "DT.DOD.DECT.GN.ZS", metric: "external_debt_stocks_pct_gni", family: "external_debt_pressure" },
  { id: "DT.TDS.DECT.EX.ZS", metric: "total_debt_service_pct_exports", family: "debt_service_pressure" },
]);

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Geomacro-WDI-Source2-Fiscal-Audit/1.0 (+https://geomacro.live)" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const text = await response.text();
  return { parsed: JSON.parse(text), response_sha256: sha256(text), url };
}

function observedAt(year) {
  if (!/^\d{4}$/.test(String(year))) return null;
  return new Date(Date.UTC(Number(year), 11, 31, 23, 59, 59, 999));
}

function ageDays(date) {
  return Math.max(0, (AS_OF.getTime() - date.getTime()) / 86_400_000);
}

async function fetchSourceMetadata() {
  const result = await fetchJson(`${API}/source/${SOURCE_ID}?format=json`);
  if (!Array.isArray(result.parsed) || !Array.isArray(result.parsed[1]) || !result.parsed[1][0]) throw new Error("WDI source metadata response invalid");
  const source = result.parsed[1][0];
  if (String(source.id) !== SOURCE_ID || String(source.name).trim() !== SOURCE_NAME) throw new Error(`Unexpected World Bank source ${source.id}:${source.name}`);
  return { id: String(source.id), name: String(source.name).trim(), lastupdated: source.lastupdated ?? null, response_sha256: result.response_sha256, url: result.url };
}

async function fetchCountries() {
  const result = await fetchJson(`${API}/country?format=json&source=${SOURCE_ID}&per_page=500`);
  if (!Array.isArray(result.parsed) || !Array.isArray(result.parsed[1])) throw new Error("WDI source 2 country metadata invalid");
  const rows = result.parsed[1]
    .map((row) => ({ iso3: String(row?.id ?? "").trim().toUpperCase(), region_id: String(row?.region?.id ?? "").trim() }))
    .filter((row) => /^[A-Z]{3}$/.test(row.iso3) && row.region_id && row.region_id !== "NA");
  return { countries: rows.map((row) => row.iso3).sort(), response_sha256: result.response_sha256 };
}

async function fetchSeries(series, countrySet) {
  const startYear = Math.max(1960, AS_OF.getUTCFullYear() - 6);
  const endYear = AS_OF.getUTCFullYear();
  const params = new URLSearchParams({ format: "json", source: SOURCE_ID, per_page: "20000", date: `${startYear}:${endYear}` });
  const url = `${API}/country/all/indicator/${series.id}?${params.toString()}`;
  const result = await fetchJson(url);
  if (!Array.isArray(result.parsed) || !Array.isArray(result.parsed[1])) {
    return { ...series, available: false, query_url: url, response_sha256: result.response_sha256, fresh_country_count: 0, fresh_iso3: [], error: "invalid response shape" };
  }
  const latest = new Map();
  for (const row of result.parsed[1]) {
    const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
    if (!countrySet.has(iso3)) continue;
    const value = row?.value == null ? null : Number(row.value);
    const date = observedAt(row?.date);
    if (!Number.isFinite(value) || !date || date > AS_OF) continue;
    const current = latest.get(iso3);
    if (!current || date > current.date) latest.set(iso3, { iso3, period: String(row.date), date, value });
  }
  const fresh = [...latest.values()].filter((row) => ageDays(row.date) <= MAX_AGE_DAYS).sort((a, b) => a.iso3.localeCompare(b.iso3));
  return {
    ...series,
    available: true,
    query_url: url,
    response_sha256: result.response_sha256,
    latest_non_null_country_count: latest.size,
    fresh_country_count: fresh.length,
    fresh_iso3: fresh.map((row) => row.iso3),
    latest_period_distribution: fresh.reduce((acc, row) => { acc[row.period] = (acc[row.period] ?? 0) + 1; return acc; }, {}),
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid as-of");
  const source = await fetchSourceMetadata();
  const countries = await fetchCountries();
  const countrySet = new Set(countries.countries);
  const results = [];
  for (const series of SERIES) results.push(await fetchSeries(series, countrySet));

  const coverage = new Map(countries.countries.map((iso3) => [iso3, new Set()]));
  for (const result of results) for (const iso3 of result.fresh_iso3) coverage.get(iso3)?.add(result.family);
  const perCountry = [...coverage.entries()].map(([iso3, families]) => ({ iso3, families: [...families].sort() }));
  const hasDebtPressure = (families) => families.includes("central_government_debt") || families.includes("external_debt_pressure") || families.includes("debt_service_pressure");
  const hasTwoDebtSignals = (families) => ["central_government_debt", "external_debt_pressure", "debt_service_pressure"].filter((family) => families.includes(family)).length >= 2;

  const report = {
    schema_version: "geomacro-wdi-source2-fiscal-expansion-audit-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    max_age_days: MAX_AGE_DAYS,
    writes_performed: false,
    source_activation_changed: false,
    scoring_changed: false,
    country_payability_changed: false,
    source,
    non_aggregate_source_country_count: countries.countries.length,
    series: results,
    coverage_summary: {
      countries_with_any_debt_pressure_signal: perCountry.filter((row) => hasDebtPressure(row.families)).length,
      countries_with_two_debt_pressure_signals: perCountry.filter((row) => hasTwoDebtSignals(row.families)).length,
      countries_with_fiscal_capacity_signal: perCountry.filter((row) => row.families.includes("fiscal_capacity")).length,
      countries_with_fiscal_capacity_and_any_debt_pressure: perCountry.filter((row) => row.families.includes("fiscal_capacity") && hasDebtPressure(row.families)).length,
      countries_with_fiscal_capacity_and_two_debt_pressure_signals: perCountry.filter((row) => row.families.includes("fiscal_capacity") && hasTwoDebtSignals(row.families)).length,
    },
    countries: perCountry,
    methodology_boundary: {
      exact_world_bank_source_pinned: true,
      source_id: SOURCE_ID,
      source_name: SOURCE_NAME,
      raw_cross_concept_pooling_allowed: false,
      external_debt_is_not_relabelled_as_central_government_debt: true,
      debt_service_is_not_relabelled_as_debt_stock: true,
      fiscal_capacity_is_separate_from_debt_pressure: true,
      production_sovereign_fiscal_module_changed: false,
    },
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ source: report.source, coverage_summary: report.coverage_summary, series: report.series.map((row) => ({ id: row.id, family: row.family, available: row.available, fresh_country_count: row.fresh_country_count })) }, null, 2));
  console.log(`WDI_SOURCE2_FISCAL_AUDIT_OUTPUT=${OUTPUT}`);
  console.log("PASS: WDI SOURCE 2 FISCAL EXPANSION AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exit(1); });
