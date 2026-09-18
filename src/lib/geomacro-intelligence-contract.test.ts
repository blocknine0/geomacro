import { describe, expect, it } from "vitest";
import {
  GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
  intelligenceStateVersion,
  publicStructuralDevelopment,
  publicStructuralObservation,
  structuralEventVersion,
} from "./geomacro-intelligence-contract";

describe("Geomacro intelligence contract v1", () => {
  it("preserves the existing adaptive API product identity", () => {
    expect(GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA).toBe(
      "geomacro.adaptive-intelligence-response.v1",
    );
    expect(GEOMACRO_INTELLIGENCE_PRODUCT_ID).toBe(
      "geomacro_adaptive_risk_intelligence_v1",
    );
    expect(GEOMACRO_INTELLIGENCE_CONTRACT_VERSION).toBe(
      "geomacro.intelligence-contract.v1",
    );
  });

  it("never exposes raw source identity in structural observations", () => {
    const row = publicStructuralObservation(
      {
        observation_id: "obs-1",
        source_id: "internal-source",
        dimension: "macro_monetary",
        country_iso3: "IND",
        partner_country_iso3: null,
        observed_at: "2026-09-18T23:00:00.000Z",
        published_at: "2026-09-18T22:30:00.000Z",
        metric: "policy_rate",
        value_numeric: 6.5,
        value_text: null,
        unit: "percent",
        event_type: null,
        signal_type: "structural",
        source_url: "https://internal.example/source",
        parser_version: "parser-v1",
        methodology_status: "verified",
        quality_status: "VERIFIED",
        provenance: { provider: "internal-source" },
        normalized_hash: "hash",
        retrieved_at: "2026-09-18T23:01:00.000Z",
      },
      "2026-09-19T00:00:00.000Z",
    );

    expect(row).not.toHaveProperty("source_id");
    expect(row).not.toHaveProperty("source_url");
    expect(row).not.toHaveProperty("provenance");
    expect(JSON.stringify(row)).not.toContain("internal-source");
  });

  it("turns an event into a versioned structural development without raw text", () => {
    const event = {
      event_id: "event-1",
      story_key: "canonical-story-1",
      event_type: "policy",
      families: ["macro", "trade"],
      primary_country: "IND",
      countries: ["IND", "USA"],
      severity: 71,
      confidence: 0.84,
      direction: "escalating",
      status: "active",
      first_seen_at: "2026-09-18T20:00:00.000Z",
      last_seen_at: "2026-09-19T00:00:00.000Z",
      evidence_count: 7,
      independent_source_count: 3,
      structure_version: "structure-v2",
      classification_version: "classification-v3",
    };

    const development = publicStructuralDevelopment(event);

    expect(development.event_version).toMatch(/^sev_[a-f0-9]{24}$/);
    expect(development.materiality).toBe("HIGH");
    expect(development.affected_countries).toEqual(["IND", "USA"]);
    expect(JSON.stringify(development)).not.toContain("title");
    expect(JSON.stringify(development)).not.toContain("summary");
  });

  it("keeps state versions stable until an input changes", () => {
    const base = {
      subject: { type: "country" as const, country_iso3: "CHN" },
      as_of: "2026-09-19T00:00:00.000Z",
      risk_calculation_hash: "a".repeat(64),
      structural_observation_hashes: ["b".repeat(64)],
      structural_coverage: [
        {
          dimension: "macro",
          country_iso3: "CHN",
          coverage_year: 2026,
          coverage_status: "USABLE",
          latest_observed_at: "2026-09-18T23:00:00.000Z",
        },
      ],
      event_versions: [structuralEventVersion({
        event_id: "event-1",
        story_key: "story-1",
        event_type: "policy",
        primary_country: "CHN",
        countries: ["CHN"],
        severity: 50,
        confidence: 0.8,
        direction: "steady",
        status: "active",
        first_seen_at: "2026-09-18T20:00:00.000Z",
        last_seen_at: "2026-09-18T23:00:00.000Z",
        structure_version: "v1",
        classification_version: "v1",
      })],
    };

    const same = intelligenceStateVersion({
      ...base,
      as_of: "2026-09-19T00:05:00.000Z",
    });
    const changed = intelligenceStateVersion({
      ...base,
      structural_observation_hashes: ["c".repeat(64)],
    });

    expect(intelligenceStateVersion(base)).toBe(same);
    expect(changed).not.toBe(intelligenceStateVersion(base));
  });
});
