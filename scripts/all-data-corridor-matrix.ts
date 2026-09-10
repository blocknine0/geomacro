import { createClient } from "@supabase/supabase-js";

import { buildCorridorRiskObject } from "../src/lib/corridor-risk-engine";
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const LOOKBACK_HOURS = Number(process.env.CORRIDOR_MATRIX_LOOKBACK_HOURS ?? 72);
const MAX_PAIR_COUNT = Number(process.env.CORRIDOR_MATRIX_MAX_PAIRS ?? 10000);

const LIVE_STATUSES = [
  "VERIFIED",
  "DERIVED_ONLY",
  "UNVERIFIED",
  "INELIGIBLE",
] as const;

type LiveStatus = (typeof LIVE_STATUSES)[number];

type LiveCountryCoverage = {
  iso3: string;
  total_events: number;
  usable_events: number;
  blocking_events: number;
  status_counts: Record<LiveStatus, number>;
};

type CountryAcceptance = {
  iso3: string;
  live: LiveCountryCoverage;
  risk_object: {
    object_id: string;
    risk_score: number;
    confidence: number;
    commercial_eligibility: unknown;
    verification: unknown;
    events_used: number;
  };
  accepted: boolean;
  structural: {
    status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";
    observation_count: number;
    dimension_count: number;
    source_count: number;
    dimensions_present: string[];
    source_ids: string[];
    coverage_rows: number;
    missing_expected_dimensions: string[];
  };
};

const EXPECTED_STRUCTURAL_DIMENSIONS = [
  "CONFLICT_EXPOSURE",
  "FORCED_DISPLACEMENT",
  "INTERSTATE_TENSION",
  "POLITICAL_INSTABILITY",
] as const;

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function emptyCounts(): Record<LiveStatus, number> {
  return {
    VERIFIED: 0,
    DERIVED_ONLY: 0,
    UNVERIFIED: 0,
    INELIGIBLE: 0,
  };
}

function normalizeCountries(row: Record<string, unknown>) {
  const touched = new Set<string>();

  if (row.primary_country) {
    const iso3 = String(row.primary_country).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) touched.add(iso3);
  }

  for (const country of Array.isArray(row.countries) ? row.countries : []) {
    const iso3 = String(country).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) touched.add(iso3);
  }

  return touched;
}

function liveCoverage(rows: Record<string, unknown>[]) {
  const byCountry = new Map<string, Record<LiveStatus, number>>();

  for (const row of rows) {
    const rawStatus = String(row.commercial_eligibility_status ?? "UNVERIFIED");
    const status: LiveStatus = LIVE_STATUSES.includes(rawStatus as LiveStatus)
      ? (rawStatus as LiveStatus)
      : "UNVERIFIED";

    for (const iso3 of normalizeCountries(row)) {
      if (!byCountry.has(iso3)) byCountry.set(iso3, emptyCounts());
      byCountry.get(iso3)![status]++;
    }
  }

  return [...byCountry.entries()]
    .map(([iso3, statusCounts]): LiveCountryCoverage => {
      const usable = statusCounts.VERIFIED + statusCounts.DERIVED_ONLY;
      const blocking = statusCounts.UNVERIFIED + statusCounts.INELIGIBLE;
      return {
        iso3,
        total_events: usable + blocking,
        usable_events: usable,
        blocking_events: blocking,
        status_counts: statusCounts,
      };
    })
    .sort(
      (a, b) =>
        Number(b.blocking_events === 0) - Number(a.blocking_events === 0) ||
        b.usable_events - a.usable_events ||
        a.iso3.localeCompare(b.iso3),
    );
}

async function fetchStructuralCountry(
  historicalDb: ReturnType<typeof createClient> | null,
  iso3: string,
): Promise<CountryAcceptance["structural"]> {
  if (!historicalDb) {
    return {
      status: "NOT_CONFIGURED",
      observation_count: 0,
      dimension_count: 0,
      source_count: 0,
      dimensions_present: [],
      source_ids: [],
      coverage_rows: 0,
      missing_expected_dimensions: [...EXPECTED_STRUCTURAL_DIMENSIONS],
    };
  }

  const [profileResult, coverageResult] = await Promise.all([
    historicalDb
      .from("commercial_structural_country_profiles")
      .select(
        "country_iso3,latest_observation_count,dimension_count,source_count,dimensions_present,source_ids",
      )
      .eq("country_iso3", iso3)
      .maybeSingle(),
    historicalDb
      .from("commercial_structural_country_coverage_latest")
      .select("source_id,dimension,country_iso3,coverage_status")
      .eq("country_iso3", iso3)
      .limit(100),
  ]);

  if (profileResult.error || coverageResult.error) {
    return {
      status: "UNAVAILABLE",
      observation_count: 0,
      dimension_count: 0,
      source_count: 0,
      dimensions_present: [],
      source_ids: [],
      coverage_rows: 0,
      missing_expected_dimensions: [...EXPECTED_STRUCTURAL_DIMENSIONS],
    };
  }

  const profile = profileResult.data as Record<string, unknown> | null;
  const dimensions = Array.isArray(profile?.dimensions_present)
    ? profile!.dimensions_present.map((value) => String(value)).sort()
    : [];
  const sources = Array.isArray(profile?.source_ids)
    ? profile!.source_ids.map((value) => String(value)).sort()
    : [];

  return {
    status: profile ? "AVAILABLE" : "UNAVAILABLE",
    observation_count: Number(profile?.latest_observation_count ?? 0),
    dimension_count: Number(profile?.dimension_count ?? 0),
    source_count: Number(profile?.source_count ?? 0),
    dimensions_present: dimensions,
    source_ids: sources,
    coverage_rows: coverageResult.data?.length ?? 0,
    missing_expected_dimensions: EXPECTED_STRUCTURAL_DIMENSIONS.filter(
      (dimension) => !dimensions.includes(dimension),
    ),
  };
}

async function main() {
  const appUrl = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const appKey = String(
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (!appUrl || !appKey) {
    throw new Error("Authoritative Geomacro Supabase server credentials are required");
  }
  if (projectRef(appUrl) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("APP_SUPABASE_URL does not point to the authoritative Geomacro project");
  }

  const appDb = createClient(appUrl, appKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const historicalUrl = String(process.env.HISTORICAL_SUPABASE_URL ?? "").trim();
  const historicalKey = String(
    process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY ?? "",
  ).trim();
  const historicalDb = historicalUrl && historicalKey
    ? createClient(historicalUrl, historicalKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data: recentRows, error: recentError } = await appDb
    .from("live_structured_events")
    .select(
      "id,primary_country,countries,commercial_eligibility_status,commercial_eligibility_reason_codes,last_seen_at",
    )
    .gte("last_seen_at", cutoff);
  if (recentError) throw recentError;

  const coverage = liveCoverage((recentRows ?? []) as Record<string, unknown>[]);

  const countryResults: CountryAcceptance[] = [];
  for (const item of coverage) {
    if (item.usable_events === 0) continue;

    const structural = await fetchStructuralCountry(historicalDb, item.iso3);
    const result = await dryRunCountryRiskObject({ country_iso3: item.iso3 });
    const accepted =
      item.blocking_events === 0 &&
      result.object.commercial_eligibility.status === "VERIFIED" &&
      result.object.verification.status === "VERIFIED";

    countryResults.push({
      iso3: item.iso3,
      live: item,
      risk_object: {
        object_id: result.object.object_id,
        risk_score: result.object.risk.score,
        confidence: result.object.confidence,
        commercial_eligibility: result.object.commercial_eligibility,
        verification: result.object.verification,
        events_used: result.context.country_events_used,
      },
      accepted,
      structural,
    });
  }

  const accepted = countryResults.filter((item) => item.accepted);
  const pairCount = accepted.length * Math.max(0, accepted.length - 1);
  if (pairCount > MAX_PAIR_COUNT) {
    throw new Error(
      `Eligible directed corridor count ${pairCount} exceeds CORRIDOR_MATRIX_MAX_PAIRS=${MAX_PAIR_COUNT}`,
    );
  }

  const corridorRows: Array<Record<string, unknown>> = [];
  for (const origin of accepted) {
    for (const destination of accepted) {
      if (origin.iso3 === destination.iso3) continue;

      const originResult = await dryRunCountryRiskObject({ country_iso3: origin.iso3 });
      const destinationResult = await dryRunCountryRiskObject({
        country_iso3: destination.iso3,
      });
      const corridor = await buildCorridorRiskObject({
        origin_country_iso3: origin.iso3,
        destination_country_iso3: destination.iso3,
        origin: originResult.object,
        destination: destinationResult.object,
        previous: null,
        as_of: new Date().toISOString(),
      });

      let structuralDirectEvidence = "NOT_CONFIGURED";
      let structuralComposition = "ENDPOINT_COMPOSED_V0_1";
      let structuralRouteModel = "NOT_MODELED";
      if (historicalDb) {
        const { data, error } = await historicalDb
          .from("commercial_structural_corridor_latest")
          .select(
            "direct_observation_count,direct_evidence_status,composition_method,route_modeling_status",
          )
          .eq("origin_country_iso3", origin.iso3)
          .eq("destination_country_iso3", destination.iso3)
          .maybeSingle();

        if (!error && data) {
          structuralDirectEvidence = String(
            data.direct_evidence_status ?? "NO_DIRECT_BILATERAL_EVIDENCE",
          );
          structuralComposition = String(
            data.composition_method ?? "ENDPOINT_COMPOSED_V0_1",
          );
          structuralRouteModel = String(data.route_modeling_status ?? "NOT_MODELED");
        } else if (!error) {
          structuralDirectEvidence = "NO_DIRECT_BILATERAL_EVIDENCE";
        } else {
          structuralDirectEvidence = "UNAVAILABLE";
        }
      }

      corridorRows.push({
        corridor_id: corridor.subject.id,
        origin: origin.iso3,
        destination: destination.iso3,
        risk_score: corridor.risk.score,
        confidence: corridor.confidence,
        commercial_eligibility: corridor.commercial_eligibility,
        verification: corridor.verification,
        methodology_version: corridor.methodology_version,
        structural_context: {
          methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
          composition_method: structuralComposition,
          route_modeling_status: structuralRouteModel,
          direct_evidence_status: structuralDirectEvidence,
        },
        execution_authorized: false,
      });
    }
  }

  const missingDataActions = countryResults
    .filter(
      (item) =>
        !item.accepted ||
        item.structural.status !== "AVAILABLE" ||
        item.structural.missing_expected_dimensions.length > 0,
    )
    .map((item) => ({
      iso3: item.iso3,
      live_blocking_events: item.live.blocking_events,
      live_status_counts: item.live.status_counts,
      country_gro_accepted: item.accepted,
      structural_status: item.structural.status,
      missing_structural_dimensions: item.structural.missing_expected_dimensions,
      required_actions: [
        ...(item.live.blocking_events > 0
          ? ["replace_or_exclude_ineligible_live_evidence_before_country_acceptance"]
          : []),
        ...(item.structural.status === "NOT_CONFIGURED"
          ? ["configure_historical_supabase_server_secrets_for_matrix_evidence"]
          : []),
        ...(item.structural.missing_expected_dimensions.includes("POLITICAL_INSTABILITY")
          ? ["run_or_repair_world_bank_wgi_structural_ingest"]
          : []),
        ...(item.structural.missing_expected_dimensions.includes("CONFLICT_EXPOSURE")
          ? ["run_or_repair_ucdp_ged_structural_ingest"]
          : []),
        ...(item.structural.missing_expected_dimensions.includes("INTERSTATE_TENSION")
          ? ["run_or_repair_ucdp_dyadic_structural_ingest"]
          : []),
        ...(item.structural.missing_expected_dimensions.includes("FORCED_DISPLACEMENT")
          ? ["run_or_repair_unhcr_structural_ingest"]
          : []),
      ],
    }));

  const sourceProgram = {
    commercial_now: [
      "GDELT-derived live event signals within derived-only delivery boundary",
      "World Bank WGI curated structural evidence",
      "UNHCR Refugee Population Statistics curated structural evidence",
      "UCDP GED curated structural evidence",
      "UCDP Dyadic interstate evidence when coverage is present",
      "USGS public-domain rare-earth evidence where subject-relevant",
    ],
    research_or_review_only: [
      "Guardian Open Platform current automated commercial/AI path",
      "GDACS until commercial reuse review closes",
      "OFAC/UNSC until commercial/reuse review closes",
      "BGS World Mineral Statistics until license review closes",
      "FRED as research/cross-check, not canonical commercial macro source",
      "Coin Metrics Community as non-commercial research only",
    ],
    acquisition_plan: [
      "Prefer direct official macro sources over FRED for commercial canonical delivery",
      "Complete UCDP token-backed production transport and all-country coverage audit",
      "Backfill missing UNHCR/WGI country coverage through governed historical workflows",
      "Keep sanctions source review separate from scoring and never infer sovereign risk from address/nationality fields",
      "Add independently validated route-specific corridor methodology before corridor VERIFIED claims",
    ],
  };

  const report = {
    generated_at: new Date().toISOString(),
    authoritative_project_ref: AUTHORITATIVE_PROJECT_REF,
    lookback_hours: LOOKBACK_HOURS,
    current_data: {
      recent_structured_events: recentRows?.length ?? 0,
      countries_with_live_evidence: coverage.length,
      countries_evaluated: countryResults.length,
      accepted_country_count: accepted.length,
      accepted_countries: accepted.map((item) => item.iso3).sort(),
    },
    structural_data: {
      configured: Boolean(historicalDb),
      methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
      note: "Structural evidence is used as governed context/coverage only and is not silently added to the frozen GRI/GRO score methodology.",
    },
    country_matrix: countryResults,
    corridor_matrix: {
      directed_pair_count: corridorRows.length,
      rows: corridorRows,
      methodology_claim: "PILOT_ONLY_NOT_INDEPENDENTLY_VERIFIED",
    },
    missing_data_actions: missingDataActions,
    source_program: sourceProgram,
    acceptance: {
      country_private_pilot_candidates: accepted.length,
      corridor_verified_for_production: false,
      execution_authorized: false,
      note: "This audit uses all currently governed commercial evidence that can be consumed without changing frozen methodology. Missing/review-gated/non-commercial sources remain explicit rather than being guessed or zero-filled.",
    },
  };

  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.GITHUB_OUTPUT_FILE) {
    await Bun.write(process.env.GITHUB_OUTPUT_FILE, json + "\n");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
