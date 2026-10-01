import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readB2StructuralServingSnapshot,
  type B2StructuralServingSnapshot,
} from "./b2-structural.server";

export const STRUCTURAL_METHODOLOGY_STATUS =
  "EVIDENCE_ONLY_NOT_IN_GRI_V1_2" as const;
export const STRUCTURAL_WAREHOUSE_METHODOLOGY_STATUS =
  "EVIDENCE_ONLY_NOT_IN_GRO_V02" as const;

export type StructuralSubject =
  | { type: "country"; country_iso3: string }
  | {
      type: "corridor";
      origin_country_iso3: string;
      destination_country_iso3: string;
    };

export type StructuralObservation = {
  observation_id: string;
  source_id: string;
  source_record_id: string | null;
  dimension: string;
  country_iso3: string | null;
  partner_country_iso3: string | null;
  observed_at: string | null;
  published_at: string | null;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  event_type: string | null;
  signal_type: string | null;
  source_url: string | null;
  parser_version: string | null;
  methodology_status: string | null;
  quality_status: string | null;
  provenance: unknown;
  normalized_hash: string;
  retrieved_at: string | null;
};

export type StructuralCoverage = {
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

export type StructuralServingMetadata = {
  serving_layer:
    | "COUNTRY_PROFILE_V1"
    | "CORRIDOR_ENDPOINT_COMPOSED_V1"
    | "BASE_COMMERCIAL_VIEW_ROLLOUT_FALLBACK"
    | "NOT_CONFIGURED";
  warehouse_methodology_status: typeof STRUCTURAL_WAREHOUSE_METHODOLOGY_STATUS;
  coverage: StructuralCoverage[];
  composition_method: "ENDPOINT_COMPOSED_V0_1" | null;
  route_modeling_status: "NOT_MODELED" | null;
  direct_evidence_status: "AVAILABLE" | "NO_DIRECT_BILATERAL_EVIDENCE" | null;
};

export type StructuralContext = {
  status: "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED";
  methodology_status: typeof STRUCTURAL_METHODOLOGY_STATUS;
  subject: StructuralSubject;
  observations: StructuralObservation[];
  metadata: StructuralServingMetadata;
  note: string;
};

type CountryProfileRow = {
  country_iso3: string;
  latest_observations: unknown;
};

type CorridorProfileRow = {
  direct_evidence_status: string;
  origin_profile: unknown;
  destination_profile: unknown;
  direct_observations: unknown;
};

let cachedHistoricalClient: SupabaseClient | null = null;

function getHistoricalClient(): SupabaseClient | null {
  if (cachedHistoricalClient) return cachedHistoricalClient;
  const url = process.env.HISTORICAL_SUPABASE_URL;
  const serviceKey = process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  cachedHistoricalClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedHistoricalClient;
}

const COLUMNS = [
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

function normalizeIso3(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`Invalid ISO3 country code: ${value}`);
  }
  return normalized;
}

function normalizeSubject(subject: StructuralSubject): StructuralSubject {
  if (subject.type === "country") {
    return { type: "country", country_iso3: normalizeIso3(subject.country_iso3) };
  }
  const origin = normalizeIso3(subject.origin_country_iso3);
  const destination = normalizeIso3(subject.destination_country_iso3);
  if (origin === destination) {
    throw new Error("Structural corridor endpoints must be different countries");
  }
  return {
    type: "corridor",
    origin_country_iso3: origin,
    destination_country_iso3: destination,
  };
}

function rowTime(row: StructuralObservation): number {
  const value = row.observed_at ?? row.published_at ?? row.retrieved_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function latestStructuralObservations(
  rows: StructuralObservation[],
  limit = 12,
): StructuralObservation[] {
  const sorted = [...rows].sort((a, b) => rowTime(b) - rowTime(a));
  const seen = new Set<string>();
  const output: StructuralObservation[] = [];
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
    if (output.length >= limit) break;
  }
  return output;
}

function isStructuralObservation(value: unknown): value is StructuralObservation {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<StructuralObservation>;
  return (
    typeof row.observation_id === "string" &&
    typeof row.source_id === "string" &&
    typeof row.dimension === "string" &&
    typeof row.metric === "string" &&
    typeof row.normalized_hash === "string"
  );
}

function observationsFromJson(value: unknown): StructuralObservation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isStructuralObservation);
}

function countryProfileObservations(value: unknown): StructuralObservation[] {
  if (!value || typeof value !== "object") return [];
  return observationsFromJson((value as { latest_observations?: unknown }).latest_observations);
}

export function isMissingStructuralServingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const text = [record.message, record.details]
    .filter((item): item is string => typeof item === "string")
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

async function fetchCountryCoverage(
  db: SupabaseClient,
  iso3: string,
): Promise<StructuralCoverage[]> {
  const result = await db
    .from("commercial_structural_country_coverage_latest")
    .select(COVERAGE_COLUMNS)
    .eq("country_iso3", iso3)
    .order("dimension", { ascending: true })
    .order("source_id", { ascending: true })
    .limit(80);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as StructuralCoverage[];
}

async function fetchCountryProfile(
  db: SupabaseClient,
  iso3: string,
): Promise<{ observations: StructuralObservation[]; coverage: StructuralCoverage[] }> {
  const [profileResult, coverage] = await Promise.all([
    db
      .from("commercial_structural_country_profiles")
      .select("country_iso3,latest_observations")
      .eq("country_iso3", iso3)
      .maybeSingle(),
    fetchCountryCoverage(db, iso3),
  ]);
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data as unknown as CountryProfileRow | null;
  return {
    observations: profile
      ? latestStructuralObservations(observationsFromJson(profile.latest_observations), 12)
      : [],
    coverage,
  };
}

async function fetchCorridorProfile(
  db: SupabaseClient,
  origin: string,
  destination: string,
): Promise<{
  observations: StructuralObservation[];
  coverage: StructuralCoverage[];
  compositionMethod: "ENDPOINT_COMPOSED_V0_1";
  routeModelingStatus: "NOT_MODELED";
  directEvidenceStatus: "AVAILABLE" | "NO_DIRECT_BILATERAL_EVIDENCE";
}> {
  const [corridorResult, originCoverage, destinationCoverage] = await Promise.all([
    db
      .from("commercial_structural_corridor_latest")
      .select("direct_evidence_status,origin_profile,destination_profile,direct_observations")
      .eq("origin_country_iso3", origin)
      .eq("destination_country_iso3", destination)
      .maybeSingle(),
    fetchCountryCoverage(db, origin),
    fetchCountryCoverage(db, destination),
  ]);
  if (corridorResult.error) throw corridorResult.error;
  const corridor = corridorResult.data as unknown as CorridorProfileRow | null;
  if (!corridor) {
    return {
      observations: [],
      coverage: [...originCoverage, ...destinationCoverage],
      compositionMethod: "ENDPOINT_COMPOSED_V0_1",
      routeModelingStatus: "NOT_MODELED",
      directEvidenceStatus: "NO_DIRECT_BILATERAL_EVIDENCE",
    };
  }
  const rows = [
    ...observationsFromJson(corridor.direct_observations),
    ...countryProfileObservations(corridor.origin_profile),
    ...countryProfileObservations(corridor.destination_profile),
  ];
  return {
    observations: latestStructuralObservations(rows, 12),
    coverage: [...originCoverage, ...destinationCoverage],
    compositionMethod: "ENDPOINT_COMPOSED_V0_1",
    routeModelingStatus: "NOT_MODELED",
    directEvidenceStatus:
      corridor.direct_evidence_status === "AVAILABLE"
        ? "AVAILABLE"
        : "NO_DIRECT_BILATERAL_EVIDENCE",
  };
}

async function fetchCountryRowsFallback(
  db: SupabaseClient,
  iso3: string,
): Promise<StructuralObservation[]> {
  const result = await db
    .from("commercial_structural_geopolitical_observations")
    .select(COLUMNS)
    .eq("country_iso3", iso3)
    .order("observed_at", { ascending: false, nullsFirst: false })
    .limit(80);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as StructuralObservation[];
}

async function fetchDirectCorridorRowsFallback(
  db: SupabaseClient,
  origin: string,
  destination: string,
): Promise<StructuralObservation[]> {
  const [forward, reverse] = await Promise.all([
    db
      .from("commercial_structural_geopolitical_observations")
      .select(COLUMNS)
      .eq("country_iso3", origin)
      .eq("partner_country_iso3", destination)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
    db
      .from("commercial_structural_geopolitical_observations")
      .select(COLUMNS)
      .eq("country_iso3", destination)
      .eq("partner_country_iso3", origin)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
  ]);
  if (forward.error) throw forward.error;
  if (reverse.error) throw reverse.error;
  return [
    ...((forward.data ?? []) as unknown as StructuralObservation[]),
    ...((reverse.data ?? []) as unknown as StructuralObservation[]),
  ];
}

async function fetchRolloutFallback(
  db: SupabaseClient,
  subject: StructuralSubject,
): Promise<StructuralObservation[]> {
  if (subject.type === "country") {
    return latestStructuralObservations(
      await fetchCountryRowsFallback(db, subject.country_iso3),
      12,
    );
  }
  const [originRows, destinationRows, directRows] = await Promise.all([
    fetchCountryRowsFallback(db, subject.origin_country_iso3),
    fetchCountryRowsFallback(db, subject.destination_country_iso3),
    fetchDirectCorridorRowsFallback(
      db,
      subject.origin_country_iso3,
      subject.destination_country_iso3,
    ),
  ]);
  return latestStructuralObservations(
    [...directRows, ...originRows, ...destinationRows],
    12,
  );
}

function metadata(
  servingLayer: StructuralServingMetadata["serving_layer"],
  options?: {
    coverage?: StructuralCoverage[];
    compositionMethod?: "ENDPOINT_COMPOSED_V0_1" | null;
    routeModelingStatus?: "NOT_MODELED" | null;
    directEvidenceStatus?: "AVAILABLE" | "NO_DIRECT_BILATERAL_EVIDENCE" | null;
  },
): StructuralServingMetadata {
  return {
    serving_layer: servingLayer,
    warehouse_methodology_status: STRUCTURAL_WAREHOUSE_METHODOLOGY_STATUS,
    coverage: options?.coverage ?? [],
    composition_method: options?.compositionMethod ?? null,
    route_modeling_status: options?.routeModelingStatus ?? null,
    direct_evidence_status: options?.directEvidenceStatus ?? null,
  };
}

function countryFromB2(snapshot: B2StructuralServingSnapshot, iso3: string) {
  const profile = snapshot.country_profiles.find((row) => row.country_iso3 === iso3);
  const observations = profile
    ? latestStructuralObservations(profile.latest_observations, 12)
    : [];
  const coverage = snapshot.coverage.filter((row) => row.country_iso3 === iso3);
  return { observations, coverage };
}

function directFromB2(
  snapshot: B2StructuralServingSnapshot,
  origin: string,
  destination: string,
) {
  return snapshot.direct_observations.filter(
    (row) =>
      (row.country_iso3 === origin && row.partner_country_iso3 === destination) ||
      (row.country_iso3 === destination && row.partner_country_iso3 === origin),
  );
}

async function loadB2StructuralContext(
  subject: StructuralSubject,
): Promise<StructuralContext | null> {
  const snapshot = await readB2StructuralServingSnapshot();
  if (!snapshot) return null;
  if (subject.type === "country") {
    const result = countryFromB2(snapshot, subject.country_iso3);
    return {
      status: result.observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations: result.observations,
      metadata: metadata("COUNTRY_PROFILE_V1", { coverage: result.coverage }),
      note:
        result.observations.length > 0
          ? "Historical structural serving is temporarily using a verified private B2 snapshot of the governed country profile. It remains evidence-only context and does not alter GRI v1.2, GRO v0.2, or Risk Gate weights."
          : "The verified private B2 structural snapshot has no eligible observations for this country. Missing structural data is disclosed and never interpreted as zero risk.",
    };
  }

  const origin = countryFromB2(snapshot, subject.origin_country_iso3);
  const destination = countryFromB2(snapshot, subject.destination_country_iso3);
  const direct = directFromB2(
    snapshot,
    subject.origin_country_iso3,
    subject.destination_country_iso3,
  );
  const observations = latestStructuralObservations(
    [...direct, ...origin.observations, ...destination.observations],
    12,
  );
  return {
    status: observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
    methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
    subject,
    observations,
    metadata: metadata("CORRIDOR_ENDPOINT_COMPOSED_V1", {
      coverage: [...origin.coverage, ...destination.coverage],
      compositionMethod: "ENDPOINT_COMPOSED_V0_1",
      routeModelingStatus: "NOT_MODELED",
      directEvidenceStatus: direct.length > 0 ? "AVAILABLE" : "NO_DIRECT_BILATERAL_EVIDENCE",
    }),
    note:
      observations.length > 0
        ? "Historical structural serving is temporarily using a verified private B2 snapshot and the same ENDPOINT_COMPOSED_V0_1 country-plus-direct-evidence contract. Route, maritime, logistics, counterparty and payment-path modelling remain NOT_MODELED."
        : "The verified private B2 structural snapshot has no eligible profile for both corridor endpoints. Missing structural data is disclosed and never interpreted as zero risk.",
  };
}

function unavailableContext(subject: StructuralSubject): StructuralContext {
  return {
    status: "UNAVAILABLE",
    methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
    subject,
    observations: [],
    metadata: metadata(
      subject.type === "country"
        ? "COUNTRY_PROFILE_V1"
        : "CORRIDOR_ENDPOINT_COMPOSED_V1",
      {
        compositionMethod: subject.type === "corridor" ? "ENDPOINT_COMPOSED_V0_1" : null,
        routeModelingStatus: subject.type === "corridor" ? "NOT_MODELED" : null,
      },
    ),
    note:
      "Structural evidence could not be loaded from either the curated historical interface or its verified private B2 continuity snapshot. Geomacro does not substitute fabricated, stale, raw, or zero-valued structural data.",
  };
}

export async function loadStructuralContext(
  requestedSubject: StructuralSubject,
): Promise<StructuralContext> {
  const subject = normalizeSubject(requestedSubject);
  const db = getHistoricalClient();

  if (!db) {
    const b2 = await loadB2StructuralContext(subject);
    if (b2) return b2;
    return {
      status: "NOT_CONFIGURED",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations: [],
      metadata: metadata("NOT_CONFIGURED"),
      note:
        "Structural evidence is not configured in this runtime and no fresh verified private B2 continuity snapshot is available. Missing historical context is never converted to zero risk and does not alter GRI v1.2.",
    };
  }

  try {
    if (subject.type === "country") {
      const result = await fetchCountryProfile(db, subject.country_iso3);
      return {
        status: result.observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
        methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
        subject,
        observations: result.observations,
        metadata: metadata("COUNTRY_PROFILE_V1", { coverage: result.coverage }),
        note:
          result.observations.length > 0
            ? "Country structural context comes from the governed country serving profile. It is evidence-only context, not a GRI v1.2 input, GRO v0.2 score, or undisclosed Risk Gate weight."
            : "No commercially eligible structural observations were found for this country profile. Missing structural data is disclosed and is never interpreted as zero risk.",
      };
    }

    const result = await fetchCorridorProfile(
      db,
      subject.origin_country_iso3,
      subject.destination_country_iso3,
    );
    return {
      status: result.observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations: result.observations,
      metadata: metadata("CORRIDOR_ENDPOINT_COMPOSED_V1", {
        coverage: result.coverage,
        compositionMethod: result.compositionMethod,
        routeModelingStatus: result.routeModelingStatus,
        directEvidenceStatus: result.directEvidenceStatus,
      }),
      note:
        result.observations.length > 0
          ? "Corridor structural context is endpoint-composed from governed country profiles plus direct bilateral evidence when available. Route, maritime, logistics, counterparty and payment-path modelling are NOT_MODELED."
          : "No commercially eligible structural profile is available for both corridor endpoints. Missing structural data is disclosed and is never interpreted as zero risk.",
    };
  } catch (error) {
    if (isMissingStructuralServingRelation(error)) {
      try {
        const observations = await fetchRolloutFallback(db, subject);
        return {
          status: observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
          methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
          subject,
          observations,
          metadata: metadata("BASE_COMMERCIAL_VIEW_ROLLOUT_FALLBACK", {
            compositionMethod: subject.type === "corridor" ? "ENDPOINT_COMPOSED_V0_1" : null,
            routeModelingStatus: subject.type === "corridor" ? "NOT_MODELED" : null,
          }),
          note:
            observations.length > 0
              ? "The historical structural serving migration is not present in this runtime yet, so Geomacro is using the same governed base commercial evidence view as a temporary rollout fallback. No raw warehouse table or structural score is used."
              : "The structural serving migration is not present and the governed base commercial view has no eligible observations for this subject. Missing data is never interpreted as zero risk.",
        };
      } catch (fallbackError) {
        console.error("[structural-context] rollout fallback query failed", fallbackError);
      }
    }

    console.error("[structural-context] curated historical query failed", error);
    const b2 = await loadB2StructuralContext(subject);
    if (b2) return b2;
    return unavailableContext(subject);
  }
}
