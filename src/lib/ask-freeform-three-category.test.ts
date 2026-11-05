import { describe, expect, it } from "vitest";
import { askDomains, domainGuideAnswer } from "./ask-domain-guide";
import { buildRealtimeSearchPlan } from "./ask-realtime-query-plan";
import { needsConversationInterpretation } from "./ask-conversation-understanding.server";

describe("Ask GeoMacro free-form three-category routing", () => {
  it.each([
    ["What has OPEC announced?", ["macro"]],
    ["What is happening in the Red Sea?", ["geopolitics"]],
    ["How do battery materials affect mineral processing?", ["rare_earth"]],
    ["How do sanctions affect inflation and copper supply?", ["geopolitics", "macro", "rare_earth"]],
  ] as const)("recognizes implicit category vocabulary: %s", (question, expected) => {
    expect(askDomains(question)).toEqual(expected);
  });

  it("routes all three topics to three bounded index lanes, not a single guessed sector", () => {
    expect(buildRealtimeSearchPlan("Latest sanctions, inflation and lithium news"))
      .toMatchObject({ broadCategories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"] });
    expect(buildRealtimeSearchPlan("OPEC developments today"))
      .toMatchObject({ broadCategories: ["MACRO"] });
  });

  it.each(["What has changed in US?", "What is happening in UK?", "What happened today?", "Give me news today"])(
    "does not reject an implicit country or broad three-domain prompt: %s",
    question => expect(domainGuideAnswer(question)).toBeNull(),
  );

  it("answers a timeless mixed-domain causal question as educational, not as fabricated live news", () => {
    const answer = domainGuideAnswer("How do sanctions affect inflation and copper supply?");
    expect(answer).toMatchObject({
      answer_kind: "explainer", insufficient_evidence: false, low_confidence: false,
      gri: null, evidence: [], source_identity_exposed: false,
      durable_live_storage_write: false,
    });
    expect(answer?.summary).toContain("Export controls");
    expect(answer?.summary).toContain("Interest rates");
    expect(answer?.real_time_message).toContain("no live observation");
  });

  it("answers the named mineral instead of dropping it in a cross-sector explainer", () => {
    const answer = domainGuideAnswer("How do sanctions affect inflation and copper supply?");
    expect(answer?.summary).toContain("For copper specifically");
    expect(answer?.summary).toContain("physical shortage");
    expect(answer?.evidence).toEqual([]);
    expect(answer?.gri).toBeNull();
    const lithium = domainGuideAnswer("How do export controls affect interest rates and lithium?");
    expect(lithium?.summary).toContain("For lithium specifically");
    expect(lithium?.insufficient_evidence).toBe(false);
  });

  it("keeps mixed current/country/forecast questions on verified retrieval", () => {
    for (const question of [
      "How are sanctions affecting inflation and lithium prices in China today?",
      "Predict how sanctions affect critical minerals and FX next year",
    ]) expect(domainGuideAnswer(question)).toBeNull();
  });

  it("retains unclassified free-form language interpretation without treating it as research evidence", () => {
    expect(needsConversationInterpretation("What is happening with a distant blockade?")).toBe(true);
    expect(needsConversationInterpretation("Latest inflation in India?")).toBe(false);
    expect(needsConversationInterpretation("What happened today?")).toBe(false);
  });

  it("continues to reject unrelated coding and medical questions at the public scope boundary", () => {
    expect(domainGuideAnswer("Write Python code about inflation")?.answer_kind).toBe("guidance");
    expect(domainGuideAnswer("What is JavaScript?")?.answer_kind).toBe("guidance");
  });
});
