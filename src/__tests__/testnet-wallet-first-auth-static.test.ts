import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const auth = read("src/lib/testnet-wallet-first-auth.server.ts");
const challenge = read("server/api/testnet-tester/auth-challenge.post.ts");
const verify = read("server/api/testnet-tester/auth-verify.post.ts");
const browser = read("public/testnet-wallet-first.js");
const wrapper = read("server/routes/testnet-access-wallet-first.get.ts");
const mountedRoute = read("src/routes/testnet-access.tsx");
const wildcard = read("src/routes/api/testnet-tester/$.tsx");
const siweMigration = read("supabase/migrations/034_siwe_single_use_nonce.sql");

describe("wallet-first Testnet developer onboarding", () => {
  it("uses one-time SIWE replay protection with full EIP-4361 identity fields", () => {
    expect(auth).toContain('from("siwe_login_nonces")');
    expect(auth).toContain('db.rpc("consume_siwe_login_nonce"');
    expect(auth).toContain("verifyMessage(expectedMessage");
    expect(auth).toContain("Sign in to Geomacro Testnet Developer Access");
    expect(auth).toContain("This signature does not authorize funds or transactions.");
    expect(auth).toContain('URI: ${TESTNET_SIWE_URI}');
    expect(auth).toContain('"Version: 1"');
    expect(auth).toContain('Chain ID: ${chainId}');
    expect(auth).toContain('Nonce: ${nonce}');
    expect(auth).toContain('Issued At: ${issuedAtIso}');
    expect(auth).toContain('Expiration Time: ${expiresAtIso}');
    expect(challenge).toContain("body?.chain_id");
    expect(verify).toContain("chainId: body?.chain_id");
    expect(browser).toContain('method: "eth_chainId"');
    expect(browser).toContain("chain_id: chainId");
    expect(siweMigration).toContain("consumed_at is null");
    expect(siweMigration).toContain("expires_at > now()");
  });

  it("resumes an existing wallet account and creates only when the wallet is new", () => {
    expect(auth).toContain("loadProfileByWalletHash(walletHash)");
    expect(auth).toContain("if (!profile)");
    expect(auth).toContain("createWalletFirstProfile(walletAddress, input.profileName)");
    expect(auth).toContain("wallet_address_hash: walletHash");
    expect(auth).toContain('registration_status: "complete"');
    expect(auth).toContain("await provisionTestnetMeteredAccess(String(profile.principal_id))");
    expect(auth).not.toContain("TESTNET_WALLET_ALREADY_REGISTERED");
  });

  it("rotates a secure tester session without exposing the raw session token", () => {
    expect(auth).toContain('session_token_hash: sha256(sessionToken)');
    expect(verify).toContain("setTesterSessionCookie(event, result.session_token)");
    expect(verify).toContain("session_token: _privateSessionToken");
    expect(verify).toContain("retireSupersededTesterSession");
    expect(verify).not.toContain("session_token: result.session_token");
  });

  it("mounts public Testnet access on wallet-first endpoints and browser orchestration", () => {
    expect(wildcard).toContain('"auth-challenge": authChallengePost');
    expect(wildcard).toContain('"auth-verify": authVerifyPost');
    expect(mountedRoute).toContain("testnet-access-wallet-first.get");
    expect(wrapper).toContain("/testnet-wallet-first.js");
    expect(wrapper).toContain("Wallet sign-in");
    expect(wrapper).toContain("Connect wallet & sign in");
    expect(browser).toContain('json("/api/testnet-tester/auth-challenge"');
    expect(browser).toContain('json("/api/testnet-tester/auth-verify"');
    expect(browser).toContain("Existing developer account resumed");
    expect(browser).toContain("stopImmediatePropagation");
  });

  it("keeps challenge and verification responses fail-closed and non-executing", () => {
    expect(challenge).toContain("execution_authorized: false");
    expect(verify).toContain("execution_authorized: false");
    expect(challenge).toContain("Cache-Control");
    expect(verify).toContain("Cache-Control");
  });
});
