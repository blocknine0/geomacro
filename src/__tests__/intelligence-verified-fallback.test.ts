import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Intelligence verified fallback contract", () => {
  it("keeps bounded verified B2 public snapshots readable during upstream outages", () => {
    const source = read("src/lib/b2-live.server.ts");

    expect(source).toContain("PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("PUBLIC_RISK_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_RISK_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("keeps customer-facing intelligence B2-only while publisher access stays explicit", () => {
    const serving = read("src/lib/public-intelligence-b2.functions.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");

    expect(serving).toContain("readB2PublicIntelligence");
    expect(serving).not.toContain("getAppSupabase");
    expect(hook).toContain("getPublicIntelligenceFromB2");
    expect(publisher).toContain("readPublicIntelligenceRowsFromSupabase");
  });
});
