import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/testnet-access.tsx", "utf8");
const consoleJs = readFileSync("public/testnet-console.js", "utf8");
const publicContract = readFileSync("src/lib/testnet-public-access-contract.ts", "utf8");
const browserApi = readFileSync("server/api/testnet-tester/intelligence.post.ts", "utf8");

describe("Testnet access market-standard UX", () => {
  it("keeps public browser testing separate from optional developer credentials", () => {
    expect(page).toContain("Public Testnet access");
    expect(page).toContain("Normal users");
    expect(page).toContain("public identifiers, not secrets");
    expect(page).toContain("Open Public Testnet Console");
    expect(page).toContain("Developer integrations (optional)");
    expect(page).toContain("Developers");
  });

  it("supports explicit wallet sign-out and permission disconnect", () => {
    expect(page).toContain("/api/testnet-tester/logout");
    expect(page).toContain("Disconnect wallet");
    expect(page).toContain("wallet_revokePermissions");
    expect(page).toContain('method: "eth_accounts"');
  });

  it("lists durable API keys while making API Secret one-time only", () => {
    expect(page).toContain("/api/testnet-tester/developer-keys");
    expect(page).toContain("/api/testnet-tester/developer-key-revoke");
    expect(page).toContain("Your developer API keys");
    expect(page).toContain("API Secret is shown only once");
    expect(page).toContain("It cannot be recovered later");
  });

  it("publishes exactly three non-secret public keys, one per supported Testnet", () => {
    expect(publicContract).toContain("gmk_public_arc_testnet_v1");
    expect(publicContract).toContain("gmk_public_base_sepolia_v1");
    expect(publicContract).toContain("gmk_public_polygon_amoy_v1");
    expect(publicContract).toContain("public_key_is_secret: false");
    expect(page).toContain("Three public API keys, one for each supported Testnet");
  });

  it("binds the public console to a public key and matching payment chain", () => {
    expect(consoleJs).toContain("x-geomacro-public-key");
    expect(consoleJs).toContain("public_api_key");
    expect(consoleJs).toContain("public_api_key: publicNetwork.value");
    expect(browserApi).toContain("TESTNET_PUBLIC_KEY_PAYMENT_CHAIN_MISMATCH");
    expect(browserApi).toContain("TESTNET_PUBLIC_RATE_LIMITED");
    expect(browserApi).toContain("TESTNET_PUBLIC_CONCURRENCY_LIMITED");
  });
});
