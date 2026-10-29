import { createHash } from "node:crypto";
import { parseUsGSMcsCsv } from "../../global-intelligence/adapters/usgs-mcs-2026.mjs";
import { canonicalJson } from "./canonical-json";
import { country195ByIso3, COUNTRIES_195 } from "./canonical-country-registry-195";
import type { StructuralContext, StructuralObservation } from "./structural-context.server";
import type { SourceRightsRow } from "./commercial-source-eligibility.server";

// A scoped, published CC0 dataset, never blanket authorization for USGS news,
// pictures, another dataset, a new CSV revision, or the legacy usgs_mcs ID.
import { MCS_DIGEST_SOURCE_ID, MCS_DIGEST_CSV_SHA256 } from "./mcs-digest-source-identity";
export { MCS_DIGEST_SOURCE_ID, MCS_DIGEST_CSV_SHA256 } from "./mcs-digest-source-identity";
const DOI = "10.5066/p1wkq63t";
const ITEM = "696a75d5d4be0228872d3bf8";
const ITEMS = ["69837e43b66b01367d7ec7c7", ITEM];
const FILE = "MCS2026_Commodities_Data.csv";
const DATACITE = "https://api.datacite.org/dois/10.5066/P1WKQ63T";
// Canonical country name is the only admissible join to the exact pinned
// USGS source rows. No fuzzy country/territory inference, aliases or joins.
const mcsCanonicalCountryName = (iso3: string): string | null =>
  country195ByIso3(iso3)?.name.toUpperCase() ?? null;
const METHOD = "geomacro.mcs-annual-production-change.v1";
const MAX_BYTES = 16_000_000;
const TTL = 10 * 60_000;
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
type Release = { rows: Record<string, string>[]; rightsHash: string; checkedAt: string };
let cached: { until: number; value: Release } | null = null;
let pending: Promise<Release | null> | null = null;
let unavailableUntil = 0;
let lastFailure: string | null = null;
export function qualifiedMcsAcquisitionFailure() { return lastFailure; }

async function read(url: string, fetchImpl: typeof fetch, limit: number, fileRedirects = 0): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash ||
      !["api.datacite.org", "www.sciencebase.gov"].includes(u.hostname) &&
      !(limit === MAX_BYTES && /^[a-z0-9.-]+\.amazonaws\.com$/u.test(u.hostname)))
    throw Error("MCS_DIGEST_ORIGIN_REJECTED");
  // The official file service may redirect to its disclosed object-store asset.
  // Only this pinned-file read may follow a bounded HTTPS object-store redirect;
  // metadata redirects, HTTP denials and challenge pages remain rejected.
  const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(12_000),
    headers: { Accept: u.hostname === "api.datacite.org" ? "application/json" : "application/json,text/csv" } });
  if ([301, 302, 303, 307, 308].includes(res.status) && fileRedirects > 0) {
    const target = new URL(res.headers.get("location") ?? "", url);
    if (!/^[a-z0-9.-]+\.amazonaws\.com$/u.test(target.hostname)) throw Error("MCS_DIGEST_FILE_REDIRECT_REJECTED");
    await res.body?.cancel();
    return read(target.href, fetchImpl, limit, fileRedirects - 1);
  }
  if (res.status !== 200 || !res.body) throw Error("MCS_DIGEST_SOURCE_HTTP_" + res.status);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  try { while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > limit) throw Error("MCS_DIGEST_SOURCE_TOO_LARGE");
    parts.push(value);
  } } finally { await reader.cancel().catch(() => undefined); }
  if (!size) throw Error("MCS_DIGEST_SOURCE_EMPTY");
  const out = new Uint8Array(size); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

export function verifyMcsCc0Metadata(value: unknown): void {
  const a = (value as any)?.data?.attributes;
  if (a?.doi?.toLowerCase() !== DOI || a?.publicationYear !== 2026 ||
      a?.publisher !== "U.S. Geological Survey" || a?.state !== "findable" || a?.isActive !== true ||
      a?.url !== "https://www.sciencebase.gov/catalog/item/" + ITEM ||
      !Array.isArray(a.rightsList) || a.rightsList.length !== 1 ||
      a.rightsList[0]?.rightsIdentifier !== "cc0-1.0" ||
      a.rightsList[0]?.rightsIdentifierScheme !== "SPDX" ||
      a.rightsList[0]?.rightsUri !== "https://creativecommons.org/publicdomain/zero/1.0/legalcode")
    throw Error("MCS_DIGEST_DATASET_CC0_NOT_VERIFIED");
}

async function acquire(fetchImpl: typeof fetch, now: Date): Promise<Release> {
  const rights = await read(DATACITE, fetchImpl, 100_000);
  verifyMcsCc0Metadata(JSON.parse(new TextDecoder().decode(rights)));
  const failures: string[] = [];
  for (const item of ITEMS) {
    try {
      const metadata = JSON.parse(new TextDecoder().decode(await read(
        "https://www.sciencebase.gov/catalog/item/" + item + "?format=json", fetchImpl, 1_000_000)));
      if (metadata?.id !== item) throw Error("MCS_DIGEST_ITEM_MISMATCH");
      const files = metadata.files?.filter((f: any) => f.name === FILE);
      if (!Array.isArray(files) || files.length !== 1) throw Error("MCS_DIGEST_FILE_NOT_UNIQUE");
      const url = files[0].url ?? files[0].downloadUri;
      if (typeof url !== "string" || !url.startsWith("https://www.sciencebase.gov/catalog/file/get/" + item))
        throw Error("MCS_DIGEST_FILE_ORIGIN_REJECTED");
      const bytes = await read(url, fetchImpl, MAX_BYTES, 2);
      if (sha(bytes) !== MCS_DIGEST_CSV_SHA256) throw Error("MCS_DIGEST_FILE_REVISION_UNREVIEWED");
      const parsed = parseUsGSMcsCsv(new TextDecoder("windows-1252").decode(bytes));
      const rows = parsed.map((r: any) => r.raw.raw as Record<string, string>);
      if (!rows.length) throw Error("MCS_DIGEST_EMPTY_RELEASE");
      return { rows, rightsHash: sha(rights), checkedAt: now.toISOString() };
    } catch (error) {
      const code = error instanceof Error && /^MCS_DIGEST_[A-Z0-9_]+$/u.test(error.message)
        ? error.message : "MCS_DIGEST_SOURCE_CONTRACT_REJECTED";
      failures.push(code);
    }
  }
  throw Error("MCS_DIGEST_PINNED_ORIGINAL_UNAVAILABLE__" + failures.join("__"));
}

export async function loadQualifiedMcsRelease(options: { fetchImpl?: typeof fetch; now?: Date; noCache?: boolean } = {}) {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return null;
  if (!options.noCache && unavailableUntil > now.getTime()) return null;
  if (!options.noCache && cached && cached.until > now.getTime()) return cached.value;
  if (!options.noCache && pending) return pending;
  const work = acquire(options.fetchImpl ?? fetch, now).catch(error => {
    lastFailure = error instanceof Error && /^MCS_DIGEST_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "MCS_DIGEST_SOURCE_CONTRACT_REJECTED";
    return null;
  });
  if (!options.noCache) pending = work;
  try {
    const result = await work;
    if (result) lastFailure = null;
    if (result && !options.noCache) cached = { until: now.getTime() + TTL, value: result };
    if (!result && !options.noCache) unavailableUntil = now.getTime() + 60_000;
    return result;
  } finally { if (!options.noCache) pending = null; }
}

/** Pure transformation only. The acquisition path above independently pins
 * actual original bytes and dataset-specific CC0 before invoking this method. */
export function deriveMcsProductionChanges(rows: Record<string, string>[], iso3: string, now: Date) {
  const name = mcsCanonicalCountryName(iso3); if (!name) return [];
  const groups = new Map<string, Map<number, { value: number; rowHash: string }>>();
  for (const row of rows) {
    if (String(row.Country ?? "").trim().toUpperCase() !== name ||
        String(row["Is critical mineral 2025"] ?? "").trim().toLowerCase() !== "yes" ||
        !/production/iu.test(row.Statistics ?? "") || !String(row.Commodity ?? "").trim() ||
        !/^\d{4}$/u.test(row.Year ?? "") ||
        !/^[0-9]+(?:\.[0-9]+)?$/u.test(String(row.Value ?? "").replaceAll(",", "").trim())) continue;
    const year = Number(row.Year), value = Number(String(row.Value).replaceAll(",", ""));
    // Annual observations are reference periods, not today's market values.
    if (year !== 2024 && year !== 2025 || !Number.isFinite(value) || value < 0) continue;
    const key = canonicalJson([row.Commodity, row.Section, row.Statistics, row.Statistics_detail, row.Unit].map(x => x ?? ""));
    const years = groups.get(key) ?? new Map();
    if (years.has(year)) throw Error("MCS_DIGEST_DUPLICATE_COUNTRY_SERIES_YEAR");
    years.set(year, { value, rowHash: sha(canonicalJson(row)) }); groups.set(key, years);
  }
  const periodEnd = Date.parse("2025-12-31T23:59:59.000Z");
  if (now.getTime() < periodEnd || now.getTime() - periodEnd > 400 * 86400_000) return [];
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, years]) => {
    const current = years.get(2025), previous = years.get(2024);
    if (!current || !previous || previous.value <= 0) return [];
    const change = (current.value / previous.value - 1) * 100;
    if (!Number.isFinite(change)) return [];
    return [{ commodity: JSON.parse(key)[0] as string, change_pct: Number(change.toFixed(6)),
      row_hashes: [previous.rowHash, current.rowHash], series_key_hash: sha(key) }];
  }).slice(0, 12);
}

/**
 * Measure *actual* exact-hash USGS MCS 2026 annual structural country coverage.
 * Every candidate comes from verified CC0 dataset rows with 2024+2025
 * comparable production periods; publisher country ≠ current event country.
 * The output never certifies signed GRO, current news, an x402 quote,
 * independent customer delivery or product availability.
 */
export function summarizeQualifiedMcs195StructuralCoverage(
  rows: Record<string,string>[], now: Date,
) {
  if (!Array.isArray(rows) || !Number.isFinite(now.getTime()) ||
      COUNTRIES_195.length !== 195)
    throw Error("MCS_195_SOURCE_CENSUS_INPUT_INVALID");
  const nameToIso3 = new Map(COUNTRIES_195.map(c=>[c.name.toUpperCase(),c.iso3]));
  if (nameToIso3.size!==195) throw Error("MCS_195_SOURCE_CENSUS_COUNTRY_DUPLICATE");
  const grouped = new Map<string, Record<string,string>[]>();
  for(const row of rows){
    const iso3=nameToIso3.get(String(row?.Country??"").trim().toUpperCase());
    if(!iso3) continue; // A USGS territory/alias is never guessed as a country.
    const group=grouped.get(iso3)??[];
    group.push(row);grouped.set(iso3,group);
  }
  const countries: Array<{
    iso3:string;status:"COMPARABLE_2024_2025_SOURCE"|
      "NO_COMPARABLE_2024_2025_SOURCE"|"UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS";
    derived_series_count:number; raw_original_rows_in_customer_response:false;
    commercial_offer_eligible_not_assessed:true;
  }> = [];
  for(const country of COUNTRIES_195) {
    const sourceRows=grouped.get(country.iso3)??[];
    let status:"COMPARABLE_2024_2025_SOURCE"|
      "NO_COMPARABLE_2024_2025_SOURCE"|"UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS" =
      "NO_COMPARABLE_2024_2025_SOURCE";
    let count=0;
    try {
      const comparable=deriveMcsProductionChanges(sourceRows,country.iso3,now);
      count=comparable.length;
      if(count>0)status="COMPARABLE_2024_2025_SOURCE";
    } catch {status="UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS";}
    countries.push({iso3:country.iso3,status,derived_series_count:count,
      raw_original_rows_in_customer_response:false,
      commercial_offer_eligible_not_assessed:true});
  }
  const comparable=countries.filter(x=>x.status==="COMPARABLE_2024_2025_SOURCE");
  const invalid=countries.filter(x=>x.status==="UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS");
  return {
    schema:"geomacro.mcs-195-qualified-annual-country-source-census.v1" as const,
    canonical_country_count:195 as const,
    source:"USGS_MCS_2026_EXACT_SHA_CC0_VERIFIED_ONLY" as const,
    publisher_release_verified_before_census_by_caller:true as const,
    source_sha256:MCS_DIGEST_CSV_SHA256,
    reference_periods:[2024,2025] as const,
    native_observation_kind:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" as const,
    countries_with_comparable_source:comparable.length,
    countries_without_comparable_source:195-comparable.length-invalid.length,
    countries_with_ambiguous_rows:invalid.length,
    derived_annual_series_candidates:comparable.reduce((n,c)=>n+c.derived_series_count,0),
    canonical_product_preflight_per_country_not_assessed:true,
    source_rights_grant_is_exact_scoped_dataset_only:true,
    current_country_mineral_events_verified:false,
    signed_risk_objects_verified:false,
    paid_entitlements_or_mainnet_settlements_verified:false,
    full_195_country_commercial_coverage_verified:false,
    no_additional_source_network_calls:true,
    no_raw_country_production_data_exported:true,
    country_coverage:countries,
  };
}

export async function loadQualifiedMcsCountryContext(iso3: string, options: Parameters<typeof loadQualifiedMcsRelease>[0] = {}): Promise<StructuralContext | null> {
  if (!mcsCanonicalCountryName(iso3)) return null;
  const release = await loadQualifiedMcsRelease(options); if (!release) return null;
  const now = options.now ?? new Date();
  let changes;
  try { changes = deriveMcsProductionChanges(release.rows, iso3, now); } catch { return null; }
  if (!changes.length) return null;
  const observations: StructuralObservation[] = changes.map(change => {
    const normalized_hash = sha(canonicalJson({ source: MCS_DIGEST_SOURCE_ID, iso3, ...change }));
    return { observation_id: "derived:" + normalized_hash, source_id: MCS_DIGEST_SOURCE_ID,
      source_record_id: change.series_key_hash, dimension: "critical_minerals", country_iso3: iso3,
      partner_country_iso3: null, observed_at: "2025-12-31T23:59:59.000Z", published_at: null,
      metric: "annual_mineral_production_change_pct", value_numeric: change.change_pct,
      value_text: change.commodity + ": annual production comparison, 2025 versus 2024; annual estimates, not live supply.",
      unit: "percent_change", event_type: null, signal_type: "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      source_url: null, parser_version: METHOD, methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
      quality_status: "VERIFIED", provenance: { source_file_sha256: MCS_DIGEST_CSV_SHA256,
        rights_metadata_sha256: release.rightsHash, input_row_hashes: change.row_hashes,
        reference_year: 2025, previous_reference_year: 2024, date_precision: "YEAR",
        reference_period_end_is_not_publication_time: true },
      normalized_hash, retrieved_at: release.checkedAt };
  });
  return { status: "AVAILABLE", methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    subject: { type: "country", country_iso3: iso3 }, observations,
    metadata: { serving_layer: "QUALIFIED_RELEASE_DERIVED_V1", warehouse_methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02",
      coverage: [], composition_method: null, route_modeling_status: null, direct_evidence_status: null },
    note: "Derived annual mineral-production comparisons for 2025 versus 2024. Reference-period end is not a publication clock. No live market, current event, calibrated risk score or signed GRO is included." };
}

export async function qualifiedMcsSourceRights(sourceId: string): Promise<SourceRightsRow | null> {
  if (sourceId !== MCS_DIGEST_SOURCE_ID) return null;
  const release = await loadQualifiedMcsRelease(); if (!release) return null;
  // These statuses describe this exact hash-pinned, technically checked data
  // release. Permission comes from the publisher's current DOI metadata.
  return { source_id: MCS_DIGEST_SOURCE_ID, category: "CRITICAL_MINERALS", certification_state: "CERTIFIED",
    commercial_usage_status: "DERIVED_ONLY", enabled_for_ingestion: true, enabled_for_commercial_signals: true,
    raw_redistribution_allowed: false, attribution_required: false, licence_name: "CC0-1.0 (exact MCS 2026 dataset only)" };
}
