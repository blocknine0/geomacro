import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  HOT_TOPIC_FAMILIES,
  HOT_TOPIC_FAMILY_DEFINITIONS,
  HOT_TOPIC_TAXONOMY_VERSION,
  classifyHotTopicEvent,
  type HotTopicFamily,
} from "../src/lib/hot-topic-taxonomy";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "gdelt_gal";
const STREAM_KEY = "global-relevant";
const PIPELINE_MAX_LAG_SECONDS = 30 * 60;
const MAX_LOOKBACK_SECONDS = Math.max(
  ...HOT_TOPIC_FAMILIES.map(
    (family) => HOT_TOPIC_FAMILY_DEFINITIONS[family].default_max_age_seconds,
  ),
);
const DELIVERABLE = new Set(["VERIFIED", "DERIVED_ONLY"]);
const OUTPUT =
  process.env.HOT_TOPIC_FAMILY_READINESS_OUTPUT ??
  "hot-topic-family-readiness.json";

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

async function fetchAll(
  db: ReturnType<typeof createClient>,
  table: string,
  select: string,
  configure?: (query: any) => any,
) {
  const pageSize = 1_000;
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

function normalizeCountries(row: Record<string, unknown>) {
  const result = new Set<string>();
  const primary = String(row.primary_country ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(primary)) result.add(primary);
  for (const raw of Array.isArray(row.countries) ? row.countries : []) {
    const iso3 = String(raw).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) result.add(iso3);
  }
  return [...result].sort();
}

function asEventInput(row: Record<string, unknown>) {
  return {
    event_type: row.event_type == null ? null : String(row.event_type),
    title: row.title == null ? null : String(row.title),
    summary: row.summary == null ? null : String(row.summary),
    domain: row.domain == null ? null : String(row.domain),
  };
}

async function main() {
  const url = String(
    process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  ).trim();
  const key = String(
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();
  if (!url || !key) {
    throw new Error("Authoritative Supabase server credentials are required");
  }
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("Supabase URL is not the authoritative Geomacro project");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - MAX_LOOKBACK_SECONDS * 1_000,
  ).toISOString();

  const { data: cursor, error: cursorError } = await db
    .from("live_ingestion_cursors")
    .select("status,last_success_at,last_item_at,consecutive_failures")
    .eq("source_key", SOURCE_KEY)
    .eq("stream_key", STREAM_KEY)
    .maybeSingle();
  if (cursorError) throw cursorError;

  const lastSuccessMs = cursor?.last_success_at
    ? Date.parse(String(cursor.last_success_at))
    : NaN;
  const pipelineLagSeconds = Number.isFinite(lastSuccessMs)
    ? Math.max(0, Math.floor((now.getTime() - lastSuccessMs) / 1_000))
    : null;
  const pipelineHealthy =
    cursor?.status === "healthy" &&
    pipelineLagSeconds !== null &&
    pipelineLagSeconds <= PIPELINE_MAX_LAG_SECONDS;

  const registry = await fetchAll(
    db,
    "live_country_registry",
    "iso3,enabled",
    (q) => q.eq("enabled", true).order("iso3"),
  );
  const enabledCountries = new Set(
    registry
      .map((row) => String(row.iso3 ?? "").trim().toUpperCase())
      .filter((iso3) => /^[A-Z]{3}$/.test(iso3)),
  );

  const events = await fetchAll(
    db,
    "live_structured_events",
    "id,story_key,domain,event_type,title,summary,primary_country,countries,status,last_seen_at,last_observed_at,commercial_eligibility_status,evidence_count,independent_source_count,structure_version,classification_version",
    (q) =>
      q
        .gte("last_observed_at", cutoff)
        .lte("last_observed_at", now.toISOString())
        .in("status", ["active", "monitoring"])
        .order("last_observed_at", { ascending: false }),
  );

  const perFamily = new Map<
    HotTopicFamily,
    {
      family: HotTopicFamily;
      label: string;
      max_age_seconds: number;
      matched_event_count: number;
      commercially_deliverable_event_count: number;
      blocked_event_count: number;
      countries_with_signal: Set<string>;
      countries_with_deliverable_signal: Set<string>;
      latest_event_at: string | null;
      minimum_evidence_count: number | null;
      minimum_independent_source_count: number | null;
    }
  >();

  for (const family of HOT_TOPIC_FAMILIES) {
    const definition = HOT_TOPIC_FAMILY_DEFINITIONS[family];
    perFamily.set(family, {
      family,
      label: definition.label,
      max_age_seconds: definition.default_max_age_seconds,
      matched_event_count: 0,
      commercially_deliverable_event_count: 0,
      blocked_event_count: 0,
      countries_with_signal: new Set(),
      countries_with_deliverable_signal: new Set(),
      latest_event_at: null,
      minimum_evidence_count: null,
      minimum_independent_source_count: null,
    });
  }

  let unclassifiedCurrentEventCount = 0;
  let futureTimestampEventCount = 0;
  for (const raw of events) {
    const row = raw as Record<string, unknown>;
    const lastObservedAt = String(row.last_observed_at ?? "");
    const lastObservedMs = Date.parse(lastObservedAt);
    if (!Number.isFinite(lastObservedMs)) continue;
    if (lastObservedMs > now.getTime()) {
      futureTimestampEventCount += 1;
      continue;
    }

    const families = classifyHotTopicEvent(asEventInput(row));
    if (families.length === 0) unclassifiedCurrentEventCount += 1;
    const status = String(row.commercial_eligibility_status ?? "UNVERIFIED");
    const countries = normalizeCountries(row).filter((iso3) =>
      enabledCountries.has(iso3),
    );
    const evidenceCount = Number(row.evidence_count ?? 0);
    const independentSourceCount = Number(row.independent_source_count ?? 0);

    for (const family of families) {
      const item = perFamily.get(family)!;
      const ageSeconds = Math.max(0, (now.getTime() - lastObservedMs) / 1_000);
      if (ageSeconds > item.max_age_seconds) continue;

      item.matched_event_count += 1;
      if (DELIVERABLE.has(status)) {
        item.commercially_deliverable_event_count += 1;
        for (const iso3 of countries) item.countries_with_deliverable_signal.add(iso3);
      } else {
        item.blocked_event_count += 1;
      }
      for (const iso3 of countries) item.countries_with_signal.add(iso3);
      if (!item.latest_event_at || lastObservedAt > item.latest_event_at) {
        item.latest_event_at = lastObservedAt;
      }
      item.minimum_evidence_count =
        item.minimum_evidence_count === null
          ? evidenceCount
          : Math.min(item.minimum_evidence_count, evidenceCount);
      item.minimum_independent_source_count =
        item.minimum_independent_source_count === null
          ? independentSourceCount
          : Math.min(item.minimum_independent_source_count, independentSourceCount);
    }
  }

  const families = HOT_TOPIC_FAMILIES.map((family) => {
    const item = perFamily.get(family)!;
    const definition = HOT_TOPIC_FAMILY_DEFINITIONS[family];
    const readiness = !pipelineHealthy
      ? "PIPELINE_NOT_READY"
      : item.matched_event_count === 0
        ? "CAPABILITY_READY_NO_CURRENT_SIGNAL"
        : item.commercially_deliverable_event_count === 0
          ? "CURRENT_SIGNAL_BLOCKED_COMMERCIAL_RIGHTS"
          : item.blocked_event_count > 0
            ? "CAPABILITY_READY_WITH_EXCLUSIONS"
            : "CAPABILITY_READY_WITH_SIGNAL";
    return {
      family,
      label: item.label,
      taxonomy_supported: true,
      event_detection_source: definition.event_detection_source,
      authoritative_confirmation: definition.authoritative_confirmation,
      max_age_seconds: item.max_age_seconds,
      readiness,
      matched_event_count: item.matched_event_count,
      commercially_deliverable_event_count:
        item.commercially_deliverable_event_count,
      blocked_event_count: item.blocked_event_count,
      countries_with_signal_count: item.countries_with_signal.size,
      countries_with_commercially_deliverable_signal_count:
        item.countries_with_deliverable_signal.size,
      latest_event_at: item.latest_event_at,
      minimum_evidence_count: item.minimum_evidence_count,
      minimum_independent_source_count: item.minimum_independent_source_count,
      notes: definition.notes,
    };
  });

  const report = {
    schema_version: "geomacro-hot-topic-family-readiness-1.0",
    taxonomy_version: HOT_TOPIC_TAXONOMY_VERSION,
    generated_at: now.toISOString(),
    writes_performed: false,
    source_pipeline: {
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
    summary: {
      governed_family_count: HOT_TOPIC_FAMILIES.length,
      taxonomy_supported_family_count: families.filter(
        (item) => item.taxonomy_supported,
      ).length,
      families_with_current_signal: families.filter(
        (item) => item.matched_event_count > 0,
      ).length,
      families_with_commercially_deliverable_current_signal: families.filter(
        (item) => item.commercially_deliverable_event_count > 0,
      ).length,
      families_with_only_blocked_current_signal: families.filter(
        (item) =>
          item.matched_event_count > 0 &&
          item.commercially_deliverable_event_count === 0,
      ).length,
      unclassified_current_event_count: unclassifiedCurrentEventCount,
      future_timestamp_event_count: futureTimestampEventCount,
      enabled_country_count: enabledCountries.size,
    },
    families,
    claim_boundary: {
      all_governed_families_have_deterministic_classification_contract: true,
      family_without_current_signal_can_return_truthful_no_signal_only_when_pipeline_healthy: true,
      no_current_signal_is_not_zero_risk: true,
      raw_article_or_publisher_material_redistributed: false,
      event_detection_does_not_substitute_for_required_structural_module: true,
      structural_or_authoritative_confirmation_must_pass_separate_deliverability_gate_when_requested: true,
      blocked_rights_current_signal_is_not_chargeable_for_that_family: true,
      corridor_event_detection_does_not_claim_direct_route_modeling: true,
      this_audit_does_not_claim_all_world_events_are_observed: true,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        taxonomy_version: report.taxonomy_version,
        generated_at: report.generated_at,
        source_pipeline: report.source_pipeline,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
  console.log(`HOT_TOPIC_FAMILY_READINESS_OUTPUT=${OUTPUT}`);

  if (process.argv.includes("--require-pipeline-healthy") && !pipelineHealthy) {
    throw new Error("Hot-topic pipeline is not healthy/fresh enough for family readiness");
  }
  if (
    process.argv.includes("--require-taxonomy-complete") &&
    report.summary.taxonomy_supported_family_count !== HOT_TOPIC_FAMILIES.length
  ) {
    throw new Error("Not every governed hot-topic family has a taxonomy contract");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
