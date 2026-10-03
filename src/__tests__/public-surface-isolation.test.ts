import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public product surface failure-domain isolation", () => {
  it("keeps Global Risk publishing independent from Intelligence publishing", () => {
    const workflow = read(".github/workflows/gri-realtime-direct-postgres.yml");

    expect(workflow).toContain("group: geomacro-global-risk-realtime");
    expect(workflow).toContain("publish-b2-global-risk-direct-postgres.mjs");
    expect(workflow).not.toContain("publish-b2-public-intelligence-direct-postgres.mjs");
    expect(workflow).not.toContain("server/api/public/intelligence.get.ts");
    expect(workflow).not.toContain("src/lib/use-intelligence.ts");
  });

  it("keeps Intelligence publishing independent from Global Risk computation and publishing", () => {
    const workflow = read(".github/workflows/intelligence-scored-refresh.yml");

    expect(workflow).toContain("group: geomacro-intelligence-scored-realtime");
    expect(workflow).toContain('cron: "8,28,48 * * * *"');
    expect(workflow).toContain("publish-b2-public-intelligence-direct-postgres.mjs");
    expect(workflow).not.toContain("publish-b2-global-risk-direct-postgres.mjs");
    expect(workflow).not.toContain("compute-gri-v12.js");
    expect(workflow).not.toContain("verify-gri-snapshot-v12.js");
    expect(workflow).not.toContain("server/api/public/global-risk.get.ts");
    expect(workflow).not.toContain("src/lib/use-global-risk.ts");
  });

  it("keeps each browser surface on its own public API contract", () => {
    const intelligence = read("src/lib/use-intelligence.ts");
    const globalRisk = read("src/lib/use-global-risk.ts");
    const riskIndices = read("src/lib/use-risk-indices.ts");
    const ask = read("src/components/ask/ask-workspace.tsx");

    expect(intelligence).toContain('/api/public/intelligence');
    expect(intelligence).not.toContain('/api/public/global-risk');
    expect(intelligence).not.toContain('/api/public/risk-indices');
    expect(intelligence).not.toContain('/api/public-ask');

    expect(globalRisk).toContain('/api/public/global-risk');
    expect(globalRisk).not.toContain('/api/public/intelligence');
    expect(globalRisk).not.toContain('/api/public/risk-indices');
    expect(globalRisk).not.toContain('/api/public-ask');

    expect(riskIndices).toContain('/api/public/risk-indices');
    expect(riskIndices).not.toContain('/api/public/intelligence');
    expect(riskIndices).not.toContain('/api/public/global-risk');
    expect(riskIndices).not.toContain('/api/public-ask');

    expect(ask).toContain('/api/public-ask');
    expect(ask).not.toContain('/api/public/intelligence');
    expect(ask).not.toContain('/api/public/global-risk');
    expect(ask).not.toContain('/api/public/risk-indices');
  });

  it("keeps Global Risk browser reads edge-primary with Lovable only as fallback", () => {
    const globalRisk = read("src/lib/use-global-risk.ts");
    const edgeIndex = globalRisk.indexOf('{ kind: "edge", url: GLOBAL_RISK_EDGE_URL }');
    const appIndex = globalRisk.indexOf('{ kind: "app", url: GLOBAL_RISK_APP_URL }');

    expect(edgeIndex).toBeGreaterThanOrEqual(0);
    expect(appIndex).toBeGreaterThan(edgeIndex);
    expect(globalRisk).toContain('credentials: target.kind === "app" ? "same-origin" : "omit"');
  });
});
