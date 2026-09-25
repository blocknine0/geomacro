import { createClient } from "npm:@supabase/supabase-js@2";

const METHODOLOGY_STATUS = "EVIDENCE_ONLY_NOT_IN_GRI_V1_2";
const WAREHOUSE_METHODOLOGY_STATUS = "EVIDENCE_ONLY_NOT_IN_GRO_V02";
const MAX_OBSERVATIONS = 12;
const BASE_LIMIT = 80;

const OBSERVATION_COLUMNS = [
  "observation_id",
  "source_id",
  "source_record_id",
  "dimension",
  "country_iso3",
  "partner_country_iso3",
  "observed_at",
  "published_at",
  "metric",
  "value_numeric",
  "value_text",
  "unit",
  "event_type",
  "signal_type",
  "source_url",
  "parser_version",
  "methodology_status",
  "quality_status",
  "provenance",
  "normalized_hash",
  "retrieved_at",
].join(",");

const COVERAGE_COLUMNS = [
  "source_id",
  "dimension",
  "country_iso3",
  "coverage_year",
  "coverage_status",
  "observation_count",
  "latest_observed_at",
  "audit_metadata",
  "updated_at",
].join(",");

type Subject =
  | { type: "country"; country_iso3: string }
  | {
      type: "corridor";
      origin_country_iso3: string;
      destination_country_iso3: string;
    };

type Observation = Record<string, unknown> & {
  observation_id: string;
  source_id: string;
  dimension: string;
  metric: string;
  normalized_hash: string;
  observed_at?: string | null;
  published_at?: string | null;
  retrieved_at?: string | null;
  country_iso3?: string | null;
  partner_country_iso3?: string | null;
};

type Coverage = Record<string, unknown> & {
  source_id: string;
  dimension: string;
  country_iso3: string;
  coverage_year: number;
  coverage_status: string;
  observation_count: number;
  latest_observed_at: string | null;
  audit_metadata: unknown;
  updated_at: string;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-geomacro-historical-adapter": "v1",
    },
  });
}

function normalizeIso3(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Invalid ISO3 country code");
  }
  return normalized;
}

function normalizeSubject(input: unknown): Subject {
  if (!input || typeof input !== "object") {
    throw new Error("subject is required");
  }

  const value = input as Record<string, unknown>;
  if (value.type === "country") {
    return { type: "country", country_iso3: normalizeIso3(value.country_iso3) };
  }

  if (value.type === "corridor") {
    const origin = normalizeIso3(value.origin_country_iso3);
    const destination = normalizeIso3(value.destination_country_iso3);
    if (origin === destination) throw new Error("corridor endpoints must differ");
    return {
      type: "corridor",
      origin_country_iso3: origin,
      destination_country_iso3: destination,
    };
  }

  throw new Error("Unsupported structural subject");
}

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(item.code ?? "");
  const text = [item.message, item.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    text.includes("could not find the table") ||
    text.includes("could not find the relation") ||
    (text.includes("schema cache") && text.includes("commercial_structural_"))
  );
}

function observationTime(row: Observation): number {
  const value = row.observed_at ?? row.published_at ?? row.retrieved_at;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestObservations(rows: Observation[]): Observation[] {
  const sorted = [...rows].sort((a, b) => observationTime(b) - observationTime(a));
  const seen = new Set<string>();
  const output: Observation[] = [];

  for (const row of sorted) {
    const key = [
      row.dimension,
      row.metric,
      row.country_iso3 ?? "",
      row.partner_country_iso3 ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
    if (output.length >= MAX_OBSERVATIONS) break;
  }

  return output;
}

function countryProfileObservations(value: unknown): Observation[] {
  if (!value || typeof value !== "object") return [];
  const rows = (value as { latest_observations?: unknown }).latest_observations;
  return Array.isArray(rows) ? rows.filter(isObservation) : [];
}

function isObservation(value: unknown): value is Observation {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Observation>;
  return (
    typeof row.observation_id === "string" &&
    typeof row.source_id === "string" &&
    typeof row.dimension === "string" &&
    typeof row.metric === "string" &&
    typeof row.normalized_hash === "string"
  );
}

function authIsServiceRole(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;

  try {
    const encoded = token.split(".")[1];
    if (!encoded) return false;
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function client() {
  const url = Deno.env.get("HISTORICAL_SUPABASE_URL")?.trim();
  const key = Deno.env.get("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countryCoverage(
  db: ReturnType<typeof client>,
  iso3: string,
): Promise<{ coverage: Coverage[]; missingView: boolean }> {
  if (!db) return { coverage: [], missingView: true };

  const result = await db
    .from("commercial_structural_country_coverage_latest")
    .select(COVERAGE_COLUMNS)
    .eq("country_iso3", iso3)
    .order("dimension", { ascending: true })
    .order("source_id", { ascending: true })
    .limit(80);

  if (result.error) {
    if (isMissingRelation(result.error)) {
      return { coverage: [], missingView: true };
    }
    throw result.error;
  }

  return { coverage: (result.data ?? []) as unknown as Coverage[], missingView: false };
}

async function countryRowsFallback(
  db: ReturnType<typeof client>,
  iso3: string,
): Promise<Observation[]> {
  if (!db) return [];

  const result = await db
    .from("commercial_structural_geopolitical_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("country_iso3", iso3)
    .order("observed_at", { ascending: false, nullsFirst: false })
    .limit(BASE_LIMIT);

  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as Observation[];
}

async function directRowsFallback(
  db: ReturnType<typeof client>,
  origin: string,
  destination: string,
): Promise<Observation[]> {
  if (!db) return [];

  const [forward, reverse] = await Promise.all([
    db
      .from("commercial_structural_geopolitical_observations")
      .select(OBSERVATION_COLUMNS)
      .eq("country_iso3", origin)
      .eq("partner_country_iso3", destination)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
    db
      .from("commercial_structural_geopolitical_observations")
      .select(OBSERVATION_COLUMNS)
      .eq("country_iso3", destination)
      .eq("partner_country_iso3", origin)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
  ]);

  if (forward.error) throw forward.error;
  if (reverse.error) throw reverse.error;

  return [
    ...((forward.data ?? []) as unknown as Observation[]),
    ...((reverse.data ?? []) as unknown as Observation[]),
  ];
}

async function countryContext(db: ReturnType<typeof client>, iso3: string) {
  if (!db) {
    return { observations: [], coverage: [], fallback: true, missingView: true };
  }

  const [profileResult, coverageResult] = await Promise.all([
    db
      .from("commercial_structural_country_profiles")
      .select("country_iso3,subject_type,methodology_status,latest_observation_count,dimension_count,source_count,dimensions_present,source_ids,earliest_latest_observation_at,latest_observed_at,latest_retrieved_at,latest_observations")
      .eq("country_iso3", iso3)
      .maybeSingle(),
    countryCoverage(db, iso3),
  ]);

  if (profileResult.error && !isMissingRelation(profileResult.error)) {
    throw profileResult.error;
  }

  const profile = profileResult.error
    ? null
    : (profileResult.data as Record<string, unknown> | null);

  if (profile) {
    return {
      observations: latestObservations(countryProfileObservations(profile)),
      coverage: coverageResult.coverage,
      fallback: coverageResult.missingView,
      missingView: coverageResult.missingView,
    };
  }

  return {
    observations: latestObservations(await countryRowsFallback(db, iso3)),
    coverage: coverageResult.coverage,
    fallback: true,
    missingView: true,
  };
}

async function loadContext(subject: Subject) {
  const db = client();
  if (!db) {
    return {
      status: "NOT_CONFIGURED",
      methodology_status: METHODOLOGY_STATUS,
      subject,
      observations: [],
      metadata: {
        serving_layer: "NOT_CONFIGURED",
        warehouse_methodology_status: WAREHOUSE_METHODOLOGY_STATUS,
        coverage: [],
        composition_method: null,
        route_modeling_status: null,
        direct_evidence_status: null,
      },
      note: "Historical structural warehouse is not configured. Missing data is never converted to zero risk.",
    };
  }

  if (subject.type === "country") {
    const result = await countryContext(db, subject.country_iso3);
    return {
      status: result.observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      methodology_status: METHODOLOGY_STATUS,
      subject,
      observations: result.observations,
      metadata: {
        serving_layer: result.fallback ? "BASE_COMMERCIAL_VIEW_ROLLOUT_FALLBACK" : "COUNTRY_PROFILE_V1",
        warehouse_methodology_status: WAREHOUSE_METHODOLOGY_STATUS,
        coverage: result.coverage,
        composition_method: null,
        route_modeling_status: null,
        direct_evidence_status: null,
      },
      note:
        result.observations.length > 0
          ? "Historical structural context is governed evidence-only context and is not a GRI v1.2 or GRO v0.2 scoring input."
          : "No commercially eligible structural observations were found. Missing structural evidence is disclosed and is never interpreted as zero risk.",
    };
  }

  const [origin, destination, corridorResult] = await Promise.all([
    countryContext(db, subject.origin_country_iso3),
    countryContext(db, subject.destination_country_iso3),
    db
      .from("commercial_structural_corridor_latest")
      .select("origin_country_iso3,destination_country_iso3,subject_type,methodology_status,composition_method,route_modeling_status,direct_observation_count,direct_evidence_status,latest_observed_at,origin_profile,destination_profile,direct_observations")
      .eq("origin_country_iso3", subject.origin_country_iso3)
      .eq("destination_country_iso3", subject.destination_country_iso3)
      .maybeSingle(),
  ]);

  if (corridorResult.error && !isMissingRelation(corridorResult.error)) {
    throw corridorResult.error;
  }

  const corridor = corridorResult.error ? null : (corridorResult.data as Record<string, unknown> | null);
  const direct = corridor
    ? (Array.isArray(corridor.direct_observations) ? corridor.direct_observations.filter(isObservation) : [])
    : await directRowsFallback(db, subject.origin_country_iso3, subject.destination_country_iso3);

  const originRows = corridor
    ? countryProfileObservations(corridor.origin_profile)
    : origin.observations;
  const destinationRows = corridor
    ? countryProfileObservations(corridor.destination_profile)
    : destination.observations;

  const observations = latestObservations([...direct, ...originRows, ...destinationRows]);

  return {
    status: observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
    methodology_status: METHODOLOGY_STATUS,
    subject,
    observations,
    metadata: {
      serving_layer: corridor && !origin.fallback && !destination.fallback
        ? "CORRIDOR_ENDPOINT_COMPOSED_V1"
        : "BASE_COMMERCIAL_VIEW_ROLLOUT_FALLBACK",
      warehouse_methodology_status: WAREHOUSE_METHODOLOGY_STATUS,
      coverage: [...origin.coverage, ...destination.coverage],
      composition_method: "ENDPOINT_COMPOSED_V0_1",
      route_modeling_status: "NOT_MODELED",
      direct_evidence_status:
        direct.length > 0 ? "AVAILABLE" : "NO_DIRECT_BILATERAL_EVIDENCE",
    },
    note:
      observations.length > 0
        ? "Corridor structural context is endpoint-composed from governed country evidence plus direct bilateral evidence when available. Full route, maritime, logistics, counterparty and payment-path modelling is NOT_MODELED."
        : "No commercially eligible structural evidence is available for the corridor endpoints. Missing data is disclosed and is never interpreted as zero risk.",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!authIsServiceRole(request)) return response({ ok: false, error: "UNAUTHORIZED" }, 401);

  try {
    const body = await request.json();
    const subject = normalizeSubject(body?.subject);
    const result = await loadContext(subject);
    return response({ ok: true, ...result }, result.status === "AVAILABLE" || result.status === "UNAVAILABLE" || result.status === "NOT_CONFIGURED" ? 200 : 503);
  } catch (error) {
    console.error("[historical-structural-context] failed", error);
    return response({ ok: false, error: "UNAVAILABLE" }, 503);
  }
});
