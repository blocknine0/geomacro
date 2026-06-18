import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripInternalIds } from "../lib/live-feed.sanitize";

const INTERNAL_ID_RE = /evt_[a-z0-9_]+/i;

describe("internal event id leakage", () => {
  it("stripInternalIds removes the `id` field from every event", () => {
    const input = [
      {
        id: "evt_geo_iran_israel_proxy_001",
        category: "geopolitics",
        narrative: "Test",
        sourceUrl: "https://example.com/a",
      },
      {
        id: "evt_macro_fed_rate_002",
        category: "macro",
        narrative: "Test 2",
        sourceUrl: "https://example.com/b",
      },
    ];
    const out = stripInternalIds(input);
    for (const e of out) {
      expect(e).not.toHaveProperty("id");
    }
    // No internal id pattern in the serialised API payload.
    expect(INTERNAL_ID_RE.test(JSON.stringify(out))).toBe(false);
  });

  it("LiveNewsFeed component source never renders an event id", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/live-news-feed.tsx"),
      "utf8",
    );
    // Forbid any rendered/bound usage of `.id` on a feed event.
    expect(src).not.toMatch(/\{e\.id\}/);
    expect(src).not.toMatch(/\{event\.id\}/);
    expect(src).not.toMatch(/e\.id\b/);
    expect(src).not.toMatch(INTERNAL_ID_RE);
  });

  it("server function pipes results through stripInternalIds before returning", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/live-feed.functions.ts"),
      "utf8",
    );
    expect(src).toMatch(/stripInternalIds\(/);
    expect(src).toMatch(/return\s*\{\s*events:\s*stripInternalIds\(/);
  });
});