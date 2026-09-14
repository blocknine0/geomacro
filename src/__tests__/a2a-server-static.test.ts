import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/lib/a2a-server.server.ts", "utf8");
const route = readFileSync("server/routes/a2a.post.ts", "utf8");
const preflight = readFileSync("src/lib/a2a-risk-preflight.server.ts", "utf8");

describe("A2A server boundary", () => {
  it("implements the non-streaming A2A v1 task surface", () => {
    for (const method of [
      "SendMessage",
      "GetTask",
      "ListTasks",
      "CancelTask",
      "CreateTaskPushNotificationConfig",
      "GetTaskPushNotificationConfig",
      "ListTaskPushNotificationConfigs",
      "DeleteTaskPushNotificationConfig",
    ]) {
      expect(server).toContain(`\"${method}\"`);
    }
    expect(server).toContain('"SendStreamingMessage"');
    expect(server).toContain('"SubscribeToTask"');
    expect(server).toContain("UnsupportedOperationError");
  });

  it("reuses commercial auth, entitlement and idempotent credit consumption", () => {
    expect(server).toContain("authenticateCommercialApiRequest");
    expect(server).toContain("resolveCommercialEntitlementForCapability");
    expect(server).toContain("ensureCommercialCreditAccount");
    expect(server).toContain("consumeCommercialCapability");
    expect(server).toContain('capability: "risk_gate_bundle"');
    expect(server).toContain('entitlement.tier === "testnet_tester"');
    expect(server).toContain("A2A_MESSAGE_ID_CONFLICT");
  });

  it("keeps x402 technical proof separate and fail-closed", () => {
    expect(server).toContain("circleX402PaymentRequiredResponse");
    expect(server).toContain("settleCircleX402");
    expect(server).toContain("persistSettlementTelemetry");
    expect(server).toContain("technical_proof_only: true");
    expect(server).toContain("commercial_revenue: false");
    expect(preflight).toContain("assertNoExecutionAuthorization");
    expect(preflight).toContain('execution_authorized: false');
  });

  it("enforces request size, protocol version and JSON-only transport", () => {
    expect(route).toContain("MAX_BODY_BYTES = 32 * 1024");
    expect(route).toContain("application/json");
    expect(server).toContain('version !== "1.0"');
    expect(server).toContain("VersionNotSupportedError");
  });
});
