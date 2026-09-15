// Canonical selector for Dan Commercial Readiness Evidence v2. The retired v1
// workflow used a fixed USA/CHN pair and could fail honestly when either endpoint
// was not commercially eligible; v2 selects only current verified proof scope.
import { createClient } from "@supabase/supabase-js";

import { buildCorridorRiskObject } from "../src/lib/corridor-risk-engine";
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const LOOKBACK_HOURS = Number(process.env.DAN_PAIR_LOOKBACK_HOURS ?? 72);
const READ_ATTEMPTS = 4;

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "unknown_object_error";
    }
  }
  return String(error);
}

async function withReadRetry<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = READ_ATTEMPTS,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const delayMs = attempt * 2_000;
      console.error(
        `${label} attempt ${attempt}/${attempts} failed: ${errorMessage(error)}; retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `${label} failed after ${attempts} attempts: ${errorMessage(lastError)}`,
  );
}

function countriesForEvent(row: Record<string, unknown>) {
  const countries = new Set<string>();
  const primary = String(row.primary_country ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(primary)) countries.add(primary);
  for (const value of Array.isArray(row.countries) ? row.countries : []) {
    const iso3 = String(value ?? "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iso3)) countries.add(iso3);
  }
  return countries;
}

async function main() {
  const supabaseUrl = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const serviceRole = String(
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Authoritative Supabase credentials are required");
  }
  if (projectRef(supabaseUrl) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("Refusing non-authoritative Supabase project");
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const rows = await withReadRetry("load recent structured events", async () => {
    const result = await db
      .from("live_structured_events")
      .select("primary_country,countries,commercial_eligibility_status,last_seen_at")
      .gte("last_seen_at", cutoff);

    if (result.error) throw result.error;
    return (result.data ?? []) as Record<string, unknown>[];
  });

  const coverage = new Map<
    string,
    { usable: number; blocking: number; verified: number; derived: number }
  >();

  for (const row of rows) {
    const status = String(row.commercial_eligibility_status ?? "UNVERIFIED");
    for (const iso3 of countriesForEvent(row)) {
      const current = coverage.get(iso3) ?? {
        usable: 0,
        blocking: 0,
        verified: 0,
        derived: 0,
      };
      if (status === "VERIFIED") {
        current.usable += 1;
        current.verified += 1;
      } else if (status === "DERIVED_ONLY") {
        current.usable += 1;
        current.derived += 1;
      } else {
        current.blocking += 1;
      }
      coverage.set(iso3, current);
    }
  }

  const candidates: Array<{
    iso3: string;
    confidence: number;
    score: number;
    events_used: number;
    usable_recent_events: number;
    object: Awaited<ReturnType<typeof dryRunCountryRiskObject>>["object"];
  }> = [];

  const eligibleIso3 = [...coverage.entries()]
    .filter(([, item]) => item.usable > 0 && item.blocking === 0)
    .map(([iso3]) => iso3)
    .sort();

  for (const iso3 of eligibleIso3) {
    try {
      const dryRun = await withReadRetry(
        `dry-run country ${iso3}`,
        () => dryRunCountryRiskObject({ country_iso3: iso3 }),
        3,
      );
      const object = dryRun.object;
      if (
        object.commercial_eligibility.status !== "VERIFIED" ||
        object.verification.status !== "VERIFIED" ||
        dryRun.context.country_events_used <= 0
      ) {
        continue;
      }
      candidates.push({
        iso3,
        confidence: object.confidence,
        score: object.risk.score,
        events_used: dryRun.context.country_events_used,
        usable_recent_events: coverage.get(iso3)?.usable ?? 0,
        object,
      });
    } catch (error) {
      console.error(
        `country ${iso3} excluded after retry-safe dry run: ${errorMessage(error)}`,
      );
    }
  }

  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.events_used - a.events_used ||
      b.usable_recent_events - a.usable_recent_events ||
      a.iso3.localeCompare(b.iso3),
  );

  if (candidates.length === 0) {
    throw new Error("No current commercially verified country candidate is available");
  }

  let selectedPair: null | {
    origin: (typeof candidates)[number];
    destination: (typeof candidates)[number];
    corridor: Awaited<ReturnType<typeof buildCorridorRiskObject>>;
  } = null;

  for (let i = 0; i < candidates.length && !selectedPair; i++) {
    for (let j = 0; j < candidates.length && !selectedPair; j++) {
      if (i === j) continue;
      const origin = candidates[i];
      const destination = candidates[j];
      const corridor = await buildCorridorRiskObject({
        origin_country_iso3: origin.iso3,
        destination_country_iso3: destination.iso3,
        origin: origin.object,
        destination: destination.object,
        previous: null,
        as_of: new Date().toISOString(),
      });
      if (
        corridor.commercial_eligibility.status === "VERIFIED" &&
        corridor.verification.status === "VERIFIED"
      ) {
        selectedPair = { origin, destination, corridor };
      }
    }
  }

  const primary = selectedPair?.origin ?? candidates[0];
  const secondary = selectedPair?.destination ?? null;
  const proofMode = selectedPair ? "corridor_pair" : "single_country";

  const output = {
    schema_version: "geomacro-commercial-country-selection-1.2",
    generated_at: new Date().toISOString(),
    lookback_hours: LOOKBACK_HOURS,
    proof_mode: proofMode,
    candidate_count: candidates.length,
    origin_country_iso3: primary.iso3,
    destination_country_iso3: secondary?.iso3 ?? null,
    selection_basis: {
      country_commercial_eligibility: "VERIFIED",
      country_verification: "VERIFIED",
      no_recent_blocking_event: true,
      positive_country_evidence_count: true,
      retry_safe_read_selection: true,
      corridor_commercial_eligibility:
        selectedPair?.corridor.commercial_eligibility.status ?? null,
      corridor_verification: selectedPair?.corridor.verification.status ?? null,
    },
    origin: {
      confidence: primary.confidence,
      score: primary.score,
      events_used: primary.events_used,
    },
    destination: secondary
      ? {
          confidence: secondary.confidence,
          score: secondary.score,
          events_used: secondary.events_used,
        }
      : null,
    fallback_reason:
      selectedPair === null
        ? `Only ${candidates.length} current clean country candidate(s) were available, so the proof must remain single-country rather than inventing or weakening a corridor.`
        : null,
    claim_boundary: {
      selection_is_runtime_evidence_not_permanent_country_whitelist: true,
      source_rights_are_not_relaxed: true,
      single_country_fallback_is_allowed_when_no_verified_pair_exists: true,
      corridor_claim_requires_two_clean_endpoints: true,
      execution_authorized: false,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
