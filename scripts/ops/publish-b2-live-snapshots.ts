#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { createDirectPostgresClient } from "./direct-postgres-supabase-lite";
import { readPublicIntelligenceRowsFromSupabase } from "../../src/lib/public-intelligence.functions";
import { readPublicGlobalRisk } from "../../src/lib/global-risk-read.server";
import { evaluatePaidOutputSourceReadiness } from "../../src/lib/paid-output-source-readiness";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const INTELLIGENCE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const RISK_KEY = "geomacro-evidence/v1/live/risk-indices/latest.json.gz";
const SOURCE_NETWORK_KEY = "geomacro-evidence/v1/live/source-network-status/latest.json.gz";
const SOURCE_RIGHTS_KEY = "geomacro-evidence/v1/live/commercial-source-rights/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/live-snapshot-proof.json";
const SOURCE_RIGHTS_PAGE_SIZE = 1000;
const SOURCE_RIGHTS_MAX_ROWS = 2000;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const mode = process.argv[2] ?? "live-public";
if (!["live-public","rights-only"].includes(mode))
  throw Error("B2_LIVE_MAINTENANCE_MODE_INVALID");

type SourceRightsRow = {
  source_id: string | null;
  category: string | null;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean | null;
  enabled_for_commercial_signals: boolean | null;
  raw_redistribution_allowed: boolean | null;
  attribution_required: boolean | null;
  licence_name: string | null;
};

type SourceCertificationRow = {
  source_id: string | null;
  certification_state: string | null;
};

type SourceRightsSnapshotRow = SourceRightsRow & {
  certification_state: string | null;
};

if (
  (mode === "live-public" && (
    process.env.APP_SUPABASE_URL !== "https://ldpwajisioljyjtojvfx.supabase.co" ||
    !process.env.APP_SUPABASE_SERVICE_ROLE_KEY
  )) ||
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) throw new Error("B2_LIVE_PUBLISH_CONFIG_REQUIRED");

// Recover frozen-source inventory without Supabase REST/egress. Reuse the
// repository's strict table-allowlisted, SELECT-only direct-Postgres adapter.
// A missing/misconfigured pooler credential fails *before* B2 activity.
const directRightsDb = mode === "rights-only"
  ? createDirectPostgresClient(String(process.env.SUPABASE_DB_URL ?? ""))
  : null;
const supabase = mode === "live-public"
  ? createClient(
      String(process.env.APP_SUPABASE_URL),
      String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY),
      { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
    )
  : null;

const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const generatedAt = new Date().toISOString();

// Read-only current source rights + certificates are independent of the
// commercial hot intelligence / Global Risk snapshot publisher. One certified
// source must not be blocked by unrelated unavailable category snapshots.
async function collectCommercialSourceRights() {
const sourceRights: SourceRightsRow[] = [];
for (let offset = 0; offset < SOURCE_RIGHTS_MAX_ROWS; offset += SOURCE_RIGHTS_PAGE_SIZE) {
  const columns = "source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name";
  const { data, error } = directRightsDb
    ? await directRightsDb.from("live_external_sources")
        .select(columns).order("source_id", { ascending: true })
        .range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1)
    : await supabase!.from("live_external_sources")
        .select(columns).order("source_id", { ascending: true })
        .range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1);
  if (error || !Array.isArray(data)) throw new Error("B2_LIVE_SOURCE_RIGHTS_INVALID");
  const page = data as unknown as SourceRightsRow[];
  sourceRights.push(...page);
  if (page.length < SOURCE_RIGHTS_PAGE_SIZE) break;
  if (sourceRights.length >= SOURCE_RIGHTS_MAX_ROWS) {
    throw new Error("B2_LIVE_SOURCE_RIGHTS_TRUNCATION_GUARD");
  }
}
if (sourceRights.length === 0 || sourceRights.length >= SOURCE_RIGHTS_MAX_ROWS) {
  throw new Error("B2_LIVE_SOURCE_RIGHTS_INVALID");
}

const sourceCertifications: SourceCertificationRow[] = [];
for (let offset = 0; offset < SOURCE_RIGHTS_MAX_ROWS; offset += SOURCE_RIGHTS_PAGE_SIZE) {
  const { data, error } = directRightsDb
    ? await directRightsDb.from("live_source_certification_records")
        .select("source_id,certification_state")
        .order("source_id", { ascending: true })
        .range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1)
    : await supabase!.from("live_source_certification_records")
        .select("source_id,certification_state")
        .order("source_id", { ascending: true })
        .range(offset, offset + SOURCE_RIGHTS_PAGE_SIZE - 1);
  if (error || !Array.isArray(data)) throw new Error("B2_LIVE_SOURCE_CERTIFICATION_INVALID");
  const page = data as unknown as SourceCertificationRow[];
  sourceCertifications.push(...page);
  if (page.length < SOURCE_RIGHTS_PAGE_SIZE) break;
  if (sourceCertifications.length >= SOURCE_RIGHTS_MAX_ROWS) {
    throw new Error("B2_LIVE_SOURCE_CERTIFICATION_TRUNCATION_GUARD");
  }
}
const certificationBySource = new Map(
  sourceCertifications
    .map((row) => [String(row.source_id ?? "").trim(), row.certification_state ?? null] as const)
    .filter(([sourceId]) => sourceId.length > 0),
);

const sourceRightsSnapshot: SourceRightsSnapshotRow[] = sourceRights.map((row) => ({
  ...row,
  certification_state: certificationBySource.get(String(row.source_id ?? "").trim()) ?? null,
}));

const sourceIds = new Set<string>();
for (const row of sourceRightsSnapshot) {
  const sourceId = String(row.source_id ?? "").trim();
  if (
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(sourceId) ||
    sourceIds.has(sourceId) ||
    !(row.category === null || typeof row.category === "string") ||
    !(row.certification_state === null || typeof row.certification_state === "string") ||
    typeof row.enabled_for_ingestion !== "boolean" ||
    typeof row.enabled_for_commercial_signals !== "boolean" ||
    typeof row.raw_redistribution_allowed !== "boolean" ||
    typeof row.attribution_required !== "boolean" ||
    !(row.commercial_usage_status === null || typeof row.commercial_usage_status === "string") ||
    !(row.licence_name === null || typeof row.licence_name === "string")
  ) throw new Error("B2_LIVE_SOURCE_RIGHTS_ROW_INVALID");
  sourceIds.add(sourceId);
}

const paidOutputReadiness = evaluatePaidOutputSourceReadiness(
  sourceRightsSnapshot.map((row) => ({
    source_id: String(row.source_id ?? ""),
    category: row.category,
    certification_state: row.certification_state,
    commercial_usage_status: row.commercial_usage_status,
    enabled_for_ingestion: row.enabled_for_ingestion === true,
    enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
  })),
);

  return { sourceRightsSnapshot, paidOutputReadiness };
}


if (mode === "rights-only") {
  const { sourceRightsSnapshot, paidOutputReadiness } = await collectCommercialSourceRights();
  const payload = {
    schema: "geomacro.commercial-source-rights-live.v2",
    generated_at: generatedAt,
    source_project: "ldpwajisioljyjtojvfx",
    paid_output_readiness: paidOutputReadiness,
    rows: sourceRightsSnapshot,
  };
  const packed = gzipSync(Buffer.from(JSON.stringify(payload)), {level:9});
  const acceptance = await b2.putWithMetadataVerification(SOURCE_RIGHTS_KEY,packed,{
    verifyRestored: async (bytes: Buffer) => {
      const restored = JSON.parse(gunzipSync(bytes).toString("utf8"));
      if (restored?.schema !== payload.schema ||
          restored?.generated_at !== generatedAt ||
          restored?.source_project !== payload.source_project ||
          !Array.isArray(restored?.rows) ||
          restored.rows.length !== sourceRightsSnapshot.length ||
          restored?.paid_output_readiness?.ready !== paidOutputReadiness.ready)
        throw Error("B2_COMMERCIAL_RIGHTS_READBACK_RESTORE_INVALID");
    },
  });
  console.log(JSON.stringify({
    schema: "geomacro.b2-rights-refresh-acceptance.v1",
    ok: true,
    mode: "rights-only",
    source_rights_rows: sourceRightsSnapshot.length,
    paid_output_readiness: paidOutputReadiness.ready,
    compressed_sha256: acceptance.sha256,
    full_body_readback_verified: acceptance.full_body_readback_verified,
    generated_at: generatedAt,
    supabase_writes: 0,
    x402_settlements: 0,
  }));
  process.exit(0);
}

const intelligenceRows = await readPublicIntelligenceRowsFromSupabase();
const categories = new Set(intelligenceRows.map((row) => String(row.category ?? "").toLowerCase()));
for (const category of ["geopolitics", "macro", "rare_earth"]) {
  if (!categories.has(category)) throw new Error(`B2_LIVE_INTELLIGENCE_CATEGORY_MISSING_${category}`);
}
if (intelligenceRows.length < 3 || intelligenceRows.length > 300) {
  throw new Error("B2_LIVE_INTELLIGENCE_ROWS_INVALID");
}

const risk = await readPublicGlobalRisk();
if (
  risk.verificationStatus !== "verified" ||
  !/^[a-f0-9]{64}$/.test(String(risk.proofHash ?? "")) ||
  !/^[a-f0-9]{64}$/.test(String(risk.calculationHash ?? ""))
) throw new Error("B2_LIVE_RISK_PROOF_INVALID");

const { data: sourceNetworkStatus, error: sourceNetworkError } = await supabase!
  .from("live_source_network_launch_status")
  .select("source_network_100_complete,gdelt_gal_freshness_complete,source_network_launch_complete")
  .maybeSingle();
if (
  sourceNetworkError ||
  !sourceNetworkStatus ||
  typeof sourceNetworkStatus.source_network_100_complete !== "boolean" ||
  typeof sourceNetworkStatus.gdelt_gal_freshness_complete !== "boolean" ||
  typeof sourceNetworkStatus.source_network_launch_complete !== "boolean"
) throw new Error("B2_LIVE_SOURCE_NETWORK_STATUS_INVALID");

const { sourceRightsSnapshot, paidOutputReadiness } = await collectCommercialSourceRights();
if (!paidOutputReadiness.ready) {
  throw new Error(`B2_LIVE_PAID_OUTPUT_SOURCE_SET_NOT_READY:${JSON.stringify(paidOutputReadiness)}`);
}

const payloads = [
  {
    key: INTELLIGENCE_KEY,
    schema: "geomacro.public-intelligence-live.v1",
    value: {
      schema: "geomacro.public-intelligence-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      rows: intelligenceRows,
    },
  },
  {
    key: RISK_KEY,
    schema: "geomacro.public-risk-live.v1",
    value: {
      schema: "geomacro.public-risk-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: risk,
    },
  },
  {
    key: SOURCE_NETWORK_KEY,
    schema: "geomacro.source-network-live.v1",
    value: {
      schema: "geomacro.source-network-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: {
        source_network_100_complete: sourceNetworkStatus.source_network_100_complete,
        gdelt_gal_freshness_complete: sourceNetworkStatus.gdelt_gal_freshness_complete,
        source_network_launch_complete: sourceNetworkStatus.source_network_launch_complete,
      },
    },
  },
  {
    key: SOURCE_RIGHTS_KEY,
    schema: "geomacro.commercial-source-rights-live.v2",
    value: {
      schema: "geomacro.commercial-source-rights-live.v2",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      paid_output_readiness: paidOutputReadiness,
      rows: sourceRightsSnapshot,
    },
  },
] as const;

const proofEntries: Array<Record<string, unknown>> = [];
for (const item of payloads) {
  const packed = gzipSync(Buffer.from(JSON.stringify(item.value)), { level: 9 });
  const digest = sha256(packed);
  await b2.put(item.key, packed);
  const readback = await b2.get(item.key);
  if (readback.length !== packed.length || sha256(readback) !== digest) {
    throw new Error(`B2_LIVE_READBACK_HASH_INVALID_${item.schema}`);
  }
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  if (restored?.schema !== item.schema || restored?.generated_at !== generatedAt) {
    throw new Error(`B2_LIVE_RESTORE_INVALID_${item.schema}`);
  }
  proofEntries.push({ key: item.key, schema: item.schema, sha256: digest, bytes: packed.length });
}

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.live-snapshot-proof.v1",
  generated_at: generatedAt,
  source_project: "ldpwajisioljyjtojvfx",
  entries: proofEntries,
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_LIVE_PROOF_READBACK_INVALID");

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  intelligence_rows: intelligenceRows.length,
  risk_snapshot_id: risk.snapshotId,
  source_network_status: sourceNetworkStatus,
  paid_output_readiness: paidOutputReadiness,
  commercial_source_rights_rows: sourceRightsSnapshot.length,
  b2_objects_verified: proofEntries.length + 1,
}));
