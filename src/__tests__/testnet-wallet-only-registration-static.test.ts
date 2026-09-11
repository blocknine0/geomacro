import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("src/lib/testnet-tester-account.server.ts", "utf8");
const register = readFileSync("server/api/testnet-tester/register.post.ts", "utf8");
const browser = readFileSync("public/testnet-access.js", "utf8");
const page = readFileSync("server/routes/testnet-access.get.ts", "utf8");

describe("wallet-only tester registration", () => {
  it("uses profile plus verified wallet only", () => {
    expect(register).toContain('next_step: "verify_wallet"');
    expect(register).not.toContain("sendTestnetVerificationEmail");
    expect(account).toContain("TESTNET_WALLET_ALREADY_REGISTERED");
    expect(account).toContain('registration_status: "complete"');
  });

  it("keeps email and social OAuth out of the browser flow", () => {
    expect(browser).not.toContain("email-resend");
    expect(browser).not.toContain("oauth/x");
    expect(browser).not.toContain("oauth/discord");
    expect(page).toContain("Wallet-only identity");
  });
});
