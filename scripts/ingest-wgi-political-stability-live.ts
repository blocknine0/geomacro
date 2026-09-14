import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import {
  buildWgiPoliticalStabilityBundle,
  WGI_POLITICAL_STABILITY_INDICATORS,
  type WgiRawObservation,
} from "../src/lib/wgi-political-stability-contract";
import { mapWgiPoliticalStabilityToObservationInput } from "../src/lib/wgi-political-stability-observation-mapper";
import {
  buildObservation,
  createDb,
  loadCountryRegistry,
  sha256,
  upsertObservations,
} from "./lib-live-source-utils.mjs";

const API_BASE = "https://api.worldbank.org/v2";
const SOURCE_ID = "world_bank_wgi_political_stability";
const SOURCE_API_ID = "3";
const WRITE = process.argv.includes("--write");
const currentYear = new Date().getUTCFullYear();
const MIN_YEAR = Number(process.env.WGI_MIN_YEAR ?? String(currentYear - 3));
const MAX_YEAR = Number(process.env.WGI_MAX_YEAR ?? String(currentYear));

// Source-coverage exceptions are explicit, tiny and reviewable. A country on
// this list remains fail-closed for political_governance until an independently
// governed source/methodology is promoted. Never silently drop a new gap.
const EXPECTED_WGI_SOURCE_GAPS = new Set(["VAT"]);

if (!Number.isInteger(MIN_YEAR) || !Number.isInteger(MAX_YEAR) || MIN_YEAR > MAX_YEAR) {
  throw new Error("Invalid WGI_MIN_YEAR/WGI_MAX_YEAR range");
}

const db = createDb();
const registry = await loadCountryRegistry(db);
const sovereignRegistry = registry.rows
  .filter((row) => classifyGlobalEntity(String(row.iso3)) === "SOVEREIGN")
  .map((row) => String(row.iso3).toUpperCase())
  .sort();
const sovereignSet = new Set(sovereignRegistry);

async function fetchIndicator(indicator: string): Promise<WgiRawObservation[]> {
  const url = new URL(`${API_BASE}/country/all/indicator/${indicator}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("source", SOURCE_API_ID);
  url.searchParams.set("date", `${MIN_YEAR}:${MAX_YEAR}`);
  url.searchParams.set("per_page", "20000");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro/1.0 (+https://geomacro.live)",
    },
  });
  if (!response.ok) throw new Error(`World Bank HTTP ${response.status} for ${indicator}`);

  const data = await response.json();
  if (!Array.isArray(data?.[1])) {
    throw new Error(`Invalid World Bank response for ${indicator}`);
  }
  return data[1] as WgiRawObservation[];
}

const byCountryYear = new Map<string, WgiRawObservation[]>();
let rowsDownloaded = 0;

for (const indicator of Object.values(WGI_POLITICAL_STABILITY_INDICATORS)) {
  const rows = await fetchIndicator(indicator);
  rowsDownloaded += rows.length;

  for (const row of rows) {
    const iso3 = String(row.countryiso3code ?? "").trim().toUpperCase();
    const year = Number(row.date);
    if (!sovereignSet.has(iso3) || !Number.isInteger(year) || row.value == null) continue;
    const key = `${iso3}:${year}`;
    const existing = byCountryYear.get(key) ?? [];
    existing.push(row);
    byCountryYear.set(key, existing);
  }
}

const latestByCountry = new Map<string, { year: number; rows: WgiRawObservation[] }>();
const rejected: Array<{ iso3: string; year: number; reason: string }> = [];

for (const [key, rows] of byCountryYear) {
  const [iso3, yearRaw] = key.split(":");
  const year = Number(yearRaw);
  const result = buildWgiPoliticalStabilityBundle(rows);
  if (result.status !== "ACCEPTED") {
    rejected.push({ iso3, year, reason: result.reason });
    continue;
  }
  const previous = latestByCountry.get(iso3);
  if (!previous || year > previous.year) latestByCountry.set(iso3, { year, rows });
}

const missingCountries = sovereignRegistry.filter((iso3) => !latestByCountry.has(iso3));
const unexpectedMissingCountries = missingCountries.filter(
  (iso3) => !EXPECTED_WGI_SOURCE_GAPS.has(iso3),
);
const staleExpectedGaps = [...EXPECTED_WGI_SOURCE_GAPS].filter(
  (iso3) => sovereignSet.has(iso3) && latestByCountry.has(iso3),
);

if (unexpectedMissingCountries.length > 0) {
  throw new Error(
    `WGI global write blocked: unexpected sovereign coverage gaps: ${unexpectedMissingCountries.join(",")}`,
  );
}
if (staleExpectedGaps.length > 0) {
  throw new Error(
    `WGI source-gap registry is stale because data is now available for: ${staleExpectedGaps.join(",")}. Remove the exception before writing.`,
  );
}

const coveredSovereigns = sovereignRegistry.filter((iso3) => latestByCountry.has(iso3));
const observations = [];
for (const iso3 of coveredSovereigns) {
  const selected = latestByCountry.get(iso3)!;
  const result = buildWgiPoliticalStabilityBundle(selected.rows);
  if (result.status !== "ACCEPTED") {
    throw new Error(`${iso3}: selected WGI bundle unexpectedly rejected: ${result.reason}`);
  }

  observations.push(
    buildObservation(
      mapWgiPoliticalStabilityToObservationInput({
        bundle: result.bundle,
        raw_rows: selected.rows,
        source_url: "https://api.worldbank.org/v2/source/3",
      }),
    ),
  );
}

if (observations.length + missingCountries.length !== sovereignRegistry.length) {
  throw new Error(
    `WGI sovereign reconciliation failed: ${observations.length} covered + ${missingCountries.length} explicit gaps != ${sovereignRegistry.length}`,
  );
}

const yearDistribution = Object.fromEntries(
  [...new Set([...latestByCountry.values()].map((value) => value.year))]
    .sort((a, b) => b - a)
    .map((year) => [
      String(year),
      [...latestByCountry.values()].filter((value) => value.year === year).length,
    ]),
);
const observedTimes = observations
  .map((row) => new Date(row.observed_at).getTime())
  .filter(Number.isFinite);
if (!observedTimes.length) throw new Error("WGI produced zero governed sovereign observations");
const coverageStart = new Date(Math.min(...observedTimes)).toISOString();
const coverageEnd = new Date(Math.max(...observedTimes)).toISOString();
const latestYear = Math.max(...[...latestByCountry.values()].map((value) => value.year));
const retrievedAt = new Date().toISOString();
const manifestCore = {
  source_id: SOURCE_ID,
  release_id: `wgi-2025-revision:${latestYear}`,
  dataset_version: "WGI_2025_REVISION",
  retrieved_at: retrievedAt,
  coverage_start: coverageStart,
  coverage_end: coverageEnd,
  rows_downloaded: rowsDownloaded,
  rows_normalized: observations.length,
  verified_rows: observations.length,
  partial_rows: 0,
  rejected_rows: rejected.length,
  unmapped_rows: 0,
  write_completed: WRITE,
  metadata: {
    source_api_id: SOURCE_API_ID,
    requested_year_range: [MIN_YEAR, MAX_YEAR],
    sovereign_denominator: sovereignRegistry.length,
    complete_sovereign_bundles: observations.length,
    explicit_source_gaps: missingCountries,
    expected_source_gap_registry: [...EXPECTED_WGI_SOURCE_GAPS].sort(),
    latest_complete_year_distribution: yearDistribution,
    raw_redistribution: false,
    methodology_status: "RISK_GATE_V2_POLITICAL_GOVERNANCE_INPUT",
    gap_policy: "Explicit source gaps remain fail-closed; any new unregistered gap blocks the write.",
  },
};
const manifest = { ...manifestCore, manifest_hash: sha256(manifestCore) };

let attempted = 0;
if (WRITE) {
  attempted = await upsertObservations(db, observations);
  const result = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" });
  if (result.error) throw result.error;
}

console.log(JSON.stringify({
  source_id: SOURCE_ID,
  mode: WRITE ? "WRITE" : "DRY_RUN",
  sovereign_denominator: sovereignRegistry.length,
  complete_sovereign_bundles: observations.length,
  explicit_source_gaps: missingCountries,
  rejected_country_year_bundles: rejected.length,
  latest_complete_year_distribution: yearDistribution,
  observations_attempted: attempted,
  manifest: {
    release_id: manifest.release_id,
    coverage_start: manifest.coverage_start,
    coverage_end: manifest.coverage_end,
    manifest_hash: manifest.manifest_hash,
    write_completed: WRITE,
  },
}, null, 2));

console.log(
  WRITE
    ? "PASS: WGI GLOBAL GOVERNANCE INGESTION + EXPLICIT GAP MANIFEST WRITTEN"
    : "PASS: WGI GLOBAL GOVERNANCE DRY RUN CLEAN WITH EXPLICIT SOURCE GAPS; DATABASE UNCHANGED",
);
