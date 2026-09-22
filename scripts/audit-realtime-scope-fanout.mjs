import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const MAX_GDELT_LAG_SECONDS = 30 * 60;
const MAX_DIRECT_LAG_SECONDS = 20 * 60;

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function ageSeconds(value, now) {
  const ts = Date.parse(String(value ?? ""));
  return Number.isFinite(ts) ? Math.max(0, (now - ts) / 1000) : Number.POSITIVE_INFINITY;
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...details }, null, 2));
  process.exit(1);
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) fail("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
  if (projectRef(url) !== PROJECT_REF) fail("NON_AUTHORITATIVE_SUPABASE_PROJECT");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const [statusQ, corridorsQ, shocksQ, targetsQ, cursorQ] = await Promise.all([
    db.from("live_realtime_scope_100_status").select("*").single(),
    db.from("live_strategic_corridor_catalog").select("corridor_id"),
    db.from("live_global_shock_taxonomy").select("shock_id").eq("required", true),
    db.from("live_realtime_scope_targets")
      .select("target_id,scope_type,scope_code,category,transport,activation_mode,last_success_at,last_attempt_at,discovery_state,consecutive_failures,live_external_sources!inner(enabled_for_ingestion)")
      .eq("enabled", true)
      .eq("live_external_sources.enabled_for_ingestion", true),
    db.from("live_ingestion_cursors")
      .select("source_key,stream_key,last_success_at,status")
      .eq("source_key", "gdelt_gal").eq("stream_key", "global-relevant").maybeSingle(),
  ]);
  if (statusQ.error) fail("STATUS_VIEW_READ_FAILED", { detail: statusQ.error.message });
  if (corridorsQ.error) fail("CORRIDOR_CATALOG_READ_FAILED", { detail: corridorsQ.error.message });
  if (shocksQ.error) fail("HOT_TOPIC_CATALOG_READ_FAILED", { detail: shocksQ.error.message });
  if (targetsQ.error) fail("TARGET_READ_FAILED", { detail: targetsQ.error.message });
  if (cursorQ.error) fail("GDELT_CURSOR_READ_FAILED", { detail: cursorQ.error.message });

  const corridors = new Set((corridorsQ.data ?? []).map((r) => String(r.corridor_id)));
  const shocks = new Set((shocksQ.data ?? []).map((r) => String(r.shock_id)));
  const targets = targetsQ.data ?? [];
  const burstTargets = targets.filter((t) => t.transport === "GDELT_BURST");
  const directTargets = targets.filter((t) => t.transport === "WEB_DIRECT");

  const requiredByScope = (scopeType, expected) => {
    const missing = [];
    for (const scopeCode of expected) {
      const cats = new Set(
        burstTargets.filter((t) => t.scope_type === scopeType && t.scope_code === scopeCode).map((t) => t.category),
      );
      for (const category of ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]) {
        if (!cats.has(category)) missing.push({ scope_type: scopeType, scope_code: scopeCode, category });
      }
    }
    return missing;
  };

  const missingCorridor = requiredByScope("CORRIDOR", corridors);
  const missingHot = requiredByScope("HOT_TOPIC", shocks);
  const directStale = directTargets
    .filter((t) => ageSeconds(t.last_success_at, now) > Math.min(MAX_DIRECT_LAG_SECONDS, Number(t.activation_mode === "CONTINUOUS" ? 20 * 60 : MAX_DIRECT_LAG_SECONDS)))
    .map((t) => ({
      target_id: t.target_id,
      last_success_at: t.last_success_at,
      age_seconds: Number.isFinite(ageSeconds(t.last_success_at, now)) ? Math.round(ageSeconds(t.last_success_at, now)) : null,
      discovery_state: t.discovery_state,
      consecutive_failures: t.consecutive_failures,
    }));

  const gdeltLag = ageSeconds(cursorQ.data?.last_success_at, now);
  const view = statusQ.data;
  const result = {
    ok: true,
    generated_at: nowIso,
    contract: {
      view_contract_complete: Boolean(view?.realtime_scope_contract_100_complete),
      corridors: corridors.size,
      corridor_burst_targets: burstTargets.filter((t) => t.scope_type === "CORRIDOR").length,
      corridor_target_expected: corridors.size * 3,
      hot_topics: shocks.size,
      hot_topic_burst_targets: burstTargets.filter((t) => t.scope_type === "HOT_TOPIC").length,
      hot_topic_target_expected: shocks.size * 3,
      missing_corridor_category_targets: missingCorridor,
      missing_hot_topic_category_targets: missingHot,
    },
    global_first_break_backbone: {
      source_key: "gdelt_gal",
      stream_key: "global-relevant",
      last_success_at: cursorQ.data?.last_success_at ?? null,
      lag_seconds: Number.isFinite(gdeltLag) ? Math.round(gdeltLag) : null,
      healthy: Boolean(cursorQ.data?.last_success_at) && gdeltLag <= MAX_GDELT_LAG_SECONDS && ["healthy", "degraded"].includes(String(cursorQ.data?.status ?? "")),
    },
    direct_operational_sources: {
      target_count: directTargets.length,
      stale_targets: directStale,
      healthy_target_count: Math.max(0, directTargets.length - directStale.length),
      healthy:
        directTargets.length === 0 ||
        directStale.length < directTargets.length,
      degraded:
        directTargets.length > 0 &&
        directStale.length > 0 &&
        directStale.length < directTargets.length,
    },
    runtime_model: {
      first_break_source: "gdelt_gal",
      scope_response: "new_structured_event -> country/corridor/hot-topic match -> GDELT 15m burst",
      direct_authority_surfaces: directTargets.map((t) => t.target_id),
      total_event_capture_claim: false,
    },
  };

  if (
    !result.contract.view_contract_complete ||
    missingCorridor.length ||
    missingHot.length ||
    !result.global_first_break_backbone.healthy ||
    !result.direct_operational_sources.healthy
  ) {
    fail("REALTIME_SCOPE_MESH_NOT_READY", result);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => fail("UNEXPECTED_ERROR", { detail: error instanceof Error ? error.message : String(error) }));
