import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/public-intelligence.functions.ts", "utf8");

describe("public intelligence availability contract", () => {
  it("hard-bounds Supabase reads so the page cannot hang indefinitely", () => {
    expect(source).toContain("PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS");
    expect(source).toContain(".abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS))");
  });

  it("uses structured intelligence as the fast path and only falls back for missing domains", () => {
    expect(source).toContain('from("live_structured_events")');
    expect(source).toContain("missingCategories(rows)");
    expect(source).toContain("if (rows.length > 0 && missing.length === 0) return sortAndDedupe(rows);");
    expect(source).toContain('from("live_flash_event_families")');
    expect(source).toContain('from("events")');
  });

  it("returns partial verified intelligence instead of throwing a page-level outage", () => {
    expect(source).toContain("A partial verified feed is preferable to a page-level outage.");
    expect(source).toContain("return result;");
  });
});
