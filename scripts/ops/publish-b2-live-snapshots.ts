#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { readPublicIntelligenceRowsFromSupabase } from "../../src/lib/public-intelligence.functions";
import { readPublicGlobalRisk } from "../../src/lib/global-risk-read.server";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const INTELLIGENCE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const RISK_KEY = "geomacro-evidence/v1/live/risk-indices/latest.json.gz";
const SOURCE_NETWORK_KEY = "geomacro-evidence/v1/live/source-network-status/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/live-snapshot-proof.json";
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

if (
  process.env.APP_SUPABASE_URL !== "https://ldpwajisioljyjtojvfx.supabase.co" ||
  !process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) throw new Error("B2_LIVE_PUBLISH_CONFIG_REQUIRED");

const supabase = createClient(
  process.env.APP_SUPABASE_URL,
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
);

const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const generatedAt = new Date().toISOString();
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

const { data: sourceNetworkStatus, error: sourceNetworkError } = await supabase
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
  b2_objects_verified: proofEntries.length + 1,
}));
