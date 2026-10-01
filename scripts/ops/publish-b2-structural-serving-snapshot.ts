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
const PAGE_SIZE = 500;
const MAX_SOURCES = 5_000;
const MAX_SOURCE_ROWS = 250_000;
const MAX_COVERAGE_SOURCE_ROWS = 20_000;
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

function isoTime(value: unknown): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function coalescedObservationTime(row: AnyRow): number {
  for (const value of [row.observed_at, row.published_at, row.retrieved_at]) {
    const parsed = isoTime(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

function observationRank(row: AnyRow): [number, number, string] {
  return [
    coalescedObservationTime(row),
    isoTime(row.retrieved_at),
    String(row.observation_id ?? ""),
  ];
}

function newer(a: AnyRow, b: AnyRow): boolean {
  const ar = observationRank(a);
  const br = observationRank(b);
  if (ar[0] !== br[0]) return ar[0] > br[0];
  if (ar[1] !== br[1]) return ar[1] > br[1];
  return ar[2] > br[2];
}

function latestKey(row: AnyRow): string {
  return [
    String(row.country_iso3 ?? ""),
    String(row.source_id ?? ""),
    String(row.dimension ?? ""),
    String(row.metric ?? ""),
    String(row.partner_country_iso3 ?? ""),
  ].join("\u001f");
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

async function readCommercialLatestRows(
  cutoff: string,
  eligibleSourceIds: string[],
): Promise<{ latestRows: AnyRow[]; sourceRowsScanned: number }> {
  const latestByKey = new Map<string, AnyRow>();
  let sourceRowsScanned = 0;

  for (const sourceId of eligibleSourceIds) {
    let afterHash = "";
    let sourceRows = 0;
    while (true) {
      let query: any = db
        .from("structural_geopolitical_observations")
        .select(observationColumns)
        .eq("source_id", sourceId)
        .eq("commercial_eligibility_status", "VERIFIED")
        .eq("quality_status", "VERIFIED")
        .lte("retrieved_at", cutoff)
        .order("normalized_hash", { ascending: true })
        .limit(PAGE_SIZE);
      if (afterHash) query = query.gt("normalized_hash", afterHash);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) {
        throw new Error(
          `B2_STRUCTURAL_QUERY_FAILED_structural_geopolitical_observations_${sourceId}_${error?.code ?? "unknown"}`,
        );
      }
      if (data.length === 0) break;

      sourceRows += data.length;
      sourceRowsScanned += data.length;
      if (sourceRows > MAX_SOURCE_ROWS) {
        throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_source_rows_${sourceId}`);
      }

      for (const row of data as AnyRow[]) {
        const country = String(row.country_iso3 ?? "");
        if (!validIso3(country)) continue;
        if (
          row.source_id !== sourceId ||
          row.quality_status !== "VERIFIED" ||
          typeof row.observation_id !== "string" ||
          typeof row.dimension !== "string" ||
          typeof row.metric !== "string" ||
          !/^[a-f0-9]{64}$/i.test(String(row.normalized_hash ?? ""))
        ) throw new Error("B2_STRUCTURAL_COMMERCIAL_BOUNDARY_INVALID");
        const key = latestKey(row);
        const current = latestByKey.get(key);
        if (!current || newer(row, current)) latestByKey.set(key, row);
      }

      const last = String(data[data.length - 1]?.normalized_hash ?? "");
      if (!/^[a-f0-9]{64}$/i.test(last) || last === afterHash) {
        throw new Error("B2_STRUCTURAL_KEYSET_PROGRESS_INVALID");
      }
      afterHash = last;
      if (data.length < PAGE_SIZE) break;
    }
  }

  return {
    latestRows: [...latestByKey.values()],
    sourceRowsScanned,
  };
}

async function readCommercialCoverageRows(
  cutoff: string,
  eligibleSourceIds: string[],
): Promise<AnyRow[]> {
  const latest = new Map<string, AnyRow>();
  for (const sourceId of eligibleSourceIds) {
    let sourceRows = 0;
    for (let offset = 0; offset < MAX_COVERAGE_SOURCE_ROWS; offset += PAGE_SIZE) {
      const { data, error } = await db
        .from("structural_geopolitical_coverage")
        .select(coverageColumns)
        .eq("source_id", sourceId)
        .lte("updated_at", cutoff)
        .order("dimension", { ascending: true })
        .order("country_iso3", { ascending: true })
        .order("coverage_year", { ascending: false })
        .order("updated_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) {
        throw new Error(
          `B2_STRUCTURAL_QUERY_FAILED_structural_geopolitical_coverage_${sourceId}_${error?.code ?? "unknown"}`,
        );
      }
      sourceRows += data.length;
      if (sourceRows > MAX_COVERAGE_SOURCE_ROWS) {
        throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_structural_geopolitical_coverage_${sourceId}`);
      }
      for (const row of data as AnyRow[]) {
        const key = [
          String(row.source_id ?? ""),
          String(row.dimension ?? ""),
          String(row.country_iso3 ?? ""),
        ].join("\u001f");
        const current = latest.get(key);
        const year = Number(row.coverage_year);
        const currentYear = Number(current?.coverage_year);
        if (
          !current ||
          year > currentYear ||
          (year === currentYear && isoTime(row.updated_at) > isoTime(current.updated_at))
        ) {
          latest.set(key, row);
        }
      }
      if (data.length < PAGE_SIZE) break;
      if (sourceRows === MAX_COVERAGE_SOURCE_ROWS) {
        throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_structural_geopolitical_coverage_${sourceId}`);
      }
    }
  }
  const rows = [...latest.values()].sort((a, b) =>
    String(a.country_iso3).localeCompare(String(b.country_iso3)) ||
    String(a.dimension).localeCompare(String(b.dimension)) ||
    String(a.source_id).localeCompare(String(b.source_id)),
  );
  if (rows.length > MAX_COVERAGE) {
    throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_country_coverage");
  }
  return rows;
}

const generatedAt = new Date().toISOString();
const eligibleSourceIds = await readEligibleSourceIds();
const eligibleSourceSet = new Set(eligibleSourceIds);
const { latestRows, sourceRowsScanned } = await readCommercialLatestRows(
  generatedAt,
  eligibleSourceIds,
);
if (sourceRowsScanned === 0) throw new Error("B2_STRUCTURAL_BASE_SET_EMPTY");
if (latestRows.length === 0) throw new Error("B2_STRUCTURAL_LATEST_SET_EMPTY");

const byCountry = new Map<string, AnyRow[]>();
for (const row of latestRows) {
  const country = String(row.country_iso3 ?? "");
  const sourceId = String(row.source_id ?? "");
  if (
    !validIso3(country) ||
    !eligibleSourceSet.has(sourceId) ||
    row.quality_status !== "VERIFIED" ||
    typeof row.observation_id !== "string" ||
    typeof row.dimension !== "string" ||
    typeof row.metric !== "string" ||
    !/^[a-f0-9]{64}$/i.test(String(row.normalized_hash ?? ""))
  ) throw new Error("B2_STRUCTURAL_LATEST_INVALID");
  const rows = byCountry.get(country) ?? [];
  rows.push(row);
  byCountry.set(country, rows);
}
if (byCountry.size > MAX_PROFILES) throw new Error("B2_STRUCTURAL_TRUNCATION_GUARD_country_profiles");

const profiles = [...byCountry.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([country_iso3, rows]) => ({
    country_iso3,
    latest_observations: [...rows].sort((a, b) => {
      const ar = observationRank(a);
      const br = observationRank(b);
      return br[0] - ar[0] ||
        String(a.dimension).localeCompare(String(b.dimension)) ||
        String(a.metric).localeCompare(String(b.metric)) ||
        String(a.source_id).localeCompare(String(b.source_id));
    }),
  }));

const coverage = await readCommercialCoverageRows(generatedAt, eligibleSourceIds);
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
for (const row of direct) {
  const country = String(row.country_iso3 ?? "");
  const partner = String(row.partner_country_iso3 ?? "");
  if (!validIso3(country) || !validIso3(partner) || country === partner) {
    throw new Error("B2_STRUCTURAL_DIRECT_INVALID");
  }
}

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
  source_rows_scanned: sourceRowsScanned,
  latest_rows: latestRows.length,
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  commercial_boundary: "registry_active+production_approved+commercial_use+row_verified+quality_verified",
  verification: "streaming-indexed-private-base-read+exact-commercial-gates+canonical-latest-per-key+bounded-per-source+full-b2-readback-sha256-plus-gzip-json-restore",
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_STRUCTURAL_PROOF_READBACK_INVALID");

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  eligible_sources: eligibleSourceIds.length,
  source_rows_scanned: sourceRowsScanned,
  latest_rows: latestRows.length,
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  compressed_bytes: packed.length,
  b2_objects_verified: 2,
}));
