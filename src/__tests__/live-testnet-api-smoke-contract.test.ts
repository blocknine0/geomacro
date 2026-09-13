import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("live Testnet API smoke contract", () => {
  it("checks the hosted client wallet-first page and unauthenticated fail-closed boundaries without moving funds", () => {
    const workflow = read(".github/workflows/live-testnet-api-smoke.yml");
    const script = read("scripts/test-live-testnet-api-smoke.mjs");
    const accessPage = read("src/routes/testnet-access.tsx");

    expect(workflow).toContain("https://geomacro.live");
    expect(workflow).toContain("/testnet-access");
    expect(workflow).toContain("/api/testnet-tester/config");
    expect(workflow).toContain("/api/testnet/intelligence");
    expect(workflow).toContain("COMMERCIAL_API_KEY_REQUIRED");
    expect(workflow).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(workflow).not.toContain("private key");

    for (const marker of [
      "client-wallet-first-v3",
      "CLIENT WALLET-FIRST V3",
      "Wallet-first developer access for Geomacro Testnet.",
      "Sign in with wallet",
    ]) {
      expect(accessPage).toContain(marker);
      expect(script).toContain(marker);
    }
    expect(script).toContain("retired wallet verification UI");
    expect(script).not.toContain("Verify once. Pay only for the API call you use.");

    expect(script).toContain("wallet signature");
    expect(script).toContain("Testnet USDC settlement");
    expect(script).toContain("402 retry");
    expect(script).toContain("signed GRO verification");
  });
});
