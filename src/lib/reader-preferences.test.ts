import { describe, expect, it, vi } from "vitest";
import { parseReaderPreferences, saveReaderPreferences, loadReaderPreferences } from "./reader-preferences";
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

 it("persists only reader metadata and strips runtime extra fields", () => {
   const setItem = vi.fn();
   vi.stubGlobal("localStorage", {getItem: () => null, setItem});
   saveReaderPreferences(Object.assign({category: "macro" as const, savedIds: ["a"], lastVisit: 100}, {sourceText: "must not persist", feed: ["private"]}));
   expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({category:"macro",savedIds:["a"],lastVisit:100});
   vi.unstubAllGlobals();
 });
 it("keeps reading available when storage is denied", () => {
   vi.stubGlobal("localStorage", {getItem: () => {throw Error("denied");}, setItem: () => {throw Error("denied");}});
   expect(loadReaderPreferences()).toEqual({category:"geopolitics",savedIds:[],lastVisit:null});
   expect(() => saveReaderPreferences({category:"macro",savedIds:[],lastVisit:100})).not.toThrow();
   vi.unstubAllGlobals();
 });
