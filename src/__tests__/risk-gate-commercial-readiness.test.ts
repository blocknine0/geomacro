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
});
