import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";

describe("Intelligence browser RPC stall recovery", () => {
  it("ends an unresolved server-function wait instead of keeping category loading indefinitely", async () => {
    const hanging = new Promise<never>(() => undefined);
    await expect(withPublicRuntimeTimeout(hanging, 15, "Intelligence publisher check timed out."))
      .rejects.toThrow("Intelligence publisher check timed out.");
  });

  it("bounds every browser publisher request and the fallback journal RPC", () => {
    const desk = readFileSync("src/components/intelligence/stateless-live-desk.tsx", "utf8");
    expect(desk).toContain('import { withPublicRuntimeTimeout } from "@/lib/public-runtime-timeout";');
    expect(desk).toContain("getStatelessIntelligence({ data: { category } }),\n            9_000");
    expect(desk).toContain('getWebsiteDerivedNews(),\n            9_000');
    expect(desk).toContain("setErrors(previous => ({ ...previous, ...nextErrors }))");
    expect(desk).toContain("setJournalUnavailable(true)");
    expect(desk).toContain("fetchAllDerivedNews()");
    expect(desk).toContain("initialJournal = []");
    expect(desk).toContain("Previously received in-tab findings may be out of date");
    expect(desk).toContain("https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-html");
    // Underlying requests can settle after the UI timed out; no mutation
    // to upstream source clocks, credits, public scores, or private storage.
    expect(desk).not.toContain("localStorage");
    expect(desk).not.toContain("sessionStorage");
  });
});
