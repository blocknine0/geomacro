#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const sourceKeys = String(process.env.RECONCILE_SOURCE_KEYS ?? "gdelt_gal,gdelt_v2,open_realtime_source_mesh,country_raw_web_mesh")
  .split(",").map((value) => value.trim()).filter(Boolean);
const lookbackMinutes = Math.max(15, Math.min(720, Number(process.env.RECONCILE_LOOKBACK_MINUTES ?? 120)));

if (!url || !key) throw new Error("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const { data: fragments, error: fragmentError } = await db
    .from("live_fragment_manifest")
    .select("id,source_key,sealed_at")
    .in("source_key", sourceKeys)
    .gte("sealed_at", since)
    .order("sealed_at", { ascending: false })
    .limit(200);
  if (fragmentError) throw fragmentError;

  const fragmentIds = [...new Set((fragments ?? []).map((row) => row.id).filter(Boolean))];
  if (!fragmentIds.length) {
    console.log(JSON.stringify({ ok: true, fragment_count: 0, event_count: 0, updated: 0 }, null, 2));
    return;
  }

  const { data: evidence, error: evidenceError } = await db
    .from("live_structured_event_evidence")
    .select("event_id,fragment_id")
    .in("fragment_id", fragmentIds);
  if (evidenceError) throw evidenceError;

  const eventIds = [...new Set((evidence ?? []).map((row) => row.event_id).filter(Boolean))];
  let updated = 0;

  for (let offset = 0; offset < eventIds.length; offset += 100) {
    const chunk = eventIds.slice(offset, offset + 100);
    const { data: rights, error: rightsError } = await db
      .from("live_structured_event_commercial_rights_evaluation")
      .select("event_id,evaluated_status,reason_codes")
      .in("event_id", chunk);
    if (rightsError) throw rightsError;

    for (const row of rights ?? []) {
      const { error } = await db.from("live_structured_events")
        .update({
          commercial_eligibility_status: row.evaluated_status,
          commercial_eligibility_reason_codes: row.reason_codes ?? [],
        })
        .eq("id", row.event_id);
      if (error) throw error;
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    fragment_count: fragmentIds.length,
    event_count: eventIds.length,
    updated,
    lookback_minutes: lookbackMinutes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
