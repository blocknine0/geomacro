import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("testnet tester account runtime boundaries", () => {
  it("stores only hashed private session and verification material", () => {
    const migration = read("../../supabase/migrations/906_testnet_tester_sessions.sql");
    expect(migration).toContain("session_token_hash");
    expect(migration).toContain("token_hash");
    expect(migration).toContain("state_hash");
    expect(migration).not.toContain("oauth_access_token");
    expect(migration).not.toContain("oauth_refresh_token");
    expect(migration).not.toContain("private_key");
    expect(migration).not.toContain("seed_phrase");
    expect(migration).toContain("revoke all on table public.testnet_tester_sessions from PUBLIC, anon, authenticated");
  });

  it("does not return the email verification token from public registration", () => {
    const route = read("../../server/api/testnet-tester/register.post.ts");
    expect(route).toContain("sendTestnetVerificationEmail");
    const returned = route.slice(route.indexOf("return {"));
    expect(returned).not.toContain("email_verification_token: result.email_verification_token");
    expect(route).toContain("email_verification_sent: true");
  });

  it("requires bearer tester sessions for sensitive account actions", () => {
    const helper = read("../lib/testnet-tester-http.server.ts");
    expect(helper).toContain("authorization");
    expect(helper).toContain("Bearer");
    for (const path of [
      "../../server/api/testnet-tester/me.get.ts",
      "../../server/api/testnet-tester/wallet-challenge.post.ts",
      "../../server/api/testnet-tester/wallet-verify.post.ts",
      "../../server/api/testnet-tester/email-verify.post.ts",
      "../../server/api/testnet-tester/developer-key.post.ts",
      "../../server/api/testnet-tester/payment-claim.post.ts",
    ]) {
      expect(read(path)).toContain("requireTesterPrincipal");
    }
  });

  it("wallet challenge text explicitly cannot authorize funds", () => {
    const runtime = read("../lib/testnet-tester-account.server.ts");
    expect(runtime).toContain("This signature does not authorize funds or transactions.");
    expect(runtime).toContain("verifyMessage");
    expect(runtime).toContain("WALLET_CHALLENGE_MESSAGE_MISMATCH");
  });

  it("keeps developer keys tied to active testnet entitlements", () => {
    const route = read("../../server/api/testnet-tester/developer-key.post.ts");
    const service = read("../lib/testnet-developer-access.server.ts");
    expect(route).toContain("shown again");
    expect(service).toContain('grant.tier !== "testnet_tester"');
    expect(service).toContain("TESTNET_DEVELOPER_KEY_LIMIT_REACHED");
    expect(service).toContain("api_key_hash");
  });
});
