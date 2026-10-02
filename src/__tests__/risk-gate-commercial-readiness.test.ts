import { describe, expect, it } from "vitest";
import { evaluatePaidOutputSourceReadiness } from "../lib/paid-output-source-readiness";

const launchRows = [
  {
    source_id: "geopolitics",
    category: "GEOPOLITICS",
    certification_state: "CERTIFIED",
    commercial_usage_status: "COMMERCIAL_OK",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: true,
  },
  {
    source_id: "macro",
    category: "MACRO",
    certification_state: "CERTIFIED",
    commercial_usage_status: "COMMERCIAL_OK",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: true,
  },
  {
    source_id: "minerals",
    category: "CRITICAL_MINERALS",
    certification_state: "CERTIFIED",
    commercial_usage_status: "DERIVED_ONLY",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: true,
  },
] as const;

describe("Risk Gate paid-output source gate", () => {
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

  it("requires certified paid-output sources across all three launch domains", async () => {
    const mod = await import("../lib/risk-gate-commercial-readiness.server");
    expect(evaluatePaidOutputSourceReadiness(launchRows).ready).toBe(true);
    expect(mod.isCommercialPaidOutputReady(launchRows, true)).toBe(true);
    expect(mod.isCommercialPaidOutputReady(launchRows, false)).toBe(false);

    const missingMinerals = launchRows.filter((row) => row.category !== "CRITICAL_MINERALS");
    expect(evaluatePaidOutputSourceReadiness(missingMinerals).ready).toBe(false);

    const uncertified = launchRows.map((row) =>
      row.category === "GEOPOLITICS"
        ? { ...row, certification_state: "IN_REVIEW" }
        : row,
    );
    expect(evaluatePaidOutputSourceReadiness(uncertified).ready).toBe(false);
  });

  it("does not make the full ingestion universe a paid-delivery prerequisite", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      "src/lib/risk-gate-commercial-readiness.server.ts",
      "utf8",
    );
    expect(source).toContain('.eq("enabled_for_commercial_signals", true)');
    expect(source).toContain("evaluatePaidOutputSourceReadiness");
    expect(source).not.toContain("source_network_100_complete &&");
  });

  it("keeps B2 as outage-only fallback and never overrides a healthy false paid-output gate", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      "src/lib/risk-gate-commercial-readiness.server.ts",
      "utf8",
    );
    expect(source).toContain("await assertVerifiedB2Fallback();");
    expect(source).toContain("if (!paidReadiness.ready)");
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

describe("B2 paid-output continuity snapshot", () => {
  it("stays bounded and verified while automatic publishing is quota-held during AccessDenied", async () => {
    const fs = await import("node:fs/promises");
    const b2Source = await fs.readFile("src/lib/b2-live.server.ts", "utf8");
    const publisher = await fs.readFile("scripts/ops/publish-b2-live-snapshots.ts", "utf8");
    const workflow = await fs.readFile(".github/workflows/b2-live-snapshot-maintenance.yml", "utf8");

    expect(b2Source).toContain("SOURCE_NETWORK_FALLBACK_MAX_AGE_MS = 90 * 60 * 1000");
    expect(b2Source).toContain("geomacro.commercial-source-rights-live.v2");
    expect(b2Source).toContain("source_project !== \"ldpwajisioljyjtojvfx\"");
    expect(publisher).toContain("evaluatePaidOutputSourceReadiness");
    expect(publisher).toContain("B2_LIVE_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_LIVE_RESTORE_INVALID");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
  });
});
