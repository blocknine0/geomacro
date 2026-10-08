import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publicIntelligenceClarification } from "./public-intelligence-clarification";

const observed = {
  title: "Geomacro observes threat activity in United States",
  category: "geopolitics",
  summary: null,
};

describe("commercial intelligence: clarify vague threat headings", () => {
  it("clarifies the Oct 8 United States signal without making up a subtype", () => {
    const context = publicIntelligenceClarification(observed);
    expect(context).toBe("Security concerns are flagged, but the specific type of threat is not identified.");
    expect(context).not.toMatch(/terrorism|cyberattack|military strike|violent attack|border clash/iu);
  });

  it("uses a separately approved concise derived summary when it actually exists", () => {
    const context = publicIntelligenceClarification({
      ...observed,
      title: "Geomacro finds threat activity in United States",
      summary: "A verified cyber disruption affected public transport services",
    });
    expect(context).toBe("A verified cyber disruption affected public transport services");
  });

  it("refuses raw, editorial or unbounded text instead of leaking upstream material", () => {
    for (const summary of [
      "Read this article from the original publisher",
      "https://private-feed.invalid/evidence",
      "Published raw payload with the source text",
      "<a href='/raw'>Raw text excerpt</a>",
      "x".repeat(250),
    ]) {
      expect(publicIntelligenceClarification({ ...observed, summary }))
        .toBe("Security concerns are flagged, but the specific type of threat is not identified.");
    }
  });

  it("does not invent context for already specific events or other risk categories", () => {
    expect(publicIntelligenceClarification({
      ...observed, title: "Geomacro finds a cyber disruption in United States",
    })).toBeNull();
    expect(publicIntelligenceClarification({
      ...observed, category: "macro",
    })).toBeNull();
  });

  it("shows the exact same short context on homepage, Intelligence cards and event detail", () => {
    for (const path of [
      "src/components/home/live-intelligence-showcase.tsx",
      "src/routes/intelligence.tsx",
      "src/components/intelligence/card.tsx",
      "src/components/intelligence/event-detail-workspace.tsx",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).toContain("publicIntelligenceClarification");
      expect(text).toContain("{clarification");
    }
  });
});
