import { describe, expect, it } from "vitest";
import { buildCountryRiskObject } from "../lib/country-risk-engine";

describe("Federico strict evidence-gap continuity", () => {
  it("carries forward the previous score without inventing cooling when no fresh evidence exists", async () => {
    const previous = {
      schema_version: "gro-1.1",
      subject: {
        type: "country",
        id: "CHN",
      },
      methodology_version: "country-risk-v0.1.0-pilot",
      risk: {
        score: 57.388,
      },
      attribution: [
        {
          driver: "conflict",
          score_contribution: 57.388,
          delta_contribution: 1.25,
          event_count: 2,
          weight: 0.75,
        },
      ],
    } as any;

    const result = await buildCountryRiskObject({
      country_iso3: "CHN",
      events: [],
      previous,
      as_of: "2026-09-19T04:30:00.000Z",
      calculation_namespace: "federico_strict_evidence_v1",
    });

    expect(result.risk.score).toBe(57.4);
    expect(result.risk.previous_score).toBe(57.388);
    expect(result.risk.delta).toBeNull();
    expect(result.risk.direction).toBe("unknown");
    expect(result.decision_readiness.status).toBe("UNREADY");
    expect(result.decision_readiness.reason_codes).toContain(
      "no_fresh_evidence",
    );
    expect(result.decision_readiness.reason_codes).toContain(
      "score_carried_forward_without_fresh_evidence",
    );
    expect(result.provenance.reproducibility.score_components.raw_score).toBe(
      57.4,
    );
    expect(result.attribution[0]?.score_contribution).toBe(57.388);
    expect(result.attribution[0]?.delta_contribution).toBeNull();
    expect(result.attribution[0]?.event_count).toBe(0);
    expect(result.attribution[0]?.weight).toBe(0);
  });
});


  it("bounds strict evidence deterministically and keeps the signed review payload under the provider artifact ceiling", async () => {
    const events = Array.from({ length: 12 }, (_, index) => {
      const family = index % 2 === 0 ? "gdelt_structured" : "scmp_china_rss";
      return {
        id: `strict-event-${index.toString().padStart(2, "0")}`,
        domain: "geopolitics" as const,
        event_type: "trade_policy",
        title: `Governed China trade-policy evidence ${index}`,
        primary_country: "CHN",
        countries: ["CHN"],
        severity: 45 + index,
        confidence: 92,
        direction: "escalating" as const,
        first_seen_at: "2026-09-25T08:00:00.000Z",
        last_seen_at: "2026-09-25T08:10:00.000Z",
        evidence_count: 1,
        independent_source_count: 2,
        evidence_refs: [`evidence-ref-${index}`],
        structure_version: "live-structured-v1",
        structured_payload: {
          scoring_version: "scoring-v1",
          relevance_version: "relevance-v1",
          country_version: "country-v1",
          story_version: "story-v1",
        },
        source_ids: Array.from(
          { length: 6 },
          (_, sourceIndex) =>
            `${family}-source-${sourceIndex}-${index}`,
        ),
        source_record_ids: Array.from(
          { length: 6 },
          (_, sourceIndex) =>
            `source-record-${index}-${sourceIndex}-production`,
        ),
        source_urls: Array.from(
          { length: 6 },
          (_, sourceIndex) =>
            `https://example.com/source/${index}/${sourceIndex}`,
        ),
        source_families: Array.from(
          { length: 6 },
          (_, sourceIndex) =>
            `${family}-family-${sourceIndex}`,
        ),
        content_hashes: Array.from(
          { length: 6 },
          (_, sourceIndex) =>
            `content-hash-${index}-${sourceIndex}-1234567890abcdef`,
        ),
        relevance_reason:
          "Deterministic country linkage test evidence with production-shaped provenance metadata that is intentionally compacted in the strict signed object.",
        transmission_channel: "governed_test_feed",
        relevance_weight: 1,
        subject_is_primary: true,
        subject_attribution_confidence: 95,
        subject_attribution_method: "test_registry_v1",
        material_evidence_at: "2026-09-25T08:10:00.000Z",
        corroboration_status: "CONFIRMED" as const,
      };
    });

    const result = await buildCountryRiskObject({
      country_iso3: "CHN",
      events,
      as_of: "2026-09-25T08:20:00.000Z",
      calculation_namespace: "federico_strict_evidence_v1",
    });

    expect(result.decision_readiness.status).toBe("READY");
    expect(result.evidence).toHaveLength(8);
    expect(
      result.provenance.reproducibility.selection_policy
        .max_included_evidence_items,
    ).toBe(8);
    expect(
      result.provenance.reproducibility.calculation_input.events,
    ).toHaveLength(8);
    expect(result.evidence).toSatisfy((items) =>
      items.every(
        (item: any) =>
          !Object.prototype.hasOwnProperty.call(item, "source_urls") &&
          !Object.prototype.hasOwnProperty.call(item, "source_families") &&
          !Object.prototype.hasOwnProperty.call(item, "transmission_channel") &&
          !Object.prototype.hasOwnProperty.call(item, "relevance_reason"),
      ),
    );
    expect(
      result.provenance.reproducibility.hash_inputs,
    ).toEqual({
      data_projection_version: "country-risk-data-projection-v2",
      data_projection_sha256: expect.any(String),
    });
    expect(
      Buffer.byteLength(JSON.stringify(result), "utf8"),
    ).toBeLessThan(20_000);
  });
