import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retiredRoute = readFileSync("src/routes/testnet-access.tsx", "utf8");
const consoleJs = readFileSync("public/testnet-console.js", "utf8");
const publicContract = readFileSync("src/lib/testnet-public-access-contract.ts", "utf8");
const browserApi = readFileSync("server/api/testnet-tester/intelligence.post.ts", "utf8");
const wildcard = readFileSync("src/routes/api/testnet-tester/$.tsx", "utf8");
const developerKeys = readFileSync("server/api/testnet-tester/developer-keys.get.ts", "utf8");
const developerRevoke = readFileSync("server/api/testnet-tester/developer-key-revoke.post.ts", "utf8");
const logout = readFileSync("server/api/testnet-tester/logout.post.ts", "utf8");

describe("Testnet access market-standard controls", () => {
  it("retires public Testnet onboarding from the commercial website while retaining internal verification APIs", () => {
    expect(retiredRoute).toContain('redirect({ to: "/data-api", replace: true })');
    expect(wildcard).toContain('"developer-keys": developerKeysGet');
    expect(wildcard).toContain('"developer-key-revoke": developerKeyRevokePost');
    expect(wildcard).toContain('logout: logoutPost');
    expect(wildcard).toContain('intelligence: intelligencePost');
  });

  it("retains explicit session sign-out and fail-closed logout semantics internally", () => {
    expect(logout).toContain("execution_authorized: false");
    expect(logout).toContain("clearTesterSessionCookie");
    expect(wildcard).toContain("logoutPost");
  });

  it("retains durable developer-key listing and revocation without exposing secrets on the production page", () => {
    expect(developerKeys).toContain("execution_authorized: false");
    expect(developerRevoke).toContain("execution_authorized: false");
    expect(wildcard).toContain("developerKeysGet");
    expect(wildcard).toContain("developerKeyRevokePost");
    expect(retiredRoute).not.toContain("API Secret is shown only once");
  });

  it("retains exactly three non-secret public keys, one per supported Testnet", () => {
    expect(publicContract).toContain("gmk_public_arc_testnet_v1");
    expect(publicContract).toContain("gmk_public_base_sepolia_v1");
    expect(publicContract).toContain("gmk_public_polygon_amoy_v1");
    expect(publicContract).toContain("public_key_is_secret: false");
  });

  it("binds the retained internal console to a public key and matching payment chain", () => {
    expect(consoleJs).toContain("x-geomacro-public-key");
    expect(consoleJs).toContain("public_api_key");
    expect(consoleJs).toContain("selectedPublicChain");
    expect(consoleJs).toContain(
      'headers: { "x-geomacro-public-key": publicChain.public_api_key }',
    );
    expect(browserApi).toContain("TESTNET_PUBLIC_KEY_PAYMENT_CHAIN_MISMATCH");
    expect(browserApi).toContain("TESTNET_PUBLIC_RATE_LIMITED");
    expect(browserApi).toContain("TESTNET_PUBLIC_CONCURRENCY_LIMITED");
  });
});
