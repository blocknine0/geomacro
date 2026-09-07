import { describe, expect, it } from "vitest";

import {
  GRI_DISPOSITION,
  buildSourceDisposition,
  dispositionHash,
  verifyDispositionCoverage,
} from "../../scripts/lib/gri-disposition-v11.js";

const event = {
  id: "event-a",
  category: "geopolitics",
  source_name: "Example Wire",
  source_domain: "example.com",
  source_url: "https://example.com/a",
  source_title: "Example event",
  summary: "Example summary",
  created_at: "2026-09-06T10:00:00.000Z",
  published_at: "2026-09-06T09:55:00.000Z",
  classification_provider: "groq",
  classification_model: "openai/gpt-oss-20b",
  classification_version: "event-severity-v1.0.4",
  classification_prompt_version: "risk-desk-filter-v1.0.4",
  classification_scored_at: "2026-09-06T10:01:00.000Z",
  classification_input_hash: "a".repeat(64),
};

const contribution = {
  eventId: "event-a",
  storyClusterId: "story-a",
  rawWeight: 0.8,
  sourceEffectiveWeight: 0.7,
  preStoryEventWeight: 0.6,
  storyEffectiveWeight: 0.5,
  effectiveEventWeight: 0.4,
  contributionPoints: 2.25,
};

describe("GRI v1.1 source disposition contract", () => {
  it("binds an included source to its exact contribution", () => {
    const row = buildSourceDisposition({
      event,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
      contribution,
    });

    expect(row.disposition).toBe("included");
    expect(row.contributionPoints).toBe(2.25);
    expect(row.rawWeight).toBe(0.8);
  });

  it("records noncanonical evidence without inventing a contribution", () => {
    const row = buildSourceDisposition({
      event: {
        ...event,
        id: "event-b",
        classification_version: "legacy-unversioned",
      },
      disposition:
        GRI_DISPOSITION.EXCLUDED_NONCANONICAL_CLASSIFICATION,
    });

    expect(row.disposition).toBe(
      "excluded_noncanonical_classification",
    );
    expect(row.contributionPoints).toBeNull();
    expect(row.storyClusterId).toBeNull();
  });

  it("requires exact candidate/disposition/contribution coverage", () => {
    const included = buildSourceDisposition({
      event,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
      contribution,
    });

    const excluded = buildSourceDisposition({
      event: { ...event, id: "event-b" },
      disposition:
        GRI_DISPOSITION.EXCLUDED_NONCANONICAL_CLASSIFICATION,
    });

    expect(
      verifyDispositionCoverage({
        candidateEventIds: ["event-a", "event-b"],
        dispositions: [excluded, included],
        contributionEventIds: ["event-a"],
      }),
    ).toEqual({
      candidateCount: 2,
      includedCount: 1,
      excludedCount: 1,
    });
  });

  it("produces the same hash regardless of row order", () => {
    const a = buildSourceDisposition({
      event,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
      contribution,
    });

    const b = buildSourceDisposition({
      event: { ...event, id: "event-b" },
      disposition:
        GRI_DISPOSITION.EXCLUDED_NONCANONICAL_CLASSIFICATION,
    });

    expect(dispositionHash([a, b])).toBe(
      dispositionHash([b, a]),
    );
  });
});

describe("GRI disposition storage precision", () => {
  it("hashes the canonical persisted precision rather than incidental JS precision", () => {
    const baseContribution = {
      ...contribution,
      rawWeight: 0.81234567891234,
      sourceEffectiveWeight: 0.71234567891234,
      preStoryEventWeight: 0.61234567891234,
      storyEffectiveWeight: 0.51234567891234,
      effectiveEventWeight: 0.41234567891234,
      contributionPoints: 2.251234567891,
    };

    const slightlyDifferent = {
      ...baseContribution,
      rawWeight: 0.81234567891239,
      sourceEffectiveWeight: 0.71234567891239,
      preStoryEventWeight: 0.61234567891239,
      storyEffectiveWeight: 0.51234567891239,
      effectiveEventWeight: 0.41234567891239,
      contributionPoints: 2.251234567899,
    };

    const a = buildSourceDisposition({
      event,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
      contribution: baseContribution,
    });

    const b = buildSourceDisposition({
      event,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
      contribution: slightlyDifferent,
    });

    expect(dispositionHash([a])).toBe(
      dispositionHash([b]),
    );
  });
});
