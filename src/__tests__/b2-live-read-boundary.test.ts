import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("non-destructive B2 live read boundary", () => {
  it("keeps private B2 credentials server-only and fail-soft", () => {
    const source = read("src/lib/b2-live.server.ts");
    expect(source).toContain("process.env.B2_KEY_ID");
    expect(source).toContain("process.env.B2_APPLICATION_KEY");
    expect(source).not.toContain("VITE_B2");
    expect(source).toContain("REQUEST_TIMEOUT_MS = 3_500");
    expect(source).toContain("CIRCUIT_OPEN_MS = 30_000");
  });

  it("keeps verified public Intelligence readable from B2 during a bounded Supabase pause", () => {
    const source = read("src/lib/b2-live.server.ts");
    expect(source).toContain("PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("tries B2 before the unchanged bounded Supabase Intelligence fallback", () => {
    const source = read("src/lib/public-intelligence.functions.ts");
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).toContain("readPublicIntelligenceRowsFromSupabase");
    expect(source.indexOf("const b2Rows = await readB2PublicIntelligence()"))
      .toBeLessThan(source.indexOf("return readPublicIntelligenceRowsFromSupabase();"));
    expect(source).toContain("A partial verified feed is preferable to a page-level outage.");
  });

  it("tries verified B2 risk before preserving both established fallbacks", () => {
    const source = read("src/lib/public-risk.functions.ts");
    expect(source).toContain("const b2 = await readB2PublicRisk();");
    expect(source).toContain("readPublicGlobalRisk()");
    expect(source).toContain("readPublicGlobalRiskFromEdge()");
    expect(source).toContain("hosted canonical read unavailable; trying authoritative edge");
  });

  it("publishes only after B2 write/readback verification and never deletes database history", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    const workflow = read(".github/workflows/b2-live-snapshot-maintenance.yml");
    expect(publisher).toContain("await b2.put(item.key, packed)");
    expect(publisher).toContain("const readback = await b2.get(item.key)");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).not.toContain(".delete(");
    expect(publisher).not.toContain("delete from");
    expect(workflow).toContain('cron: "37 */2 * * *"');
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
