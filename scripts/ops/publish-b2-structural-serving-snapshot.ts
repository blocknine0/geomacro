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

async function paged(
  table: string,
  select: string,
  maxRows: number,
  orderColumns: string[],
  configure?: (query: any) => any,
): Promise<AnyRow[]> {
  const output: AnyRow[] = [];
  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    let query: any = db.from(table).select(select);
    if (configure) query = configure(query);
    for (const column of orderColumns) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) {
      throw new Error(`B2_STRUCTURAL_QUERY_FAILED_${table}_${error?.code ?? "unknown"}`);
    }
    output.push(...(data as AnyRow[]));
    if (data.length < PAGE_SIZE) return output;
    if (output.length >= maxRows) throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_${table}`);
  }
  throw new Error(`B2_STRUCTURAL_TRUNCATION_GUARD_${table}`);
}

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

const profiles = await paged(
  "commercial_structural_country_profiles",
  "country_iso3,latest_observations",
  MAX_PROFILES,
  ["country_iso3"],
);
const coverage = await paged(
  "commercial_structural_country_coverage_latest",
  "source_id,dimension,country_iso3,coverage_year,coverage_status,observation_count,latest_observed_at,audit_metadata,updated_at",
  MAX_COVERAGE,
  ["country_iso3", "dimension", "source_id"],
);
const direct = await paged(
  "commercial_structural_country_latest",
  observationColumns,
  MAX_DIRECT,
  ["country_iso3", "partner_country_iso3", "source_id", "dimension", "metric", "observation_id"],
  (query) => query.not("partner_country_iso3", "is", null),
);

if (profiles.length === 0) throw new Error("B2_STRUCTURAL_PROFILE_SET_EMPTY");
const countries = new Set<string>();
for (const row of profiles) {
  const country = String(row.country_iso3 ?? "");
  if (!/^[A-Z]{3}$/.test(country) || countries.has(country) || !Array.isArray(row.latest_observations)) {
    throw new Error("B2_STRUCTURAL_PROFILE_INVALID");
  }
  countries.add(country);
}
for (const row of coverage) {
  if (
    !/^[A-Z]{3}$/.test(String(row.country_iso3 ?? "")) ||
    typeof row.source_id !== "string" ||
    typeof row.dimension !== "string" ||
    typeof row.coverage_status !== "string" ||
    !Number.isFinite(Number(row.observation_count))
  ) throw new Error("B2_STRUCTURAL_COVERAGE_INVALID");
}
for (const row of direct) {
  const country = String(row.country_iso3 ?? "");
  const partner = String(row.partner_country_iso3 ?? "");
  if (
    !/^[A-Z]{3}$/.test(country) ||
    !/^[A-Z]{3}$/.test(partner) ||
    country === partner ||
    typeof row.observation_id !== "string" ||
    typeof row.source_id !== "string" ||
    typeof row.dimension !== "string" ||
    typeof row.metric !== "string" ||
    !/^[a-f0-9]{64}$/i.test(String(row.normalized_hash ?? ""))
  ) throw new Error("B2_STRUCTURAL_DIRECT_INVALID");
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
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  verification: "full-b2-readback-sha256-plus-gzip-json-restore",
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_STRUCTURAL_PROOF_READBACK_INVALID");

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  country_profiles: profiles.length,
  coverage_rows: coverage.length,
  direct_observations: direct.length,
  compressed_bytes: packed.length,
  b2_objects_verified: 2,
}));
