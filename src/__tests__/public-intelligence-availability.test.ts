import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/public-intelligence.functions.ts", "utf8");

describe("public intelligence availability contract", () => {
  it("hard-bounds recovery reads so the page cannot hang indefinitely", () => {
    expect(source).toContain("PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS");
    expect(source).toContain(".abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS))");
  });

  it("uses only canonical scored events for bounded recovery", () => {
    expect(source).toContain('from("events")');
    expect(source).toContain('.eq("classification_version", CLASSIFICATION_VERSION)');
    expect(source).toContain('.not("severity", "is", null)');
    expect(source).toContain("derivedEnglishTitle");
    expect(source).toContain('source_name.not.ilike.%guardian%');
    expect(source).not.toContain('from("live_structured_events")');
    expect(source).not.toContain('from("live_flash_events")');
  });

  it("fails soft to the existing verified B2 package instead of inventing data", () => {
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).toContain("if (b2Rows?.length) return sortAndDedupe(b2Rows)");
    expect(source).toContain("return []");
    expect(source).not.toContain("severity: null");
  });
});
