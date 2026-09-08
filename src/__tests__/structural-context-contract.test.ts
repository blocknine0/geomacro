import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STRUCTURAL_METHODOLOGY_STATUS,
  latestStructuralObservations,
  type StructuralObservation,
} from "../lib/structural-context.server";

const ROOT = process.cwd();

function row(
  overrides: Partial<StructuralObservation> & Pick<StructuralObservation, "observation_id">,
): StructuralObservation {
  return {
    observation_id: overrides.observation_id,
    source_id: overrides.source_id ?? "test-source",
    source_record_id: overrides.source_record_id ?? null,
    dimension: overrides.dimension ?? "conflict_exposure",
    country_iso3: overrides.country_iso3 ?? "USA",
    partner_country_iso3: overrides.partner_country_iso3 ?? null,
    observed_at: overrides.observed_at ?? "2026-01-01T00:00:00.000Z",
    published_at: overrides.published_at ?? null,
    metric: overrides.metric ?? "events",
    value_numeric: overrides.value_numeric ?? 1,
    value_text: overrides.value_text ?? null,
    unit: overrides.unit ?? "count",
    event_type: overrides.event_type ?? null,
    signal_type: overrides.signal_type ?? null,
    source_url: overrides.source_url ?? "https://example.com/source",
    parser_version: overrides.parser_version ?? "test-v1",
    methodology_status:
      overrides.methodology_status ?? STRUCTURAL_METHODOLOGY_STATUS,
    quality_status: overrides.quality_status ?? "verified",
    provenance: overrides.provenance ?? {},
    normalized_hash: overrides.normalized_hash ?? "a".repeat(64),
    retrieved_at: overrides.retrieved_at ?? "2026-01-02T00:00:00.000Z",
  };
}

describe("structural context contract", () => {
  it("keeps structural evidence explicitly outside GRI v1.2 scoring", () => {
    expect(STRUCTURAL_METHODOLOGY_STATUS).toBe(
      "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    );
  });

  it("selects the newest observation per dimension/metric/country pair", () => {
    const result = latestStructuralObservations([
      row({
        observation_id: "old",
        observed_at: "2025-01-01T00:00:00.000Z",
      }),
      row({
        observation_id: "new",
        observed_at: "2026-01-01T00:00:00.000Z",
      }),
      row({
        observation_id: "different-metric",
        metric: "fatalities",
        observed_at: "2025-06-01T00:00:00.000Z",
      }),
    ]);

    expect(result.map((item) => item.observation_id)).toEqual([
      "new",
      "different-metric",
    ]);
  });

  it("never queries the private raw structural table", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/structural-context.server.ts"),
      "utf8",
    );

    expect(source).toContain(
      '.from("commercial_structural_geopolitical_observations")',
    );
    expect(source).not.toMatch(
      /\.from\(["']structural_geopolitical_observations["']\)/,
    );
  });

  it("requires historical service credentials to stay server-only", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/structural-context.server.ts"),
      "utf8",
    );

    expect(source).toContain("HISTORICAL_SUPABASE_URL");
    expect(source).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("VITE_HISTORICAL_");
  });
});
