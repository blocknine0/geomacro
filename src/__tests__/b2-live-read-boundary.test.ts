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
    const b2 = read("src/lib/b2-live.server.ts");
    expect(read("src/lib/public-intelligence-b2.functions.ts")).toContain("readB2PublicIntelligence");
    expect(read("src/lib/public-risk.functions.ts")).toContain("readB2PublicRisk");
    expect(read("src/lib/public-risk-indices.functions.ts")).toContain("readB2PublicRisk");
    expect(read("src/lib/use-risk-indices.ts")).not.toContain("supabase.co");
    expect(read("src/lib/use-global-risk.ts")).not.toContain("supabase.co");
    expect(b2).toContain("B2_PUBLIC_GLOBAL_RISK_KEY");
    expect(b2).toContain("geomacro.public-global-risk-live.v1");
    expect(b2).toContain("validateGlobalRiskContinuity");
    expect(b2).toContain('import { readGlobalRiskEdge } from "./global-risk-edge.server"');
    const edgeRead = b2.indexOf("await readGlobalRiskEdge()");
    const directB2Read = b2.indexOf("B2_PUBLIC_GLOBAL_RISK_KEY");
    expect(edgeRead).toBeGreaterThan(-1);
    expect(directB2Read).toBeGreaterThan(-1);
    expect(edgeRead).toBeGreaterThan(directB2Read);
  });

  it("uses the proof-verified edge before runtime private-B2 recovery", () => {
    const b2 = read("src/lib/b2-live.server.ts");
    const fn = b2.slice(b2.indexOf("export async function readB2PublicRisk"));
    expect(fn.indexOf("await readGlobalRiskEdge()")).toBeGreaterThan(-1);
    expect(fn.indexOf("await readJsonGzip")).toBeGreaterThan(fn.indexOf("await readGlobalRiskEdge()"));
    expect(read("src/lib/global-risk-edge.server.ts")).toContain('x-geomacro-authority") !== "backblaze-b2-verified-edge"');
    expect(read("src/lib/global-risk-edge.server.ts")).toContain('payload.source_project !== "ldpwajisioljyjtojvfx"');
    expect(read("src/lib/global-risk-edge.server.ts")).toContain("validateGlobalRiskContinuity(payload.data).ok");
  });

  it("keeps the old bundled publisher verified while Global Risk has an independent permanent refresh path", () => {
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    const oldWorkflow = read(".github/workflows/b2-live-snapshot-maintenance.yml");
    const globalPublisher = read("scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
    const globalWorkflow = read(".github/workflows/b2-global-risk-maintenance.yml");

    expect(publisher).toContain("await b2.put(item.key, packed)");
    expect(publisher).toContain("const readback = await b2.get(item.key)");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).not.toContain(".delete(");
    expect(oldWorkflow).toContain("workflow_dispatch:");
    expect(oldWorkflow).not.toContain("schedule:");
    expect(oldWorkflow).toContain("cancel-in-progress: true");

    expect(globalPublisher).toContain("begin read only");
    expect(globalPublisher).toContain("assemblePublicGlobalRisk");
    expect(globalPublisher).toContain("validateGlobalRiskContinuity");
    expect(globalPublisher).toContain("B2_GLOBAL_RISK_HISTORY_IMMUTABILITY_VIOLATION");
    expect(globalPublisher).not.toContain(".delete(");
    expect(globalWorkflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(globalWorkflow).not.toContain('cron: "17 */2 * * *"');
    expect(globalWorkflow).not.toContain("\n  schedule:\n");
    expect(globalWorkflow).not.toContain("\n  push:\n");
    expect(globalWorkflow).toContain("workflow_dispatch: {}");
    expect(globalWorkflow).toContain("github.event_name == 'workflow_dispatch'");
  });
});
