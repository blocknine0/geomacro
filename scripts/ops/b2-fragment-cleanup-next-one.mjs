#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const minAgeHours = Math.max(24, Math.min(24 * 365, Number(process.env.B2_FRAGMENT_MIN_AGE_HOURS ?? 168)));
const scanLimit = Math.max(1, Math.min(250, Number(process.env.B2_FRAGMENT_SCAN_LIMIT ?? 120)));

if (url !== PROJECT_URL || !role || !Number.isInteger(scanLimit)) throw new Error("B2_FRAGMENT_NEXT_ONE_CONFIG_INVALID");
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const cutoff = new Date(Date.now() - minAgeHours * 3600_000).toISOString();

async function count(table, fragmentId) {
  const { count: value, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId);
  if (error) throw new Error(`B2_FRAGMENT_NEXT_ONE_COUNT_FAILED_${table}_${error.code ?? "unknown"}`);
  return Number(value ?? 0);
}

const { data: manifests, error: manifestError } = await db.from("live_fragment_manifest")
  .select("id,object_path,item_count,compressed_bytes,period_end")
  .eq("storage_bucket", SOURCE_BUCKET)
  .like("object_path", "live/v1/%")
  .lte("period_end", cutoff)
  .order("period_end", { ascending: true })
  .limit(scanLimit);
if (manifestError) throw manifestError;

let selected = null;
for (const row of manifests ?? []) {
  if (!/^[0-9a-f-]{36}$/i.test(String(row.id ?? "")) || !/^live\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(String(row.object_path ?? ""))) continue;
  const { data: archive, error: archiveError } = await db.from("live_fragment_archive_locations")
    .select("source_deleted_at").eq("fragment_id", row.id).maybeSingle();
  if (archiveError) throw archiveError;
  if (archive?.source_deleted_at) continue;
  const evidence = await count("live_structured_event_evidence", row.id);
  const excluded = await count("live_structuring_exclusions", row.id);
  const itemCount = Number(row.item_count ?? -1);
  if (!Number.isInteger(itemCount) || itemCount < 0 || evidence + excluded < itemCount) continue;
  selected = { id: row.id, item_count: itemCount, handled_count: evidence + excluded, bytes: Number(row.compressed_bytes ?? 0) };
  break;
}

if (!selected) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, reason: "no_fully_handled_old_fragment_in_scan_window", cutoff, scan_limit: scanLimit }));
  process.exit(0);
}

console.log(JSON.stringify({ ok: true, status: "selected", fragment_id: selected.id, item_count: selected.item_count,
  handled_count: selected.handled_count, bytes: selected.bytes, cutoff, scan_limit: scanLimit }));
const child = spawnSync(process.execPath, ["scripts/ops/b2-fragment-targeted-cleanup.mjs"], {
  env: { ...process.env, B2_FRAGMENT_TARGET_ID: selected.id, B2_FRAGMENT_TARGET_DELETE: "1", B2_FRAGMENT_MIN_AGE_HOURS: String(minAgeHours) },
  stdio: "inherit",
});
if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status ?? 1);
