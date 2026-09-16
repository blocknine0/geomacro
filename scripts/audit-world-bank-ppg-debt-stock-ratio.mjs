import fs from "node:fs";
import { createHash } from "node:crypto";

const API = "https://api.worldbank.org/v2";
const SOURCE_ID = "2";
const OUTPUT = process.env.WORLD_BANK_PPG_RATIO_OUTPUT ?? "world-bank-ppg-debt-stock-ratio.json";
const AS_OF = new Date(process.env.WORLD_BANK_PPG_RATIO_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_PPG_RATIO_MAX_AGE_DAYS ?? 800);
const FIXED_PEER_MINIMUM = 20;

const PPG_STOCK = {
  id: "DT.DOD.DPPG.CD",
  label: "External debt stocks, public and publicly guaranteed (PPG) (DOD, current US$)",
  source_family: "International Debt Statistics",
};
const GNI = {
  id: "NY.GNP.MKTP.CD",
  label: "GNI (current US$)",
  source_family: "World Development Indicators",
};

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro-World-Bank-PPG-Debt-Ratio-Audit/1.0 (+https://geomacro.live)",
    },
  });
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

async function fetchCountries() {
  const { parsed } = await fetchJson(`${API}/country?format=json&source=${SOURCE_ID}&per_page=500`);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) throw new Error("World Bank country metadata response invalid");
  return new Set(
    parsed[1]
      .map((row) => ({
        iso3: String(row?.id ?? "").trim().toUpperCase(),
        region: String(row?.region?.id ?? "").trim(),
      }))
      .filter((row) => /^[A-Z]{3}$/.test(row.iso3) && row.region && row.region !== "NA")
      .map((row) => row.iso3),
  );
}

async function fetchIndicator(indicator, countrySet) {
  const startYear = Math.max(1960, AS_OF.getUTCFullYear() - 5);
  const endYear = AS_OF.getUTCFullYear();
  const params = new URLSearchParams({
    format: "json",
    source: SOURCE_ID,
    per_page: "20000",
    date: `${startYear}:${endYear}`,
  });
  const url = `${API}/country/all/indicator/${indicator.id}?${params.toString()}`;
  const result = await fetchJson(url);
  if (!Array.isArray(result.parsed) || !Array.isArray(result.parsed[1])) {
    throw new Error(`World Bank ${indicator.id} response invalid`);
  }
  const byCountryYear = new Map();
  const labels = new Set();
  for (const row of result.parsed[1]) {
    const iso3 = String(row?.countryiso3code ?? "").trim().toUpperCase();
    if (!countrySet.has(iso3)) continue;
    const year = String(row?.date ?? "").trim();
    const date = observedAt(year);
    const value = row?.value == null ? null : Number(row.value);
    const label = String(row?.indicator?.value ?? "").trim();
    if (label) labels.add(label);
    if (!date || date > AS_OF || !Number.isFinite(value)) continue;
    byCountryYear.set(`${iso3}:${year}`, { iso3, year, date, value });
  }
  if (labels.size !== 1 || !labels.has(indicator.label)) {
    throw new Error(`Unexpected ${indicator.id} label: ${[...labels].join(" | ") || "none"}`);
  }
  return {
    ...indicator,
    url,
    response_sha256: result.response_sha256,
    byCountryYear,
  };
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid WORLD_BANK_PPG_RATIO_AS_OF");
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) throw new Error("Invalid max age");

  const countries = await fetchCountries();
  const [ppg, gni] = await Promise.all([
    fetchIndicator(PPG_STOCK, countries),
    fetchIndicator(GNI, countries),
  ]);

  const latestByCountry = new Map();
  for (const [key, debtRow] of ppg.byCountryYear.entries()) {
    const gniRow = gni.byCountryYear.get(key);
    if (!gniRow || !Number.isFinite(gniRow.value) || gniRow.value <= 0 || debtRow.value < 0) continue;
    const ratio = (debtRow.value / gniRow.value) * 100;
    if (!Number.isFinite(ratio)) continue;
    const candidate = {
      iso3: debtRow.iso3,
      period: debtRow.year,
      observed_at: debtRow.date.toISOString(),
      age_days: ageDays(debtRow.date),
      ppg_external_debt_stock_usd: debtRow.value,
      gni_usd: gniRow.value,
      ppg_external_debt_stock_pct_gni: ratio,
    };
    const current = latestByCountry.get(candidate.iso3);
    if (!current || candidate.period > current.period) latestByCountry.set(candidate.iso3, candidate);
  }

  const latest = [...latestByCountry.values()].sort((a, b) => a.iso3.localeCompare(b.iso3));
  const fresh = latest.filter((row) => row.age_days <= MAX_AGE_DAYS);
  const report = {
    schema_version: "geomacro-world-bank-ppg-external-debt-stock-ratio-audit-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    max_age_days: MAX_AGE_DAYS,
    writes_performed: false,
    source_activation_changed: false,
    scoring_changed: false,
    country_payability_changed: false,
    source: {
      provider: "World Bank",
      source_id: SOURCE_ID,
      numerator: {
        indicator: PPG_STOCK.id,
        label: PPG_STOCK.label,
        source_family: PPG_STOCK.source_family,
        license: "CC BY-4.0",
        response_sha256: ppg.response_sha256,
        url: ppg.url,
      },
      denominator: {
        indicator: GNI.id,
        label: GNI.label,
        source_family: GNI.source_family,
        license: "CC BY-4.0",
        response_sha256: gni.response_sha256,
        url: gni.url,
      },
    },
    derived_metric: {
      id: "ppg_external_debt_stock_pct_gni",
      formula: "DT.DOD.DPPG.CD / NY.GNP.MKTP.CD * 100",
      semantic_boundary: "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
      raw_cross_concept_peer_pooling_allowed: false,
      same_country_same_year_join_required: true,
      fixed_peer_minimum: FIXED_PEER_MINIMUM,
    },
    coverage_summary: {
      latest_matched_country_count: latest.length,
      fresh_matched_country_count: fresh.length,
      fixed_peer_minimum_satisfied: fresh.length >= FIXED_PEER_MINIMUM,
      fresh_iso3: fresh.map((row) => row.iso3),
      period_distribution: fresh.reduce((acc, row) => {
        acc[row.period] = (acc[row.period] ?? 0) + 1;
        return acc;
      }, {}),
    },
    rows: fresh,
    activation_boundary: {
      production_activation_allowed: false,
      production_supported_country_count_added: 0,
      next_required_proof:
        "Map fresh derived coverage against the authoritative sovereign registry, build a versioned shadow sovereign-fiscal debt-pressure methodology, validate peer distributions and attribution hashes, then rerun the full production country census before any promotion.",
    },
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    derived_metric: report.derived_metric,
    coverage_summary: report.coverage_summary,
    activation_boundary: report.activation_boundary,
  }, null, 2));
  console.log("PASS: WORLD BANK PPG EXTERNAL DEBT STOCK RATIO AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
