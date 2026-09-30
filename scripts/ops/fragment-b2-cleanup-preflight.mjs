#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !role) throw new Error("SUPABASE_CONFIG_REQUIRED");
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: rows, error } = await db.from("live_fragment_archive_locations")
  .select("fragment_id,verified_at,source_deleted_at")
  .is("source_deleted_at", null)
  .order("verified_at", { ascending: true })
  .limit(10);
if (error) throw error;
if (!(rows ?? []).length) throw new Error("NO_VERIFIED_ARCHIVE_POINTERS_AVAILABLE");
console.log(JSON.stringify({ ok: true, verified_archive_pointers_available: rows.length, sample_fragment_ids: rows.map(x => x.fragment_id) }));
