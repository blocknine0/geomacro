import { describe, expect, it } from "vitest";
import { publicEventExplanation } from "./public-intelligence-explanation";
import type { IntelEvent } from "./use-intelligence";

const observed: Pick<IntelEvent, "category" | "title" | "publicStatus"> = {
  category: "geopolitics",
  title: "Geomacro observes threat activity in United States",
  publicStatus: "live_observed",
};

describe("shared public threat-type explanation", () => {
  it("explains the verified threat category without inventing an attacker or type of attack", () => {
    const context = publicEventExplanation(observed);
    expect(context).toEqual({
      label: "Threat type",
      text: "Reported threats or warnings of possible action. The available update does not identify a specific actor or target.",
    });
    expect(context?.text).not.toMatch(/terrorism|cyber|bomb|military strike|confirmed attack|article|source URL/iu);
  });

  it("handles different places without assuming actor or target location", () => {
    expect(publicEventExplanation({ ...observed, title: "Geomacro observes threat activity in India" }))
      .toEqual(publicEventExplanation(observed));
  });

  it("does not invent explanations for non-threat events, unrelated categories or scored intelligence", () => {
    for (const event of [
      { ...observed, title: "Geomacro observes protest activity in United States" },
      { ...observed, title: "Geomacro observes assault activity in United States" },
      { ...observed, title: "Geomacro observes fighting in United States" },
      { ...observed, title: "Geomacro finds threat activity in United States", publicStatus: "verified_b2" as const },
      { ...observed, title: "Geomacro observes threat activity in United States", category: "macro" },
      { ...observed, title: "Publisher: threat activity in United States" },
    ]) {
      expect(publicEventExplanation(event)).toBeNull();
    }
    expect(publicEventExplanation(null)).toBeNull();
  });
});
