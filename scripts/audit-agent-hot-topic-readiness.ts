import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "gdelt_gal";
const STREAM_KEY = "global-relevant";
const LOOKBACK_SECONDS = 2 * 86_400;
const PIPELINE_MAX_LAG_SECONDS = 30 * 60;
const OUTPUT = process.env.AGENT_HOT_TOPIC_READINESS_OUTPUT ?? "agent-hot-topic-readiness.json";
const DELIVERABLE = new Set(["VERIFIED", "DERIVED_ONLY"]);

function projectRef(url: string) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function normalizeCountries(row: Record<string, unknown>) {
  const result = new Set<string>();
  const primary = String(row.primary_country ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(primary)) result.add(primary);
  for (const raw of Array.isArray(row.countries) ? row.countries : []) {
    const iso3 = String(raw).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) result.add(iso3);
  }
  return result;
}

async function fetchAll(db: ReturnType<typeof createClient>, table: string, select: string, configure?: (query: any) => any) {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    let query: any = db.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Supabase URL is not the authoritative Geomacro project");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_SECONDS * 1000).toISOString();

  const registry = await fetchAll(db, "live_country_registry", "iso3,country_name,enabled", (q) => q.eq("enabled", true).order("iso3"));
  const registrySet = new Set(registry.map((row) => String(row.iso3)));

  const { data: cursor, error: cursorError } = await db
    .from("live_ingestion_cursors")
    .select("status,last_success_at,last_item_at,consecutive_failures")
    .eq("source_key", SOURCE_KEY)
    .eq("stream_key", STREAM_KEY)
    .maybeSingle();
  if (cursorError) throw cursorError;
  const lastSuccessMs = cursor?.last_success_at ? Date.parse(String(cursor.last_success_at)) : NaN;
  const pipelineLagSeconds = Number.isFinite(lastSuccessMs) ? Math.max(0, Math.floor((now.getTime() - lastSuccessMs) / 1000)) : null;
  const pipelineHealthy = cursor?.status === "healthy" && pipelineLagSeconds !== null && pipelineLagSeconds <= PIPELINE_MAX_LAG_SECONDS;

  const events = await fetchAll(
    db,
    "live_structured_events",
    "id,story_key,primary_country,countries,status,last_seen_at,last_observed_at,commercial_eligibility_status,commercial_eligibility_reason_codes,evidence_count,independent_source_count",
    (q) => q.gte("last_observed_at", cutoff).lte("last_observed_at", now.toISOString()).in("status", ["active", "monitoring"]).order("last_observed_at", { ascending: false }),
  );

  const perCountry = new Map<string, {
    iso3: string;
    country_name: string;
    total_current_events: number;
    deliverable_events: number;
    blocked_events: number;
    verified_events: number;
    derived_only_events: number;
    latest_event_at: string | null;
  }>();
  for (const row of registry) {
    perCountry.set(String(row.iso3), {
      iso3: String(row.iso3),
      country_name: String(row.country_name ?? row.iso3),
      total_current_events: 0,
      deliverable_events: 0,
      blocked_events: 0,
      verified_events: 0,
      derived_only_events: 0,
      latest_event_at: null,
    });
  }

  const rightsCounts: Record<string, number> = {};
  let unattributedEvents = 0;
  for (const raw of events) {
    const row = raw as Record<string, unknown>;
    const status = String(row.commercial_eligibility_status ?? "UNVERIFIED");
    rightsCounts[status] = (rightsCounts[status] ?? 0) + 1;
    const touched = [...normalizeCountries(row)].filter((iso3) => registrySet.has(iso3));
    if (touched.length === 0) unattributedEvents += 1;
    for (const iso3 of touched) {
      const item = perCountry.get(iso3)!;
      item.total_current_events += 1;
      if (DELIVERABLE.has(status)) item.deliverable_events += 1;
      else item.blocked_events += 1;
      if (status === "VERIFIED") item.verified_events += 1;
      if (status === "DERIVED_ONLY") item.derived_only_events += 1;
      const lastSeen = String(row.last_seen_at ?? "");
      if (lastSeen && (!item.latest_event_at || lastSeen > item.latest_event_at)) item.latest_event_at = lastSeen;
    }
  }

  const countries = [...perCountry.values()].map((item) => ({
    ...item,
    hot_topic_availability: !pipelineHealthy
      ? "PIPELINE_NOT_READY"
      : item.total_current_events === 0
        ? "AVAILABLE_NO_CURRENT_SIGNAL"
        : item.deliverable_events === 0
          ? "INSUFFICIENT_COMMERCIAL_COVERAGE"
          : item.blocked_events > 0
            ? "AVAILABLE_WITH_EXCLUSIONS"
            : "AVAILABLE",
  }));

  const summary = {
    enabled_country_count: countries.length,
    countries_with_any_current_signal: countries.filter((row) => row.total_current_events > 0).length,
    countries_with_commercially_deliverable_signal: countries.filter((row) => row.deliverable_events > 0).length,
    countries_only_blocked_current_signal: countries.filter((row) => row.total_current_events > 0 && row.deliverable_events === 0).length,
    countries_without_current_signal: countries.filter((row) => row.total_current_events === 0).length,
    recent_event_count: events.length,
    commercially_deliverable_event_count: events.filter((row) => DELIVERABLE.has(String(row.commercial_eligibility_status))).length,
    blocked_event_count: events.filter((row) => !DELIVERABLE.has(String(row.commercial_eligibility_status))).length,
    unattributed_event_count: unattributedEvents,
    commercial_rights_status_counts: rightsCounts,
  };

  const report = {
    schema_version: "geomacro-agent-hot-topic-readiness-1.0",
    generated_at: now.toISOString(),
    lookback_seconds: LOOKBACK_SECONDS,
    pipeline: {
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      status: cursor?.status ?? null,
      last_success_at: cursor?.last_success_at ?? null,
      last_item_at: cursor?.last_item_at ?? null,
      consecutive_failures: cursor?.consecutive_failures ?? null,
      lag_seconds: pipelineLagSeconds,
      max_lag_seconds: PIPELINE_MAX_LAG_SECONDS,
      healthy: pipelineHealthy,
    },
    summary,
    countries,
    claim_boundary: {
      raw_source_material_redistributed: false,
      only_verified_or_derived_only_structured_events_are_deliverable: true,
      no_current_signal_is_not_zero_risk: true,
      current_signal_with_only_blocked_rights_is_not_chargeable_for_hot_topics: true,
      country_without_current_signal_can_return_a_truthful_no_signal_result_only_when_pipeline_is_healthy: true,
      this_report_does_not_claim_all_internet_events_are_observed: true,
    },
    writes_performed: false,
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ generated_at: report.generated_at, pipeline: report.pipeline, summary: report.summary, claim_boundary: report.claim_boundary }, null, 2));
  console.log(`HOT_TOPIC_READINESS_OUTPUT=${OUTPUT}`);

  if (process.argv.includes("--require-pipeline-healthy") && !pipelineHealthy) {
    throw new Error("Hot-topic pipeline is not healthy/fresh enough for paid availability");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
