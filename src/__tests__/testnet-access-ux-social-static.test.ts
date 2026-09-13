import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/testnet-access.tsx", "utf8");

describe("permanent Testnet access UX", () => {
  it("offers disconnect even for a wallet that is connected before the Geomacro session is active", () => {
    expect(page).toContain('method: "eth_accounts"');
    expect(page).toContain('method: "wallet_revokePermissions"');
    expect(page).toContain('"/api/testnet-tester/logout"');
    expect(page).toContain("walletConnected");
    expect(page).toContain("Disconnect wallet");
    expect(page).toContain("wallet extension's Disconnect site action");
  });

  it("keeps normal-user public access on the left and developer access on the right", () => {
    expect(page).toContain("lg:grid-cols-2");
    expect(page).toContain(">Normal users<");
    expect(page).toContain(">Developers<");
    expect(page).toContain("TESTNET_PUBLIC_API_KEYS");
    expect(page).toContain("Three public API keys");
    expect(page).toContain("Developer integrations (optional)");
  });

  it("keeps feedback optional and provides X distribution actions", () => {
    expect(page).toContain("OPTIONAL FEEDBACK + X");
    expect(page).toContain("Give feedback (optional)");
    expect(page).toContain('"/api/demo/feedback"');
    expect(page).toContain("https://x.com/intent/post");
    expect(page).toContain("@GeomacroLive");
    expect(page).toContain("https://x.com/intent/follow?screen_name=");
    expect(page).toContain("I followed @GeomacroLive");
    expect(page).toContain("X requires you to confirm the follow there.");
  });
});
