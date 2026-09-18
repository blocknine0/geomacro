import type { AgentQueryPlan } from "./agent-query-plan";
import {
  classifyHotTopicEvent,
  inferHotTopicFamiliesFromQuestion,
  type HotTopicFamily,
} from "./hot-topic-taxonomy";
import { requireRiskSupabase } from "./risk-supabase.server";

const HOT_TOPIC_SOURCE_KEY = "gdelt_gal";
const HOT_TOPIC_STREAM_KEY = "global-relevant";
const HOT_TOPIC_PIPELINE_MAX_LAG_SECONDS = 30 * 60;
const MAX_RECENT_ROWS = 500;
const MAX_DELIVERED_EVENTS = 25;
const DELIVERABLE_STATUSES = new Set(["VERIFIED", "DERIVED_ONLY"]);

export type AgentHotTopicEvent = {
  event_id: string;
  story_key: string;
  domain: string;
  event_type: string | null;
  families: HotTopicFamily[];
  title: string;
  summary: string | null;
  primary_country: string | null;
  countries: string[];
  severity: number | null;
  confidence: number | null;
  direction: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  evidence_count: number;
  independent_source_count: number;
  structure_version: string;
  classification_version: string | null;
  commercial_eligibility_status: "VERIFIED" | "DERIVED_ONLY";
  commercial_eligibility_reason_codes: string[];
  delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY";
};

export type AgentHotTopicResult = {
  deliverable: boolean;
  code:
    | "AVAILABLE"
    | "SUBJECT_NOT_REGISTERED"
    | "HOT_TOPIC_PIPELINE_UNHEALTHY"
    | "HOT_TOPIC_PIPELINE_STALE"
    | "HOT_TOPIC_COMMERCIAL_COVERAGE_INSUFFICIENT";
  checked_at: string;
  requested_families: HotTopicFamily[];
  matched_families: HotTopicFamily[];
  source_pipeline: {
    source_key: typeof HOT_TOPIC_SOURCE_KEY;
    stream_key: typeof HOT_TOPIC_STREAM_KEY;
    status: string | null;
    last_success_at: string | null;
    lag_seconds: number | null;
  };
  subject: AgentQueryPlan["subjects"][number];
  current_event_signal: boolean;
  commercially_deliverable_event_count: number;
  excluded_non_deliverable_event_count: number;
  events: AgentHotTopicEvent[];
  limitations: {
    raw_source_material_redistributed: false;
    article_text_redistributed: false;
    no_signal_is_not_zero_risk: true;
    unclassified_events_excluded_from_family_specific_results: true;
    corridor_route_modeling: "ENDPOINT_EXPOSURE_ONLY" | null;
  };
};

type LiveEventRow = {
  id: string;
  story_key: string;
  domain: string;
  event_type: string | null;
  title: string;
  summary: string | null;
  primary_country: string | null;
  countries: string[] | null;
  severity: number | null;
  confidence: number | null;
  direction: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  evidence_count: number | null;
  independent_source_count: number | null;
  structure_version: string;
  classification_version: string | null;
  commercial_eligibility_status: string;
  commercial_eligibility_reason_codes: string[] | null;
};

function subjectCountries(subject: AgentQueryPlan["subjects"][number]) {
  return subject.type === "country"
    ? [subject.country_iso3]
    : [subject.origin_country_iso3, subject.destination_country_iso3];
}

function rowCountries(row: LiveEventRow) {
  const result = new Set<string>();
  if (row.primary_country && /^[A-Z]{3}$/.test(row.primary_country)) result.add(row.primary_country);
  for (const value of row.countries ?? []) {
    const iso3 = String(value).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) result.add(iso3);
  }
  return result;
}

function touchesSubject(row: LiveEventRow, subject: AgentQueryPlan["subjects"][number]) {
  const touched = rowCountries(row);
  return subjectCountries(subject).some((iso3) => touched.has(iso3));
}

function rowFamilies(row: LiveEventRow) {
  return classifyHotTopicEvent({
    event_type: row.event_type,
    title: row.title,
    summary: row.summary,
    domain: row.domain,
  });
}

function intersectsRequestedFamilies(
  row: LiveEventRow,
  requestedFamilies: HotTopicFamily[],
) {
  if (requestedFamilies.length === 0) return true;
  const found = new Set(rowFamilies(row));
  return requestedFamilies.some((family) => found.has(family));
}

function baseLimitations(subject: AgentQueryPlan["subjects"][number]) {
  return {
    raw_source_material_redistributed: false as const,
    article_text_redistributed: false as const,
    no_signal_is_not_zero_risk: true as const,
    unclassified_events_excluded_from_family_specific_results: true as const,
    corridor_route_modeling:
      subject.type === "corridor" ? ("ENDPOINT_EXPOSURE_ONLY" as const) : null,
  };
}

function asDeliverableEvent(row: LiveEventRow): AgentHotTopicEvent {
  return {
    event_id: row.id,
    story_key: row.story_key,
    domain: row.domain,
    event_type: row.event_type,
    families: rowFamilies(row),
    title: row.title,
    summary: row.summary,
    primary_country: row.primary_country,
    countries: [...rowCountries(row)].sort(),
    severity: row.severity,
    confidence: row.confidence,
    direction: row.direction,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    evidence_count: Number(row.evidence_count ?? 0),
    independent_source_count: Number(row.independent_source_count ?? 0),
    structure_version: row.structure_version,
    classification_version: row.classification_version,
    commercial_eligibility_status: row.commercial_eligibility_status as "VERIFIED" | "DERIVED_ONLY",
    commercial_eligibility_reason_codes: row.commercial_eligibility_reason_codes ?? [],
    delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
  };
}

export async function loadAgentHotTopics(input: {
  plan: AgentQueryPlan;
  subject: AgentQueryPlan["subjects"][number];
  now?: Date;
}): Promise<AgentHotTopicResult> {
  const db = requireRiskSupabase();
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const asOf = input.plan.as_of ? new Date(input.plan.as_of) : now;
  const requestedWindow = input.plan.module_max_age_seconds.hot_topics;
  // The normalized question is already inside query_plan_hash, so inferred
  // family scope is payment-bound even before the explicit v2 family field is
  // introduced. An empty family list deliberately means "all governed current
  // event families", never an ungoverned free-text search.
  const requestedFamilies = inferHotTopicFamiliesFromQuestion(input.plan.question_key);

  if (!Number.isFinite(requestedWindow) || requestedWindow <= 0) {
    return {
      deliverable: false,
      code: "HOT_TOPIC_PIPELINE_STALE",
      checked_at: checkedAt,
      requested_families: requestedFamilies,
      matched_families: [],
      source_pipeline: { source_key: HOT_TOPIC_SOURCE_KEY, stream_key: HOT_TOPIC_STREAM_KEY, status: null, last_success_at: null, lag_seconds: null },
      subject: input.subject,
      current_event_signal: false,
      commercially_deliverable_event_count: 0,
      excluded_non_deliverable_event_count: 0,
      events: [],
      limitations: baseLimitations(input.subject),
    };
  }

  const countries = subjectCountries(input.subject);
  const registry = await db
    .from("live_country_registry")
    .select("iso3,enabled")
    .in("iso3", countries)
    .eq("enabled", true);
  if (registry.error) throw registry.error;
  const registered = new Set((registry.data ?? []).map((row: { iso3?: string }) => String(row.iso3 ?? "")));
  if (countries.some((iso3) => !registered.has(iso3))) {
    return {
      deliverable: false,
      code: "SUBJECT_NOT_REGISTERED",
      checked_at: checkedAt,
      requested_families: requestedFamilies,
      matched_families: [],
      source_pipeline: { source_key: HOT_TOPIC_SOURCE_KEY, stream_key: HOT_TOPIC_STREAM_KEY, status: null, last_success_at: null, lag_seconds: null },
      subject: input.subject,
      current_event_signal: false,
      commercially_deliverable_event_count: 0,
      excluded_non_deliverable_event_count: 0,
      events: [],
      limitations: baseLimitations(input.subject),
    };
  }

  const cursor = await db
    .from("live_ingestion_cursors")
    .select("status,last_success_at,last_item_at")
    .eq("source_key", HOT_TOPIC_SOURCE_KEY)
    .eq("stream_key", HOT_TOPIC_STREAM_KEY)
    .maybeSingle();
  if (cursor.error) throw cursor.error;
  const lastSuccess = cursor.data?.last_success_at ? Date.parse(String(cursor.data.last_success_at)) : NaN;
  const lagSeconds = Number.isFinite(lastSuccess) ? Math.max(0, Math.floor((now.getTime() - lastSuccess) / 1000)) : null;
  const pipeline = {
    source_key: HOT_TOPIC_SOURCE_KEY,
    stream_key: HOT_TOPIC_STREAM_KEY,
    status: cursor.data?.status ? String(cursor.data.status) : null,
    last_success_at: cursor.data?.last_success_at ? String(cursor.data.last_success_at) : null,
    lag_seconds: lagSeconds,
  } as const;

  if (!cursor.data || cursor.data.status !== "healthy") {
    return {
      deliverable: false,
      code: "HOT_TOPIC_PIPELINE_UNHEALTHY",
      checked_at: checkedAt,
      requested_families: requestedFamilies,
      matched_families: [],
      source_pipeline: pipeline,
      subject: input.subject,
      current_event_signal: false,
      commercially_deliverable_event_count: 0,
      excluded_non_deliverable_event_count: 0,
      events: [],
      limitations: baseLimitations(input.subject),
    };
  }
  if (lagSeconds === null || lagSeconds > HOT_TOPIC_PIPELINE_MAX_LAG_SECONDS) {
    return {
      deliverable: false,
      code: "HOT_TOPIC_PIPELINE_STALE",
      checked_at: checkedAt,
      requested_families: requestedFamilies,
      matched_families: [],
      source_pipeline: pipeline,
      subject: input.subject,
      current_event_signal: false,
      commercially_deliverable_event_count: 0,
      excluded_non_deliverable_event_count: 0,
      events: [],
      limitations: baseLimitations(input.subject),
    };
  }

  const cutoff = new Date(asOf.getTime() - requestedWindow * 1000).toISOString();
  const rows = await db
    .from("live_structured_events")
    .select("id,story_key,domain,event_type,title,summary,primary_country,countries,severity,confidence,direction,status,first_seen_at,last_seen_at,evidence_count,independent_source_count,structure_version,classification_version,commercial_eligibility_status,commercial_eligibility_reason_codes")
    .gte("last_seen_at", cutoff)
    .lte("last_seen_at", asOf.toISOString())
    .in("status", ["active", "monitoring"])
    .order("last_seen_at", { ascending: false })
    .limit(MAX_RECENT_ROWS);
  if (rows.error) throw rows.error;

  const subjectMatching = (rows.data ?? []).filter((row) =>
    touchesSubject(row as LiveEventRow, input.subject),
  ) as LiveEventRow[];
  const matching = subjectMatching.filter((row) =>
    intersectsRequestedFamilies(row, requestedFamilies),
  );
  const eligible = matching.filter((row) =>
    DELIVERABLE_STATUSES.has(row.commercial_eligibility_status),
  );
  const blocked = matching.length - eligible.length;
  const matchedFamilies = [...new Set(matching.flatMap(rowFamilies))].sort() as HotTopicFamily[];

  if (matching.length > 0 && eligible.length === 0) {
    return {
      deliverable: false,
      code: "HOT_TOPIC_COMMERCIAL_COVERAGE_INSUFFICIENT",
      checked_at: checkedAt,
      requested_families: requestedFamilies,
      matched_families: matchedFamilies,
      source_pipeline: pipeline,
      subject: input.subject,
      current_event_signal: true,
      commercially_deliverable_event_count: 0,
      excluded_non_deliverable_event_count: blocked,
      events: [],
      limitations: baseLimitations(input.subject),
    };
  }

  // One real-world development can appear in many upstream reports. The
  // commercial product returns one canonical event identity (story_key) and
  // lets a material update advance last_seen/structure/classification state
  // rather than charging or emitting another copy of the same development.
  const canonical = new Map<string, LiveEventRow>();
  for (const row of eligible) {
    const current = canonical.get(row.story_key);
    if (!current) {
      canonical.set(row.story_key, row);
      continue;
    }
    const currentTime = Date.parse(current.last_seen_at);
    const rowTime = Date.parse(row.last_seen_at);
    if (
      Number.isFinite(rowTime) &&
      (!Number.isFinite(currentTime) || rowTime > currentTime)
    ) {
      canonical.set(row.story_key, row);
    }
  }

  const canonicalRows = [...canonical.values()].sort((a, b) => {
    const byTime = Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at);
    return Number.isFinite(byTime) && byTime !== 0
      ? byTime
      : a.story_key.localeCompare(b.story_key);
  });

  const delivered = canonicalRows
    .slice(0, MAX_DELIVERED_EVENTS)
    .map(asDeliverableEvent);

  return {
    deliverable: true,
    code: "AVAILABLE",
    checked_at: checkedAt,
    requested_families: requestedFamilies,
    matched_families: matchedFamilies,
    source_pipeline: pipeline,
    subject: input.subject,
    current_event_signal: canonicalRows.length > 0,
    commercially_deliverable_event_count: canonicalRows.length,
    excluded_non_deliverable_event_count: blocked,
    events: delivered,
    limitations: baseLimitations(input.subject),
  };
}
