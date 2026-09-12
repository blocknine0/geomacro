import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const retiredFiles = [
  "src/lib/testnet-oauth.server.ts",
  "src/lib/testnet-email-delivery.server.ts",
  "src/lib/testnet-email-recovery.server.ts",
  "src/lib/testnet-tester-registration.server.ts",
  "server/api/testnet-tester/email-resend.post.ts",
  "server/api/testnet-tester/email-verify.post.ts",
  "server/api/testnet-tester/oauth/x/start.get.ts",
  "server/api/testnet-tester/oauth/x/callback.get.ts",
  "server/api/testnet-tester/oauth/discord/start.get.ts",
  "server/api/testnet-tester/oauth/discord/callback.get.ts",
] as const;

describe("Testnet retired social identity surface", () => {
  it("does not ship email or social-account identity routes", () => {
    for (const path of retiredFiles) expect(existsSync(path), path).toBe(false);
  });

  it("does not require social provider runtime secrets", () => {
    const env = read(".env.example");
    for (const marker of [
      "RESEND_API_KEY=",
      "TESTNET_EMAIL_FROM=",
      "TESTNET_OAUTH_COOKIE_SECRET=",
      "X_OAUTH_CLIENT_ID=",
      "X_OAUTH_CLIENT_SECRET=",
      "DISCORD_OAUTH_CLIENT_ID=",
      "DISCORD_OAUTH_CLIENT_SECRET=",
    ]) {
      expect(env).not.toContain(marker);
    }
  });

  it("retains X only as a public result share intent", () => {
    const consoleBrowser = read("public/testnet-console.js");
    expect(consoleBrowser).toContain("twitter.com/intent/tweet");
    expect(consoleBrowser).toContain("Share result on X");
    expect(consoleBrowser).toContain("/api/testnet-tester/share");
    expect(consoleBrowser).not.toContain("X_OAUTH_CLIENT_ID");
    expect(consoleBrowser).not.toContain("oauth/x");
  });
});
