import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/testnet-access.tsx", "utf8");
const vite = readFileSync("vite.config.ts", "utf8");

describe("canonical Testnet Access surface", () => {
  it("uses one React route for both direct and in-site navigation", () => {
    expect(route).toContain('createFileRoute("/testnet-access")');
    expect(route).toContain('href: "https://geomacro.live/testnet-access"');
    expect(vite).toContain('"routes/testnet-access.get.ts"');
    expect(vite).toContain('"routes/testnet-access-wallet-first.get.ts"');
    expect(vite).toContain('"routes/testnet-access-canonical-wallet-first.get.ts"');
  });

  it("shows the machine integration and x402 lifecycle on the canonical page", () => {
    expect(route).toContain("/api/testnet/manifest");
    expect(route).toContain("/api/testnet/account");
    expect(route).toContain("/api/testnet/intelligence");
    expect(route).toContain("API call → 402 response → pay → retry → response");
    expect(route).toContain("risk_gate_bundle");
    expect(route).toContain("signed_risk_object");
    expect(route).toContain("Load live manifest");
    expect(route).toContain("MAX_ACTIVE_DEVELOPER_KEYS = 1");
    expect(route).not.toContain("maximum 3 active developer API keys");
    expect(route).toContain("Demo credentials do not include Risk Gate access");
    expect(route).toContain("async function writeClipboard");
    expect(route).toContain("wallet_revokePermissions");
    expect(route).toContain("/api/testnet-tester/developer-key-rotate");
    expect(route).toContain("Rotate");
  });
});
