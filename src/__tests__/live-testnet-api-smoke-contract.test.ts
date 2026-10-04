import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("production Testnet retirement and source-level smoke contract", () => {
  it("keeps the launch-critical workflow on the retired public boundary while preserving the technical harness", () => {
    const workflow = read(".github/workflows/live-testnet-health.yml");
    const script = read("scripts/test-live-testnet-api-smoke.mjs");
    const accessPage = read("src/routes/testnet-access.tsx");
    const publicAccess = read("src/lib/testnet-public-access-contract.ts");

    expect(workflow).toContain("name: Production Testnet Retirement Health");
    expect(workflow).toContain("https://geomacro.live");
    expect(workflow).toContain("/testnet-access");
    expect(workflow).toContain("/testnet-console");
    expect(workflow).toContain("/data-api");
    expect(workflow).toContain('[[ "$code" != "308" ]]');
    expect(workflow).toContain('"production_data_authority":"backblaze-b2"');
    expect(workflow).toContain('"commerce_control_plane":"cloudflare-durable-objects"');
    expect(workflow).not.toContain("/api/testnet-tester/config");
    expect(workflow).not.toContain("/api/testnet/intelligence");
    expect(workflow).not.toContain("GEOMACRO_TESTNET_E2E_PRIVATE_KEY");

    for (const marker of [
      "client-wallet-first-v4-public-developer",
      "PUBLIC TESTER + DEVELOPER API",
      "Geomacro Testnet Access",
      "Sign in with wallet",
      "Public Testnet access",
      "Developer integrations (optional)",
      "Disconnect wallet",
      "API Secret is shown only once",
    ]) {
      expect(accessPage).toContain(marker);
      expect(script).toContain(marker);
    }

    for (const publicKey of [
      "gmk_public_arc_testnet_v1",
      "gmk_public_base_sepolia_v1",
      "gmk_public_polygon_amoy_v1",
    ]) {
      expect(publicAccess).toContain(publicKey);
      expect(script).toContain(publicKey);
    }

    expect(accessPage).toContain("TESTNET_PUBLIC_API_KEYS");
    expect(script).toContain("retired wallet verification UI");
    expect(script).toContain("public key without wallet session leaked protected intelligence fields");
    expect(script).not.toContain("Verify once. Pay only for the API call you use.");
    expect(script).toContain("wallet signature");
    expect(script).toContain("Testnet USDC settlement");
    expect(script).toContain("402 retry");
    expect(script).toContain("signed GRO verification");
  });
});
