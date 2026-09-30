#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !role) throw new Error("SUPABASE_CONFIG_REQUIRED");
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const cutoff = new Date(Date.now() - 168 * 3600_000).toISOString();
const [{ count: oldFragments, error: fErr }, { count: archived, error: aErr }, { count: deleted, error: dErr }] = await Promise.all([
  db.from("live_fragment_manifest").select("*", { count: "exact", head: true }).lte("period_end", cutoff),
  db.from("live_fragment_archive_locations").select("*", { count: "exact", head: true }),
  db.from("live_fragment_archive_locations").select("*", { count: "exact", head: true }).not("source_deleted_at", "is", null),
]);
if (fErr || aErr || dErr) throw new Error("RECOVERY_STATUS_QUERY_FAILED");
console.log(JSON.stringify({ ok: true, older_than_7d: oldFragments ?? 0, archived: archived ?? 0, source_deleted_verified: deleted ?? 0 }));
