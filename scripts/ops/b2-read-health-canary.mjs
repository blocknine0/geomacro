#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const BUCKET = "geomacro-private-archive";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (url !== PROJECT_URL || !role) throw new Error("B2_READ_HEALTH_CONFIG_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const { data: rows, error } = await db
  .from("live_structured_events")
  .select("id,structured_payload")
  .contains("structured_payload", { _archive: { v: 2 } })
  .order("last_seen_at", { ascending: true })
  .limit(1);
if (error) throw new Error(`B2_READ_HEALTH_POINTER_QUERY_FAILED_${error.code ?? "unknown"}`);
const row = rows?.[0];
const pointer = row?.structured_payload?._archive;
if (!row?.id || pointer?.v !== 2 || typeof pointer?.k !== "string" || !/^[0-9a-f]{64}$/.test(String(pointer?.a ?? ""))) {
  throw new Error("B2_READ_HEALTH_POINTER_INVALID");
}

const body = await b2.get(pointer.k);
if (sha256(body) !== pointer.a) throw new Error("B2_READ_HEALTH_HASH_INVALID");
console.log(JSON.stringify({
  ok: true,
  event_id: row.id,
  archive_key: pointer.k,
  archive_sha256: pointer.a,
  read_bytes: body.length,
  full_b2_readback_verified: true,
  mutation_performed: false,
}));
