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

  it("tries B2 before the unchanged bounded Supabase Intelligence fallback", () => {
    const source = read("src/lib/public-intelligence.functions.ts");
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).toContain("readPublicIntelligenceRowsFromSupabase");
    expect(source.indexOf("const b2Rows = await readB2PublicIntelligence()"))
      .toBeLessThan(source.indexOf("return readPublicIntelligenceRowsFromSupabase();"));
    expect(source).toContain("A partial verified feed is preferable");
    expect(source).toContain("to a page-level outage.");
  });

  it("tries verified B2 risk before preserving both established fallbacks", () => {
    const source = read("src/lib/public-risk.functions.ts");
    expect(source).toContain("const b2 = await readB2PublicRisk();");
    expect(source).toContain("readPublicGlobalRisk()");
    expect(source).toContain("readPublicGlobalRiskFromEdge()");
    expect(source).toContain("hosted canonical read unavailable; trying authoritative edge");
  });

  it("keeps the direct canonical GRI reader available from verified B2 when Supabase is unavailable", () => {
    const source = read("src/lib/global-risk-read.server.ts");
    expect(source).toContain('import { readB2PublicRisk } from "./b2-live.server"');
    expect(source).toContain('if (!supabase) return readVerifiedB2GlobalRiskOrThrow("Risk index store unavailable")');
    expect(source).toContain('return readVerifiedB2GlobalRiskOrThrow("Unable to load the canonical Global Risk Index")');
    expect(source).toContain("serving verified B2 snapshot");
  });

  it("publishes hourly only after B2 write/readback verification and never deletes database history", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    const workflow = read(".github/workflows/b2-live-snapshot-maintenance.yml");
    expect(publisher).toContain("await b2.put(item.key, packed)");
    expect(publisher).toContain("const readback = await b2.get(item.key)");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).not.toContain(".delete(");
    expect(publisher).not.toContain("delete from");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('cron: "13 * * * *"');
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
