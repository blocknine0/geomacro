import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { buildAgentQueryPlan } from "../lib/agent-query-plan";
import { loadAgentHotTopics } from "../lib/agent-query-hot-topics.server";
import { loadCommercialRiskObjectForAgentQuery } from "../lib/agent-query-external-modules.server";
import { intelligenceStateVersion } from "../lib/geomacro-intelligence-contract";
import { loadStructuralContext } from "../lib/structural-context.server";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function parseSubject(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = params.get("country")?.trim().toUpperCase() ?? null;
  const origin = params.get("origin")?.trim().toUpperCase() ?? null;
  const destination = params.get("destination")?.trim().toUpperCase() ?? null;

  if (country && (origin || destination)) {
    throw new Error("Specify either country or origin+destination");
  }
  if (country) {
    if (!/^[A-Z]{3}$/.test(country)) throw new Error("country must be ISO3");
    return { type: "country" as const, country_iso3: country };
  }
  if (origin || destination) {
    if (!origin || !destination || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
      throw new Error("origin and destination must both be ISO3");
    }
    if (origin === destination) throw new Error("origin and destination must differ");
    return {
      type: "corridor" as const,
      origin_country_iso3: origin,
      destination_country_iso3: destination,
    };
  }
  throw new Error("country or origin+destination is required");
}

function freshnessStatus(ageSeconds: number | null) {
  if (ageSeconds === null) return "UNKNOWN" as const;
  if (ageSeconds <= 86_400) return "CURRENT" as const;
  if (ageSeconds <= 7 * 86_400) return "AGING" as const;
  return "STALE" as const;
}

export const Route = createFileRoute("/api/intelligence/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const subject = parseSubject(request);
          const knownStateVersion =
            new URL(request.url).searchParams.get("known_state_version")?.trim() || null;

          const plan = buildAgentQueryPlan({
            question: "What is the current structural risk state?",
            subjects: [subject],
            topics: ["risk_object", "hot_topics"],
            detail: "compact",
          });

          const asOf = new Date().toISOString();
          const [risk, structural, hotTopics] = await Promise.all([
            loadCommercialRiskObjectForAgentQuery(subject, asOf),
            loadStructuralContext(subject),
            loadAgentHotTopics({ plan, subject }),
          ]);

          if (!risk) {
            return Response.json(
              {
                ok: false,
                deliverable: false,
                error: "CURRENT_RISK_STATE_UNAVAILABLE",
                execution_authorized: false,
              },
              {
                status: 503,
                headers: {
                  "Cache-Control": "no-store",
                  "X-Content-Type-Options": "nosniff",
                },
              },
            );
          }

          const eventVersions = (hotTopics.events ?? []).map((event) => {
            const countries = [
              ...(event.primary_country ? [event.primary_country] : []),
              ...event.countries,
            ].filter((value) => /^[A-Z]{3}$/.test(value)).sort();
            return sha256({
              event_id: event.event_id,
              event_type: event.event_type,
              families: [...event.families].sort(),
              countries,
              severity: event.severity,
              confidence: event.confidence,
              direction: event.direction,
              status: event.status,
              structure_version: event.structure_version,
              classification_version: event.classification_version,
            }).slice(0, 24);
          });

          const observationHashes = structural.observations
            .map((row) => row.normalized_hash)
            .filter((value): value is string => typeof value === "string")
            .sort();

          const coverage = structural.metadata.coverage.map((row) => ({
            dimension: row.dimension,
            country_iso3: row.country_iso3,
            coverage_year: row.coverage_year,
            coverage_status: row.coverage_status,
            latest_observed_at: row.latest_observed_at,
          }));

          const stateVersion = intelligenceStateVersion({
            subject,
            as_of: asOf,
            risk_calculation_hash: risk.integrity.calculation_hash,
            structural_observation_hashes: observationHashes,
            structural_coverage: coverage,
            event_versions: eventVersions,
          });

          const timestamps = [
            risk.generated_at,
            risk.observed_at,
            structural.metadata.coverage
              .map((row) => row.latest_observed_at)
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? null,
            hotTopics.events.map((event) => event.last_observed_at).sort().at(-1) ?? null,
          ].filter((value): value is string => Boolean(value));

          const newestTimestamp = timestamps
            .map((value) => Date.parse(value))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a)[0] ?? null;
          const ageSeconds =
            newestTimestamp === null
              ? null
              : Math.max(0, Math.floor((Date.now() - newestTimestamp) / 1000));

          return Response.json(
            {
              ok: true,
              deliverable: true,
              subject,
              state_version: stateVersion,
              state_changed: knownStateVersion ? knownStateVersion !== stateVersion : null,
              known_state_version: knownStateVersion,
              as_of: asOf,
              freshness: {
                age_seconds: ageSeconds,
                status: freshnessStatus(ageSeconds),
              },
              change_signals: {
                current_event_signal: hotTopics.current_event_signal,
                canonical_development_count: hotTopics.commercially_deliverable_event_count,
                structural_observation_count: structural.observations.length,
              },
              payment: {
                required_for_current_intelligence: true,
                endpoint: "/api/x402/intelligence",
              },
              commercial_boundary: {
                raw_source_identity_exposed: false,
                raw_article_material_exposed: false,
                score_exposed: false,
                execution_authorized: false,
              },
            },
            {
              headers: {
                "Cache-Control": "public, max-age=10, must-revalidate",
                "X-Content-Type-Options": "nosniff",
                "Access-Control-Allow-Origin": "*",
              },
            },
          );
        } catch (error) {
          return Response.json(
            {
              ok: false,
              deliverable: false,
              error: error instanceof Error ? error.message : "STATE_CHECK_FAILED",
              execution_authorized: false,
            },
            {
              status: 400,
              headers: {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Access-Control-Allow-Origin": "*",
              },
            },
          );
        }
      },
    },
  },
});
