import { describe, expect, it } from "vitest";
import { toCommercialAskBrief } from "../lib/ask-commercial-brief";
import type { AskAnswer } from "../lib/ask-intelligence.server";

function answer(overrides: Partial<AskAnswer> = {}): AskAnswer {
  return {
    summary: "The current verified GRI is 61/100. This is the direct answer.",
    what_changed:
      "Macro +2.10 pts. Geopolitics -0.40 pts. Critical minerals +0.20 pts. Additional implementation detail that should not need unlimited space.",
    why_it_matters:
      "The selected records should be read as supporting context, not as a separate index. The change is relevant to current risk monitoring.",
    geomacro_view:
      "This is a deterministic summary of stored records, not an external model opinion. The current dominant thread is macro risk.",
    evidence: [
      {
        eventId: "event-1",
        title: "Evidence title",
        sourceUrl: "https://example.com/source",
        relevance: 93,
      },
    ],
    insufficient_evidence: false,
    mean_relevance: 0.93,
    low_confidence: false,
    gri: 61,
    generatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("Ask Geomacro commercial brief", () => {
  it("keeps evidence, score and confidence fields unchanged", () => {
    const input = answer();
    const output = toCommercialAskBrief(input);

    expect(output.evidence).toEqual(input.evidence);
    expect(output.gri).toBe(input.gri);
    expect(output.low_confidence).toBe(input.low_confidence);
    expect(output.insufficient_evidence).toBe(input.insufficient_evidence);
    expect(output.mean_relevance).toBe(input.mean_relevance);
    expect(output.generatedAt).toBe(input.generatedAt);
  });

  it("removes repetitive internal-engine wording while keeping the assessment", () => {
    const output = toCommercialAskBrief(answer());

    expect(output.geomacro_view).not.toContain("deterministic summary");
    expect(output.geomacro_view).toContain("dominant thread is macro risk");
    expect(output.why_it_matters).toContain("supporting context, not a separate index");
  });

  it("bounds public prose without fabricating replacement content", () => {
    const long = "Relevant stored evidence remains material. ".repeat(60);
    const output = toCommercialAskBrief(
      answer({
        summary: long,
        what_changed: long,
        why_it_matters: long,
        geomacro_view: long,
      }),
    );

    expect(output.summary.length).toBeLessThanOrEqual(321);
    expect(output.what_changed.length).toBeLessThanOrEqual(521);
    expect(output.why_it_matters.length).toBeLessThanOrEqual(421);
    expect(output.geomacro_view.length).toBeLessThanOrEqual(421);
    expect(output.summary).toContain("Relevant stored evidence remains material");
  });
});
