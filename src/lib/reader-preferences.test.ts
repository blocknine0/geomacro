import { describe, expect, it } from "vitest";
import { parseReaderPreferences } from "./reader-preferences";
describe("reader preferences survive untrusted browser storage", () => {
  it("recovers from missing or malformed storage without claiming a prior visit", () => {
    for (const raw of [null, "broken", "[]", "null"])
      expect(parseReaderPreferences(raw).lastVisit).toBeNull();
  });
  it("keeps only valid unique IDs, supported categories and a real past visit", () => {
    expect(
      parseReaderPreferences(
        JSON.stringify({ category: "macro", savedIds: ["a", "a", 4, "", "b"], lastVisit: 20 }),
        30,
      ),
    ).toEqual({ category: "macro", savedIds: ["a", "b"], lastVisit: 20 });
    expect(
      parseReaderPreferences(
        JSON.stringify({ category: "bogus", savedIds: [], lastVisit: 40 }),
        30,
      ),
    ).toEqual({ category: "geopolitics", savedIds: [], lastVisit: null });
  });
  it("bounds the storage footprint without storing source text", () => {
    expect(
      parseReaderPreferences(
        JSON.stringify({ savedIds: Array.from({ length: 250 }, (_, i) => String(i)) }),
      ).savedIds,
    ).toHaveLength(200);
  });
});
