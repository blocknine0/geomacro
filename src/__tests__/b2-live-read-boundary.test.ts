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

  it("serves the public website through verified B2 boundaries", () => {
    expect(read("src/lib/public-intelligence-b2.functions.ts")).toContain("readB2PublicIntelligence");
    expect(read("src/lib/public-risk.functions.ts")).toContain("readB2PublicRisk");
    expect(read("src/lib/public-risk-indices.functions.ts")).toContain("readB2PublicRisk");
    expect(read("src/lib/use-risk-indices.ts")).not.toContain("supabase.co");
  });

  it("keeps publisher verification but quota-holds automatic publishing while B2 GET is AccessDenied", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    const workflow = read(".github/workflows/b2-live-snapshot-maintenance.yml");
    expect(publisher).toContain("await b2.put(item.key, packed)");
    expect(publisher).toContain("const readback = await b2.get(item.key)");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).not.toContain(".delete(");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
