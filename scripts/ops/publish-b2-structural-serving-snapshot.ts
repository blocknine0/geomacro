#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const HISTORICAL_URL = "https://nqvpcbnnvjsrlvyxxevk.supabase.co";
const HISTORICAL_PROJECT_REF = "nqvpcbnnvjsrlvyxxevk";
const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SNAPSHOT_KEY = "geomacro-evidence/v1/structural/serving/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/structural/serving/latest-proof.json";
const PAGE_SIZE = 1000;
const DISCOVERY_PAGE_SIZE = 1000;
const SOURCE_BATCH_SIZE = 50;
const COUNTRY_CONCURRENCY = 6;
const MAX_SOURCES = 5_000;
const MAX_COUNTRIES = 500;
const MAX_RAW_OBSERVATION_ROWS_SCANNED = 500_000;
const MAX_RAW_COVERAGE_ROWS_SCANNED = 100_000;
const MAX_LATEST_PER_COUNTRY = 5_000;
const MAX_COVERAGE_PER_COUNTRY = 5_000;
const MAX_PROFILES = 500;
const MAX_COVERAGE = 20_000;
const MAX_DIRECT = 20_000;
const MAX_COMPRESSED_BYTES = 12_000_000;
const MAX_RAW_BYTES = 40_000_000;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

if (
  process.env.HISTORICAL_SUPABASE_URL !== HISTORICAL_URL ||
  !process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY ||
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) throw new Error("B2_STRUCTURAL_PUBLISH_CONFIG_REQUIRED");

const db = createClient(
  HISTORICAL_URL,
  process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
);
const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

type AnyRow = Record<string, unknown>;

const observationColumns = [
  "observation_id",
  "source_id",
  "source_record_id",
  "dimension",
  "country_iso3",
  "partner_country_iso3",
  "observed_at",
  "published_at",
  "metric",
  "value_numeric",
  "value_text",
  "unit",
  "event_type",
  "signal_type",
  "source_url",
  "parser_version",
  "methodology_status",
  "quality_status",
  "provenance",
  "normalized_hash",
  "retrieved_at",
].join(",");

const coverageColumns = [
  "source_id",
  "dimension",
  "country_iso3",
  "coverage_year",
  "coverage_status",
  "observation_count",
  "latest_observed_at",
  "audit_metadata",
  "updated_at",
].join(",");

function validIso3(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    output.push(values.slice(offset, offset + size));
  }
  return output;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  );
  return output;
}

async function readEligibleSourceIds(): Promise<string[]> {
  const output: string[] = [];
  for (let offset = 0; offset < MAX_SOURCES; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("data_sources")
      .select("source_id")
      .eq("registry_active", true)
      .eq("status", "PRODUCTION_APPROVED")
      .eq("commercial_use", true)
      .order("source_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) {
      throw new Error(`B2_STRUCTURAL_QUERY_FAILED_data_sources_${error?.code ?? "unknown"}`);
    }
    for (const row of data) {
      const sourceId = String(row.source_id ?? "").trim();
      if (!sourceId) throw new Error("B2_STRUCTURAL_SOURCE_ID_INVALID");
      output.push(sourceId);
    }
    if (data.length < PAGE_SIZE) break;
    if (output.length >= MAX_SOURCES) {
      throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_data_sources");
    }
  }
  const unique = [...new Set(output)].sort();
  if (unique.length === 0 || unique.length !== output.length) {
    throw new Error("B2_STRUCTURAL_ELIGIBLE_SOURCE_SET_INVALID");
  }
  return unique;
}

async function discoverCountryCodes(
  table: "structural_geopolitical_observations" | "structural_geopolitical_coverage",
): Promise<string[]> {
  const output = new Set<string>();
  let after = "";
  for (let attempt = 0; attempt <= MAX_COUNTRIES; attempt += 1) {
    let query: any = db
      .from(table)
      .select("country_iso3")
      .not("country_iso3", "is", null)
      .order("country_iso3", { ascending: true })
      .limit(DISCOVERY_PAGE_SIZE);
    if (table === "structural_geopolitical_observations") {
      query = query
        .eq("commercial_eligibility_status", "VERIFIED")
        .eq("quality_status", "VERIFIED");
    }
    if (after) query = query.gt("country_iso3", after);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      throw new Error(`B2_STRUCTURAL_COUNTRY_DISCOVERY_FAILED_${table}_${error?.code ?? "unknown"}`);
    }
    if (data.length === 0) return [...output].sort();
    let last = after;
    for (const row of data) {
      const current = String(row.country_iso3 ?? "");
      if (validIso3(current)) output.add(current);
      if (current > last) last = current;
    }
    if (!last || last <= after) throw new Error("B2_STRUCTURAL_COUNTRY_KEYSET_PROGRESS_INVALID");
    after = last;
    if (output.size > MAX_COUNTRIES) {
      throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_country_discovery_${table}`);
    }
    if (data.length < DISCOVERY_PAGE_SIZE) return [...output].sort();
  }
  throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_country_discovery_${table}`);
}

function isoTime(value: unknown): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function canonicalObservationTime(row: AnyRow): number {
  for (const value of [row.observed_at, row.published_at, row.retrieved_at]) {
    const parsed = isoTime(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

function observationIsNewer(candidate: AnyRow, current: AnyRow): boolean {
  const candidatePrimary = canonicalObservationTime(candidate);
  const currentPrimary = canonicalObservationTime(current);
  if (candidatePrimary !== currentPrimary) return candidatePrimary > currentPrimary;
  const candidateRetrieved = isoTime(candidate.retrieved_at);
  const currentRetrieved = isoTime(current.retrieved_at);
  if (candidateRetrieved !== currentRetrieved) return candidateRetrieved > currentRetrieved;
  return String(candidate.observation_id ?? "") > String(current.observation_id ?? "");
}

function observationKey(row: AnyRow): string {
  return [
    String(row.country_iso3 ?? ""),
    String(row.source_id ?? ""),
    String(row.dimension ?? ""),
    String(row.metric ?? ""),
    String(row.partner_country_iso3 ?? ""),
  ].join("\u001f");
}

let rawObservationRowsScanned = 0;
let rawCoverageRowsScanned = 0;

async function readCountryLatest(
  country: string,
  eligibleSourceIds: string[],
): Promise<AnyRow[]> {
  const latest = new Map<string, AnyRow>();
  for (const sourceBatch of chunks(eligibleSourceIds, SOURCE_BATCH_SIZE)) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await db
        .from("structural_geopolitical_observations")
        .select(observationColumns)
        .eq("country_iso3", country)
        .eq("commercial_eligibility_status", "VERIFIED")
        .eq("quality_status", "VERIFIED")
        .in("source_id", sourceBatch)
        .order("dimension", { ascending: true })
        .order("observed_at", { ascending: false, nullsFirst: false })
        .order("source_id", { ascending: true })
        .order("normalized_hash", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) {
        throw new Error(`B2_STRUCTURAL_COUNTRY_RAW_FAILED_${country}_${error?.code ?? "unknown"}`);
      }
      rawObservationRowsScanned += data.length;
      if (rawObservationRowsScanned > MAX_RAW_OBSERVATION_ROWS_SCANNED) {
        throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_raw_observation_scan");
      }
      for (const row of data as AnyRow[]) {
        const key = observationKey(row);
        const current = latest.get(key);
        if (!current || observationIsNewer(row, current)) latest.set(key, row);
      }
      if (data.length < PAGE_SIZE) break;
    }
  }
  const rows = [...latest.values()];
  if (rows.length > MAX_LATEST_PER_COUNTRY) {
    throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_country_latest_${country}`);
  }
  return rows;
}

function coverageIsNewer(candidate: AnyRow, current: AnyRow): boolean {
  const candidateYear = Number(candidate.coverage_year);
  const currentYear = Number(current.coverage_year);
  if (candidateYear !== currentYear) return candidateYear > currentYear;
  return isoTime(candidate.updated_at) > isoTime(current.updated_at);
}

async function readCountryCoverage(
  country: string,
  eligibleSourceIds: string[],
): Promise<AnyRow[]> {
  const latest = new Map<string, AnyRow>();
  for (const sourceBatch of chunks(eligibleSourceIds, SOURCE_BATCH_SIZE)) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await db
        .from("structural_geopolitical_coverage")
        .select(coverageColumns)
        .eq("country_iso3", country)
        .in("source_id", sourceBatch)
        .order("dimension", { ascending: true })
        .order("source_id", { ascending: true })
        .order("coverage_year", { ascending: false })
        .order("updated_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) {
        throw new Error(`B2_STRUCTURAL_COUNTRY_COVERAGE_RAW_FAILED_${country}_${error?.code ?? "unknown"}`);
      }
      rawCoverageRowsScanned += data.length;
      if (rawCoverageRowsScanned > MAX_RAW_COVERAGE_ROWS_SCANNED) {
        throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_raw_coverage_scan");
      }
      for (const row of data as AnyRow[]) {
        const key = [row.source_id, row.dimension, row.country_iso3].map(String).join("\u001f");
        const current = latest.get(key);
        if (!current || coverageIsNewer(row, current)) latest.set(key, row);
      }
      if (data.length < PAGE_SIZE) break;
    }
  }
  const rows = [...latest.values()].sort((a, b) =>
    String(a.dimension).localeCompare(String(b.dimension)) ||
    String(a.source_id).localeCompare(String(b.source_id)),
  );
  if (rows.length > MAX_COVERAGE_PER_COUNTRY) {
    throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_country_coverage_${country}`);
  }
  return rows;
}

function rowTime(row: AnyRow): number {
  const value = row.observed_at ?? row.published_at ?? row.retrieved_at;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const [eligibleSourceIds, observationCountries, coverageCountries] = await Promise.all([
  readEligibleSourceIds(),
  discoverCountryCodes("structural_geopolitical_observations"),
  discoverCountryCodes("structural_geopolitical_coverage"),
]);
const eligibleSourceSet = new Set(eligibleSourceIds);
const countries = [...new Set([...observationCountries, ...coverageCountries])].sort();
if (countries.length === 0 || countries.length > MAX_COUNTRIES) {
  throw new Error("B2_STRUCTURAL_COUNTRY_SET_INVALID");
}

const countryResults = await mapConcurrent(
  countries,
  COUNTRY_CONCURRENCY,
  async (country) => {
    const [latest, coverage] = await Promise.all([
      readCountryLatest(country, eligibleSourceIds),
      readCountryCoverage(country, eligibleSourceIds),
    ]);
    return { country, latest, coverage };
  },
);

const latestRows = countryResults.flatMap((entry) => entry.latest);
const coverage = countryResults.flatMap((entry) => entry.coverage);
if (latestRows.length === 0) throw new Error("B2_STRUCTURAL_LATEST_SET_EMPTY");
if (coverage.length > MAX_COVERAGE) throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_country_coverage");

const byCountry = new Map<string, AnyRow[]>();
for (const row of latestRows) {
  const country = String(row.country_iso3 ?? "");
  const sourceId = String(row.source_id ?? "");
  if (!validIso3(country) || !eligibleSourceSet.has(sourceId)) {
    throw new Error("B2_STRUCTURAL_LATEST_COMMERCIAL_BOUNDARY_INVALID");
  }
  const rows = byCountry.get(country) ?? [];
  rows.push(row);
  byCountry.set(country, rows);
}
if (byCountry.size > MAX_PROFILES) throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_country_profiles");

const profiles = [...byCountry.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([country_iso3, rows]) => ({
    country_iso3,
    latest_observations: [...rows].sort((a, b) =>
      rowTime(b) - rowTime(a) ||
      String(a.dimension).localeCompare(String(b.dimension)) ||
      String(a.metric).localeCompare(String(b.metric)) ||
      String(a.source_id).localeCompare(String(b.source_id)),
    ),
  }));

const direct = latestRows
  .filter((row) => row.partner_country_iso3 !== null && row.partner_country_iso3 !== undefined)
  .sort((a, b) =>
    String(a.country_iso3).localeCompare(String(b.country_iso3)) ||
    String(a.partner_country_iso3).localeCompare(String(b.partner_country_iso3)) ||
    String(a.source_id).localeCompare(String(b.source_id)) ||
    String(a.dimension).localeCompare(String(b.dimension)) ||
    String(a.metric).localeCompare(String(b.metric)) ||
    String(a.observation_id).localeCompare(String(b.observation_id)),
  );
if (direct.length > MAX_DIRECT) throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_direct_observations");

for (const row of coverage) {
  if (
    !eligibleSourceSet.has(String(row.source_id ?? "")) ||
    !validIso3(row.country_iso3) ||
    typeof row.source_id !== "string" ||
    typeof row.dimension !== "string" ||
    typeof row.coverage_status !== "string" ||
    !Number.isFinite(Number(row.observation_count))
  ) throw new Error("B2_STRUCTURAL_COVERAGE_INVALID");
}
for (const row of latestRows) {
  if (
    typeof row.observation_id !== "string" ||
    typeof row.source_id !== "string" ||
    typeof row.dimension !== "string" ||
    typeof row.metric !== "string" ||
    row.quality_status !== "VERIFIED" ||
    !/^[a-f0-9]{64}$/i.test(String(row.normalized_hash ?? ""))
  ) throw new Error("B2_STRUCTURAL_LATEST_INVALID");
}
for (const row of direct) {
  const country = String(row.country_iso3 ?? "");
  const partner = String(row.partner_country_iso3 ?? "");
  if (!validIso3(country) || !validIso3(partner) || country === partner) {
    throw new Error("B2_STRUCTURAL_DIRECT_INVALID");
  }
}

const generatedAt = new Date().toISOString();
const payload = {
  schema: "geomacro.structural-serving-snapshot.v1",
  generated_at: generatedAt,
  source_project: HISTORICAL_PROJECT_REF,
  methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02",
  application_boundary: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
  composition_method: "ENDPOINT_COMPOSED_V0_1",
  route_modeling_status: "NOT_MODELED",
  country_profiles: profiles,
  coverage,
  direct_observations: direct,
};
const raw = Buffer.from(JSON.stringify(payload));
if (!raw.length || raw.length > MAX_RAW_BYTES) throw new Error("B2_STRUCTURAL_RAW_SIZE_INVALID");
const packed = gzipSync(raw, { level: 9 });
if (!packed.length || packed.length > MAX_COMPRESSED_BYTES) {
  throw new Error("B2_STRUCTURAL_COMPRESSED_SIZE_INVALID");
}
const digest = sha256(packed);
await b2.put(SNAPSHOT_KEY, packed);
const readback = await b2.get(SNAPSHOT_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) {
  throw new Error("B2_STRUCTURAL_READBACK_HASH_INVALID");
}
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (
  restored?.schema !== payload.schema ||
  restored?.generated_at !== generatedAt ||
  restored?.source_project !== HISTORICAL_PROJECT_REF ||
  restored?.country_profiles?.length !== profiles.length ||
  restored?.coverage?.length !== coverage.length ||
  restored?.direct_observations?.length !== direct.length
) throw new Error("B2_STRUCTURAL_RESTORE_INVALID");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.structural-serving-snapshot-proof.v1",
  generated_at: generatedAt,
  source_project: HISTORICAL_PROJECT_REF,
  snapshot_key: SNAPSHOT_KEY,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  raw_bytes: raw.length,
  eligible_sources: eligibleSourceIds.length,
  discovered_countries: countries.length,
  raw_observation_rows_scanned: rawObservationRowsScanned,
  raw_coverage_rows_scanned: rawCoverageRowsScanned,
  latest_rows: latestRows.length,
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  commercial_boundary: "registry_active+production_approved+commercial_use+row_verified+quality_verified",
  verification: "indexed-country-slices+exact-commercial-gates+canonical-local-latest+full-b2-readback-sha256-plus-gzip-json-restore",
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_STRUCTURAL_PROOF_READBACK_INVALID");

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  eligible_sources: eligibleSourceIds.length,
  discovered_countries: countries.length,
  raw_observation_rows_scanned: rawObservationRowsScanned,
  raw_coverage_rows_scanned: rawCoverageRowsScanned,
  latest_rows: latestRows.length,
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  compressed_bytes: packed.length,
  b2_objects_verified: 2,
}));
