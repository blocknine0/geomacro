#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const env = (name) => {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const db = createClient(env("APP_SUPABASE_URL"), env("APP_SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const expected = {
  eia_api_v2: { minRows: 1, commercial: false },
  noaa_ncei_cdo_api: { minRows: 1, commercial: false },
};

for (const [sourceId, rule] of Object.entries(expected)) {
  const { count, error } = await db
    .from("live_external_observations")
    .select("observation_id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw error;
  if ((count ?? 0) < rule.minRows) {
    throw new Error(`Persistence check failed for ${sourceId}: count=${count ?? 0}`);
  }

  const { data: rows, error: rowError } = await db
    .from("live_external_observations")
    .select("observation_id,source_id,normalized_hash,quality_status,commercial_eligibility_status,observed_at")
    .eq("source_id", sourceId)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (rowError) throw rowError;

  const ids = new Set();
  const hashes = new Set();
  for (const row of rows ?? []) {
    if (ids.has(row.observation_id)) throw new Error(`Duplicate observation_id detected for ${sourceId}`);
    if (hashes.has(row.normalized_hash)) throw new Error(`Duplicate normalized_hash detected for ${sourceId}`);
    ids.add(row.observation_id);
    hashes.add(row.normalized_hash);
    if (row.quality_status !== "VERIFIED") {
      throw new Error(`Unexpected quality_status for ${sourceId}: ${row.quality_status}`);
    }
    if (row.commercial_eligibility_status !== "UNVERIFIED") {
      throw new Error(`Commercial eligibility was promoted for ${sourceId}: ${row.commercial_eligibility_status}`);
    }
  }

  const { data: registry, error: registryError } = await db
    .from("live_external_sources")
    .select("source_id,enabled_for_ingestion,enabled_for_commercial_signals,commercial_usage_status")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (registryError) throw registryError;
  if (!registry?.enabled_for_ingestion) throw new Error(`Registry ingestion disabled for ${sourceId}`);
  if (registry.enabled_for_commercial_signals !== rule.commercial) {
    throw new Error(`Registry commercial-signal state unsafe for ${sourceId}`);
  }

  console.log(JSON.stringify({
    source_id: sourceId,
    persisted_rows: count ?? 0,
    checked_rows: (rows ?? []).length,
    unique_observation_ids: ids.size,
    unique_normalized_hashes: hashes.size,
    quality_status: "VERIFIED",
    commercial_eligibility_status: "UNVERIFIED",
    enabled_for_ingestion: registry.enabled_for_ingestion,
    enabled_for_commercial_signals: registry.enabled_for_commercial_signals,
    commercial_usage_status: registry.commercial_usage_status,
    status: "PASS",
  }));
}

console.log(JSON.stringify({ status: "PASS", audited_sources: Object.keys(expected) }));
