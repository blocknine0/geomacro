#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const limit = Number(process.env.B2_COLD_EVENT_LIMIT ?? 100);
if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("B2_COLD_EVENT_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive",
});
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 60_000).toISOString();

const { data: candidates, error: candidateError } = await db.rpc("geomacro_next_cold_structured_events_v1", { p_limit: limit });
if (candidateError) throw candidateError;
const events = (candidates ?? [])
  .map((row) => row.event)
  .filter((event) => event && Date.parse(String(event.last_seen_at ?? "")) < Date.parse(cutoff));
if (!events.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0 }));
  process.exit(0);
}

const eventIds = events.map((event) => String(event.id));
const { data: evidence, error: evidenceError } = await db
  .from("live_structured_event_evidence")
  .select("*")
  .in("event_id", eventIds);
if (evidenceError) throw evidenceError;
const { data: corroborations, error: corroborationError } = await db
  .from("live_flash_corroborations")
  .select("*")
  .in("structured_event_id", eventIds);
if (corroborationError) throw corroborationError;

const evidenceByEvent = new Map();
for (const row of evidence ?? []) {
  const id = String(row.event_id);
  const list = evidenceByEvent.get(id) ?? [];
  list.push(row);
  evidenceByEvent.set(id, list);
}
const corroborationByEvent = new Map();
for (const row of corroborations ?? []) {
  const id = String(row.structured_event_id);
  const list = corroborationByEvent.get(id) ?? [];
  list.push(row);
  corroborationByEvent.set(id, list);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${randomUUID()}`;
const bundleKey = `geomacro-evidence/v1/structured-events/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/structured-events/proofs/${bundleId}.json`;
const deletionKey = `geomacro-evidence/v1/index/structured-events/deleted/${bundleId}.json`;
const indexKey = "geomacro-evidence/v1/index/structured-events/latest.json.gz";

const entries = events.map((event) => ({
  event,
  evidence: evidenceByEvent.get(String(event.id)) ?? [],
  corroborations: corroborationByEvent.get(String(event.id)) ?? [],
}));
const bundle = {
  schema: "geomacro.structured-event-bundle.v1",
  bundle_id: bundleId,
  created_at: new Date().toISOString(),
  cutoff,
  entries,
};
const packed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
if (packed.length > 18_000_000) throw new Error("B2_COLD_EVENT_BUNDLE_TOO_LARGE");
const bundleSha = sha(packed);
await b2.put(bundleKey, packed);
const readback = await b2.get(bundleKey);
if (readback.length !== packed.length || sha(readback) !== bundleSha) throw new Error("B2_COLD_EVENT_BUNDLE_READBACK_INVALID");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== bundle.schema || restored?.bundle_id !== bundleId || restored?.entries?.length !== entries.length) {
  throw new Error("B2_COLD_EVENT_BUNDLE_RESTORE_INVALID");
}
const restoredIds = new Set(restored.entries.map((entry) => String(entry.event?.id ?? "")));
if (eventIds.some((id) => !restoredIds.has(id))) throw new Error("B2_COLD_EVENT_MEMBER_SET_INVALID");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.structured-event-bundle-proof.v1",
  bundle_id: bundleId,
  archive_key: bundleKey,
  bundle_sha256: bundleSha,
  member_count: entries.length,
  evidence_count: (evidence ?? []).length,
  corroboration_count: (corroborations ?? []).length,
  verified_at: new Date().toISOString(),
  event_ids: eventIds,
}));
await b2.put(proofKey, proof);
const proofReadback = await b2.get(proofKey);
if (sha(proofReadback) !== sha(proof)) throw new Error("B2_COLD_EVENT_PROOF_READBACK_INVALID");

let index = { schema: "geomacro.structured-event-index.v1", updated_at: null, entries: {} };
try {
  const existingCompressed = await b2.get(indexKey);
  const existing = JSON.parse(gunzipSync(existingCompressed).toString("utf8"));
  if (existing?.schema === index.schema && existing?.entries && typeof existing.entries === "object") index = existing;
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!message.includes("B2_GET_FAILED_404")) throw cause;
}
for (const id of eventIds) index.entries[id] = { bundle_key: bundleKey, bundle_sha256: bundleSha };
index.updated_at = new Date().toISOString();
const indexPacked = gzipSync(Buffer.from(JSON.stringify(index)), { level: 9 });
await b2.put(indexKey, indexPacked);
const indexReadback = await b2.get(indexKey);
if (sha(indexReadback) !== sha(indexPacked)) throw new Error("B2_COLD_EVENT_INDEX_READBACK_INVALID");

const deleteItems = events.map((event) => ({
  id: String(event.id),
  updated_at: String(event.updated_at),
  last_seen_at: String(event.last_seen_at),
}));
const { data: deleted, error: deleteError } = await db.rpc("geomacro_delete_verified_cold_structured_events_v1", {
  p_cutoff: cutoff,
  p_items: deleteItems,
});
if (deleteError || !Array.isArray(deleted) || deleted.length !== events.length) {
  throw deleteError ?? new Error("B2_COLD_EVENT_DELETE_UNCONFIRMED");
}
const deletedIds = new Set(deleted.map((row) => String(row.event_id)));
if (eventIds.some((id) => !deletedIds.has(id))) throw new Error("B2_COLD_EVENT_DELETE_SET_MISMATCH");

const deletionProof = Buffer.from(JSON.stringify({
  schema: "geomacro.structured-event-source-deletion.v1",
  bundle_id: bundleId,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  deleted_event_ids: eventIds,
  deleted_at: new Date().toISOString(),
}));
await b2.put(deletionKey, deletionProof);

console.log(JSON.stringify({
  ok: true,
  status: events.length < limit ? "complete" : "progress",
  processed: events.length,
  evidence_archived: (evidence ?? []).length,
  corroborations_archived: (corroborations ?? []).length,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  delete_after_full_b2_readback: true,
}));
