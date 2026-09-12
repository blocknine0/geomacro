import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const exists = (path: string) => existsSync(join(ROOT, path));

describe("Testnet tester identity and X sharing boundary", () => {
  it("keeps the tester session in a secure HttpOnly __Host cookie", () => {
    const cookie = read("src/lib/testnet-tester-cookie.server.ts");
    const register = read("server/api/testnet-tester/register.post.ts");
    expect(cookie).toContain("__Host-geomacro_test_session");
    expect(cookie).toContain("httpOnly: true");
    expect(cookie).toContain("secure: true");
    expect(cookie).toContain('sameSite: "lax"');
    expect(cookie).toContain('path: "/"');
    expect(register).toContain("setTesterSessionCookie(event, result.session_token)");
    expect(register).not.toContain("session_token: result.session_token");
  });

  it("removes tester email verification and social OAuth runtime routes", () => {
    for (const path of [
      "src/lib/testnet-oauth.server.ts",
      "src/lib/testnet-email-delivery.server.ts",
      "src/lib/testnet-email-recovery.server.ts",
      "server/api/testnet-tester/email-resend.post.ts",
      "server/api/testnet-tester/email-verify.post.ts",
      "server/api/testnet-tester/oauth/x/start.get.ts",
      "server/api/testnet-tester/oauth/x/callback.get.ts",
      "server/api/testnet-tester/oauth/discord/start.get.ts",
      "server/api/testnet-tester/oauth/discord/callback.get.ts",
    ]) {
      expect(exists(path), path).toBe(false);
    }
  });

  it("keeps profile plus verified wallet as the only tester identity path", () => {
    const account = read("src/lib/testnet-tester-account.server.ts");
    const browser = read("public/testnet-access.js");
    const page = read("server/routes/testnet-access.get.ts");

    expect(account).toContain("issueTestnetWalletChallenge");
    expect(account).toContain("verifyTestnetWalletSignature");
    expect(account).toContain("provision_testnet_metered_access");
    expect(account).not.toContain("verifyTestnetTesterEmail");
    expect(account).not.toContain("issueTesterOauthState");
    expect(account).not.toContain("consumeTesterOauthIdentity");
    expect(browser).toContain("personal_sign");
    expect(browser).not.toContain("email-resend");
    expect(browser).not.toContain("email-verify");
    expect(browser).not.toContain("oauth/x");
    expect(browser).not.toContain("oauth/discord");
    expect(page).toContain("Profile + wallet");
  });

  it("uses X only as an outbound result-sharing action", () => {
    const consoleBrowser = read("public/testnet-console.js");
    const page = read("server/routes/testnet-access.get.ts");

    expect(consoleBrowser).toContain("/api/testnet-tester/share");
    expect(consoleBrowser).toContain("/api/testnet-tester/share-event");
    expect(consoleBrowser).toContain('platform: "x"');
    expect(consoleBrowser).toContain("twitter.com/intent/tweet");
    expect(consoleBrowser).not.toContain("oauth/x");
    expect(page).toContain("TEST → X → FEEDBACK");
    expect(page).toContain("open one X post");
  });

  it("keeps upstream source identities and wallet secrets out of the browser tester bundle", () => {
    const browser = read("public/testnet-access.js");
    expect(browser).not.toMatch(/source_url|source_name|publisher|private[_ -]?key|seed phrase/i);
    expect(browser).toContain("personal_sign");
    expect(browser).not.toContain("/api/testnet-tester/payment-claim");
    expect(browser).toContain("/api/testnet-tester/developer-key");
    expect(browser).toContain("402 quote");
  });
});
