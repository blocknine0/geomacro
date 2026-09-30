import { describe, expect, it } from "vitest";

describe("Risk Gate commercial source-network gate", () => {
  it("uses an explicit environment switch so testnet/private-pilot is not silently converted into commercial mode", async () => {
    const mod = await import("../lib/risk-gate-commercial-readiness.server");
    expect(mod.RISK_GATE_COMMERCIAL_MODE_ENV).toBe(
      "GEOMACRO_RISK_GATE_COMMERCIAL_MODE",
    );
  });

  it("defines a fail-closed commercial readiness error", async () => {
    const mod = await import("../lib/risk-gate-commercial-readiness.server");
    const error = new mod.RiskGateCommercialReadinessError();
    expect(error.status).toBe(503);
    expect(error.code).toBe("RISK_GATE_SOURCE_NETWORK_NOT_READY");
  });

  it("requires every commercial source-network prerequisite", async () => {
    const mod = await import("../lib/risk-gate-commercial-readiness.server");
    expect(mod.isCommercialSourceNetworkReady({
      source_network_100_complete: true,
      gdelt_gal_freshness_complete: true,
      source_network_launch_complete: true,
    })).toBe(true);
    expect(mod.isCommercialSourceNetworkReady({
      source_network_100_complete: true,
      gdelt_gal_freshness_complete: true,
      source_network_launch_complete: false,
    })).toBe(false);
  });

  it("keeps B2 as outage-only fallback and never overrides a healthy false Supabase gate", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      "src/lib/risk-gate-commercial-readiness.server.ts",
      "utf8",
    );
    expect(source).toContain("if (error)");
    expect(source).toContain("await assertVerifiedB2Fallback();");
    expect(source).toContain("if (!isCommercialSourceNetworkReady(data))");
    expect(source).toContain("throw new RiskGateCommercialReadinessError();");
  });
});


describe("Risk Gate API commercial wiring", () => {
  it("wires the commercial source gate into the external evaluation handler", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      "src/lib/risk-gate-api.server.ts",
      "utf8",
    );
    expect(source).toContain("assertRiskGateCommercialReadiness");
    expect(source).toContain("RiskGateCommercialReadinessError");
  });
});


describe("B2 source-network continuity snapshot", () => {
  it("is bounded, verified, and manual-only while B2 read access is denied", async () => {
    const fs = await import("node:fs/promises");
    const b2Source = await fs.readFile("src/lib/b2-live.server.ts", "utf8");
    const publisher = await fs.readFile("scripts/ops/publish-b2-live-snapshots.ts", "utf8");
    const workflow = await fs.readFile(".github/workflows/b2-live-snapshot-maintenance.yml", "utf8");

    expect(b2Source).toContain("SOURCE_NETWORK_FALLBACK_MAX_AGE_MS = 90 * 60 * 1000");
    expect(b2Source).toContain("geomacro.source-network-live.v1");
    expect(b2Source).toContain("source_project !== \"ldpwajisioljyjtojvfx\"");
    expect(publisher).toContain("live_source_network_launch_status");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_LIVE_RESTORE_INVALID");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
  });
});
