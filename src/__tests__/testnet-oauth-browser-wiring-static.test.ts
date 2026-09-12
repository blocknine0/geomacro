import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Testnet tester OAuth and browser wiring", () => {
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

  it("integrity-protects short-lived OAuth browser state and PKCE material", () => {
    const oauth = read("src/lib/testnet-oauth.server.ts");
    expect(oauth).toContain("TESTNET_OAUTH_COOKIE_SECRET");
    expect(oauth).toContain('createHmac("sha256", secret)');
    expect(oauth).toContain("timingSafeEqual");
    expect(oauth).toContain("httpOnly: true");
    expect(oauth).toContain("secure: true");
    expect(oauth).toContain('sameSite: "lax"');
    expect(oauth).toContain("TESTNET_OAUTH_COOKIE_SECRET_TOO_SHORT");
  });

  it("uses X OAuth Authorization Code + PKCE and minimal users.read scope", () => {
    const oauth = read("src/lib/testnet-oauth.server.ts");
    expect(oauth).toContain("https://x.com/i/oauth2/authorize");
    expect(oauth).toContain("https://api.x.com/2/oauth2/token");
    expect(oauth).toContain("https://api.x.com/2/users/me");
    expect(oauth).toContain('url.searchParams.set("scope", "users.read")');
    expect(oauth).toContain('url.searchParams.set("code_challenge_method", "S256")');
    expect(oauth).toContain("code_verifier: input.verifier");
  });

  it("uses Discord OAuth identify only and never persists provider tokens", () => {
    const oauth = read("src/lib/testnet-oauth.server.ts");
    const migration = read("supabase/migrations/906_testnet_tester_sessions.sql");
    expect(oauth).toContain("https://discord.com/oauth2/authorize");
    expect(oauth).toContain("https://discord.com/api/v10/oauth2/token");
    expect(oauth).toContain("https://discord.com/api/v10/users/@me");
    expect(oauth).toContain('url.searchParams.set("scope", "identify")');
    expect(migration).not.toMatch(/access_token|refresh_token/i);
  });

  it("requires server session auth for legacy OAuth, retired activation and developer credential actions", () => {
    for (const path of [
      "server/api/testnet-tester/oauth/x/start.get.ts",
      "server/api/testnet-tester/oauth/x/callback.get.ts",
      "server/api/testnet-tester/oauth/discord/start.get.ts",
      "server/api/testnet-tester/oauth/discord/callback.get.ts",
      "server/api/testnet-tester/config.get.ts",
      "server/api/testnet-tester/payment-claim.post.ts",
      "server/api/testnet-tester/developer-key.post.ts",
      "server/api/testnet-tester/developer-keys.get.ts",
      "server/api/testnet-tester/developer-key-revoke.post.ts",
    ]) {
      expect(read(path), path).toContain("requireTesterPrincipal(event)");
    }
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
