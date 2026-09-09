import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GOAT Testnet3 paid-proof readiness", () => {
  const workflow = readFileSync(
    ".github/workflows/goat-testnet3-paid-readiness.yml",
    "utf8",
  );
  const script = readFileSync(
    "scripts/goat/testnet3-paid-readiness.mjs",
    "utf8",
  );

  it("is manual-only and cannot submit a payment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(script).not.toContain("JsonRpcProvider");
    expect(script).not.toContain("Contract");
    expect(script).not.toContain(".transfer(");
    expect(script).not.toContain("fetch(");
  });

  it("uses the same protected paid-proof environment without merchant HMAC secrets", () => {
    expect(workflow).toContain("environment: goat-testnet3-paid-proof");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_PILOT_BASE_URL");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_PILOT_EXPECTED_HOST");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY");
    expect(workflow).not.toContain("GOATX402_API_KEY");
    expect(workflow).not.toContain("GOATX402_API_SECRET");
  });

  it("refuses production and requires exact isolated staging host identity", () => {
    expect(script).toContain('["geomacro.live", "www.geomacro.live"]');
    expect(script).toContain("baseUrl.hostname !== expectedHost");
    expect(script).toContain('baseUrl.protocol !== "https:"');
  });

  it("checks the dedicated payer key offline and preserves proof boundaries", () => {
    expect(script).toContain("new Wallet(privateKey)");
    expect(script).toContain("payerAddressEnv !== derivedAddress");
    expect(script).toContain("network_request_executed: false");
    expect(script).toContain("payment_submitted: false");
    expect(script).toContain("commercial_revenue: false");
    expect(script).toContain("execution_authorized: false");
  });
});
