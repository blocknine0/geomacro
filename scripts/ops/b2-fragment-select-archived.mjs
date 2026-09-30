#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !role) throw new Error("SUPABASE_CONFIG_REQUIRED");
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from("live_fragment_archive_locations")
  .select("fragment_id,verified_at,source_deleted_at")
  .order("verified_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (error) throw error;
if (!data?.fragment_id) throw new Error("NO_ARCHIVED_FRAGMENT_AVAILABLE");
console.log(String(data.fragment_id));
