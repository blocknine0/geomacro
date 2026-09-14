import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("server/routes/testnet-access.get.ts", "utf8");
const browser = readFileSync("public/testnet-access.js", "utf8");
const walletFirst = readFileSync("public/testnet-wallet-first-v2.js", "utf8");

describe("public Testnet developer access page", () => {
  it("shows the Testnet API surface before credentials are created", () => {
    expect(page).toContain("PUBLIC TESTNET DEVELOPER API");
    expect(page).toContain("/api/testnet/manifest");
    expect(page).toContain("/api/testnet/account");
    expect(page).toContain("/api/testnet/intelligence");
    expect(page).toContain("Authorization: GeomacroTest &lt;API_KEY&gt;.&lt;API_SECRET&gt;");
  });

  it("shows all eight current Testnet capabilities", () => {
    for (const capability of [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
      "structural_country_profile",
      "structural_corridor_profile",
      "signed_risk_object",
      "risk_gate_bundle",
    ]) {
      expect(page).toContain(capability);
    }
  });

  it("loads wallet-first authentication before the legacy page behavior", () => {
    const walletFirstScript = '<script src="/testnet-wallet-first-v2.js" defer></script>';
    const legacyScript = '<script src="/testnet-access.js" defer></script>';

    expect(page).toContain(walletFirstScript);
    expect(page).toContain(legacyScript);
    expect(page.indexOf(walletFirstScript)).toBeLessThan(page.indexOf(legacyScript));
    expect(walletFirst).toContain('AUTH_FLOW = "wallet-first-v2"');
    expect(walletFirst).toContain('"/api/testnet-tester/auth-challenge"');
    expect(walletFirst).toContain('"/api/testnet-tester/auth-verify"');
    expect(walletFirst).toContain("Existing developer account resumed");
  });

  it("keeps profile plus wallet registration and developer credential creation", () => {
    expect(page).toContain("Create developer access");
    expect(page).toContain("Connect & verify wallet");
    expect(page).toContain("CREATE DEVELOPER API");
    expect(page).toContain("Create Testnet API credentials");
    expect(browser).toContain("/api/testnet-tester/developer-key");
  });

  it("keeps Testnet pay-per-call boundaries explicit", () => {
    expect(page).toContain("0.5 Testnet USDC per credit");
    expect(page).toContain("500-credit usage cap");
    expect(page).toContain("There is no upfront Testnet USDC activation payment");
    expect(page).toContain("Testnet only · non-revenue");
  });
});
