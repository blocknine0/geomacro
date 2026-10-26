import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";

describe("Intelligence browser RPC stall recovery", () => {
  it("ends an unresolved server-function wait instead of keeping category loading indefinitely", async () => {
    const hanging = new Promise<never>(() => undefined);
    await expect(withPublicRuntimeTimeout(hanging, 15, "Intelligence publisher check timed out."))
      .rejects.toThrow("Intelligence publisher check timed out.");
  });

  it("bounds publisher requests and reads the permanent public journal without D1 fallback", () => {
    const desk = readFileSync("src/components/intelligence/stateless-live-desk.tsx", "utf8");
    expect(desk).toContain('import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";');
    expect(desk).toContain("getStatelessIntelligence({ data: { category } }),\n            9_000");
    expect(desk).toContain("fetchPermanentDerivedNews()");
    expect(desk).toContain("fetchDirectDerivedNews()");
    expect(desk).not.toContain("fetchAllDerivedNews()");
    expect(desk).not.toContain("getWebsiteDerivedNews");
    expect(desk).not.toContain("@/lib/website-derived-news.functions");
    expect(desk).toContain("setErrors(previous => ({ ...previous, ...nextErrors }))");
    expect(desk).toContain("setJournalUnavailable(true)");
    expect(desk).toContain("JOURNAL_REFRESH_MS = 2 * 60_000");
    expect(desk).not.toContain('aria-label="Filter Intelligence by country"');
    expect(desk).toContain("No eligible concrete news matches this category, search and publication window.");
    expect(desk).toContain("fallback findings may be incomplete");
    expect(desk).toContain("initialJournal = []");
    expect(desk).toContain("Previously received in-tab findings may be out of date");
    expect(desk).not.toContain("website-derived-news-html");
    // The archive and current feed are public static assets, not D1 reads.
    expect(desk).toContain("Historical findings come from the append-only static archive");
    expect(desk).toContain("No website read has a D1 or server-function fallback");
    expect(desk).not.toContain("localStorage");
    expect(desk).toContain("loadReaderPreferences()");
    expect(desk).toContain("saveReaderPreferences({ category: view, savedIds, lastVisit: visitStarted.current })");
    expect(desk).not.toContain("sessionStorage");
  });
});
