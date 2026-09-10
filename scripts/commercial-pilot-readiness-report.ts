import { createClient } from "@supabase/supabase-js";

import { buildCorridorRiskObject } from "../src/lib/corridor-risk-engine";
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const LOOKBACK_HOURS = 72;

const STATUSES = [
  "VERIFIED",
  "DERIVED_ONLY",
  "UNVERIFIED",
  "INELIGIBLE",
] as const;

function emptyCounts() {
  return {
    VERIFIED: 0,
    DERIVED_ONLY: 0,
    UNVERIFIED: 0,
    INELIGIBLE: 0,
  };
}

function normalizeIso3(value: string | undefined, fallback: string) {
  const iso3 = String(value ?? fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error(`Invalid ISO3 value: ${value ?? "<missing>"}`);
  }
  return iso3;
}

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function normalizeCountries(row: Record<string, unknown>) {
  const touched = new Set<string>();

  if (row.primary_country) {
    touched.add(String(row.primary_country).trim().toUpperCase());
  }

  for (const country of Array.isArray(row.countries) ? row.countries : []) {
    const iso3 = String(country).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) {
      touched.add(iso3);
    }
  }

  return touched;
}

async function main() {
  const origin = normalizeIso3(process.argv[2], "IRN");
  const destination = normalizeIso3(process.argv[3], "ARE");
  const requireVerified = process.argv.includes("--require-verified");

  if (origin === destination) {
    throw new Error("Origin and destination must be different countries");
  }

  const supabaseUrl = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const serviceRole = String(
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Authoritative Supabase server credentials are required");
  }

  if (projectRef(supabaseUrl) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("APP_SUPABASE_URL does not point to the authoritative Geomacro project");
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 3_600_000,
  ).toISOString();

  const { data: rows, error: rowsError } = await db
    .from("live_structured_events")
    .select(
      "id,primary_country,countries,commercial_eligibility_status,commercial_eligibility_reason_codes,last_seen_at",
    )
    .gte("last_seen_at", cutoff);

  if (rowsError) {
    throw rowsError;
  }

  const counts: Record<string, number> = emptyCounts();

  const countryCounts: Record<string, Record<string, number>> = {
    [origin]: emptyCounts(),
    [destination]: emptyCounts(),
  };

  const allCountryCounts = new Map<string, Record<string, number>>();
  const reasonCounts = new Map<string, number>();

  for (const rawRow of rows ?? []) {
    const row = rawRow as Record<string, unknown>;
    const status = String(row.commercial_eligibility_status ?? "UNVERIFIED");

    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      counts.UNVERIFIED++;
    } else {
      counts[status] = (counts[status] ?? 0) + 1;
    }

    for (
      const reason of Array.isArray(row.commercial_eligibility_reason_codes)
        ? row.commercial_eligibility_reason_codes
        : []
    ) {
      const normalized = String(reason).trim();
      if (normalized) {
        reasonCounts.set(normalized, (reasonCounts.get(normalized) ?? 0) + 1);
      }
    }

    const touched = normalizeCountries(row);

    for (const iso3 of touched) {
      if (!allCountryCounts.has(iso3)) {
        allCountryCounts.set(iso3, emptyCounts());
      }

      const bucket = allCountryCounts.get(iso3)!;
      bucket[status] = (bucket[status] ?? 0) + 1;
    }

    for (const iso3 of [origin, destination]) {
      if (touched.has(iso3)) {
        countryCounts[iso3][status] =
          (countryCounts[iso3][status] ?? 0) + 1;
      }
    }
  }

  const countryCoverage = [...allCountryCounts.entries()]
    .map(([iso3, statusCounts]) => {
      const commerciallyUsableEvents =
        (statusCounts.VERIFIED ?? 0) +
        (statusCounts.DERIVED_ONLY ?? 0);

      const blockingEvents =
        (statusCounts.UNVERIFIED ?? 0) +
        (statusCounts.INELIGIBLE ?? 0);

      const totalEvents = Object.values(statusCounts).reduce(
        (sum, value) => sum + Number(value ?? 0),
        0,
      );

      return {
        iso3,
        total_events: totalEvents,
        commercially_usable_events: commerciallyUsableEvents,
        blocking_events: blockingEvents,
        status_counts: statusCounts,
        commercial_candidate:
          commerciallyUsableEvents > 0 && blockingEvents === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.commercial_candidate) - Number(a.commercial_candidate) ||
        b.commercially_usable_events - a.commercially_usable_events ||
        b.total_events - a.total_events ||
        a.iso3.localeCompare(b.iso3),
    );

  const recommendedDestination =
    countryCoverage.find(
      (item) => item.iso3 !== origin && item.commercial_candidate,
    )?.iso3 ??
    countryCoverage.find(
      (item) => item.iso3 !== origin && item.total_events > 0,
    )?.iso3 ??
    null;

  const { data: rightsProbe, error: rightsProbeError } = await db
    .from("live_structured_event_commercial_rights_evaluation")
    .select("event_id,evaluated_status")
    .limit(1);

  if (rightsProbeError) {
    throw new Error(
      `Commercial rights evaluation view unavailable: ${rightsProbeError.message}`,
    );
  }

  const originResult = await dryRunCountryRiskObject({
    country_iso3: origin,
  });
  const destinationResult = await dryRunCountryRiskObject({
    country_iso3: destination,
  });

  const asOf = new Date().toISOString();
  const corridor = await buildCorridorRiskObject({
    origin_country_iso3: origin,
    destination_country_iso3: destination,
    origin: originResult.object,
    destination: destinationResult.object,
    previous: null,
    as_of: asOf,
  });

  const endpointCommercialVerified =
    originResult.object.commercial_eligibility.status === "VERIFIED" &&
    destinationResult.object.commercial_eligibility.status === "VERIFIED";

  const endpointVerificationVerified =
    originResult.object.verification.status === "VERIFIED" &&
    destinationResult.object.verification.status === "VERIFIED";

  // Corridor v0.1 intentionally remains a pilot methodology and therefore
  // cannot be represented as independently verified commercial production.
  const commercialReady =
    endpointCommercialVerified &&
    endpointVerificationVerified &&
    corridor.commercial_eligibility.status === "VERIFIED" &&
    corridor.verification.status === "VERIFIED";

  const report = {
    generated_at: asOf,
    authoritative_project_ref: AUTHORITATIVE_PROJECT_REF,
    lookback_hours: LOOKBACK_HOURS,
    subject: {
      origin,
      destination,
      corridor_id: corridor.subject.id,
    },
    structured_event_rights: {
      total_recent_events: rows?.length ?? 0,
      status_counts: counts,
      reason_counts: Object.fromEntries(
        [...reasonCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      endpoint_status_counts: countryCounts,
      country_coverage_candidates: countryCoverage.slice(0, 15),
      recommended_destination: recommendedDestination,
      evaluation_view_readable: true,
      evaluation_probe_rows: rightsProbe?.length ?? 0,
    },
    country_objects: {
      origin: {
        object_id: originResult.object.object_id,
        risk_score: originResult.object.risk.score,
        confidence: originResult.object.confidence,
        commercial_eligibility: originResult.object.commercial_eligibility,
        verification: originResult.object.verification,
        events_used: originResult.context.country_events_used,
      },
      destination: {
        object_id: destinationResult.object.object_id,
        risk_score: destinationResult.object.risk.score,
        confidence: destinationResult.object.confidence,
        commercial_eligibility: destinationResult.object.commercial_eligibility,
        verification: destinationResult.object.verification,
        events_used: destinationResult.context.country_events_used,
      },
    },
    corridor_object: {
      object_id: corridor.object_id,
      risk_score: corridor.risk.score,
      confidence: corridor.confidence,
      commercial_eligibility: corridor.commercial_eligibility,
      verification: corridor.verification,
      methodology_version: corridor.methodology_version,
    },
    acceptance: {
      endpoint_commercial_verified: endpointCommercialVerified,
      endpoint_verification_verified: endpointVerificationVerified,
      commercial_ready: commercialReady,
      execution_authorized: false,
      note:
        "This report is read-only readiness evidence. It does not publish a Risk Object, authorize execution, move funds, or make a production-SLA/external-audit claim.",
    },
  };

  const json = JSON.stringify(report, null, 2);
  console.log(json);

  if (process.env.GITHUB_OUTPUT_FILE) {
    await Bun.write(process.env.GITHUB_OUTPUT_FILE, json + "\n");
  }

  if (requireVerified && !commercialReady) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
