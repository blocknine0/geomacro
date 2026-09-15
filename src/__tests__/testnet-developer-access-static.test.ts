import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/lib/testnet-developer-access.server.ts", "utf8");
const access = readFileSync("src/lib/commercial-access.server.ts", "utf8");
const migration = readFileSync("supabase/migrations/904_testnet_usdc_tester_access.sql", "utf8");
const lifecycleMigration = readFileSync(
  "supabase/migrations/928_testnet_developer_credential_lifecycle.sql",
  "utf8",
);
const page = readFileSync("server/routes/testnet-access.get.ts", "utf8");
const browser = readFileSync("public/testnet-access.js", "utf8");
const issueRoute = readFileSync("server/api/testnet-tester/developer-key.post.ts", "utf8");
const rotateRoute = readFileSync("server/api/testnet-tester/developer-key-rotate.post.ts", "utf8");
const listRoute = readFileSync("server/api/testnet-tester/developer-keys.get.ts", "utf8");
const intelligenceRoute = readFileSync("server/api/testnet/intelligence.post.ts", "utf8");

describe("metered testnet developer integration", () => {
  it("issues credentials after wallet verification and provisions metered access without upfront payment", () => {
    expect(server).toContain('profile.registration_status !== "complete"');
    expect(server).toContain("!profile.wallet_verified_at");
    expect(server).toContain("provision_testnet_metered_access");
    expect(server).toContain('grant.tier !== "testnet_tester"');
    expect(server).toContain('grant.metadata?.offer_id !== "testnet_tester_metered_30d"');
    expect(server).toContain('grant.metadata?.payment_model !== "pay_per_call"');
    expect(server).toContain("TESTNET_WALLET_VERIFICATION_REQUIRED");
    expect(server).toContain("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
  });

  it("returns a high-entropy API Key + API Secret once and persists only the keyed secret digest", () => {
    expect(server).toContain('const apiKey = `gmk_test_${randomBytes(20).toString("base64url")}`');
    expect(server).toContain('const apiSecret = `gms_test_${randomBytes(32).toString("base64url")}`');
    expect(server).toContain('apiCredentialDigest(apiSecret, "testnet-api-secret")');
    expect(server).toContain("api_key: input.apiKey");
    expect(server).toContain("api_secret: input.apiSecret");
    expect(server).toContain("shown_once: true");
    expect(server).toContain('auth_scheme: "key_secret"');
    expect(server).toContain('payment_model: "pay_per_call"');
    expect(page).toContain("API Key + API Secret");
    expect(browser).toContain("payload.data.api_secret");
  });

  it("requires both parts of the Testnet credential for external API authentication", () => {
    expect(access).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(access).toContain("TESTNET_API_CREDENTIAL_DENIED");
    expect(access).toContain("GeomacroTest");
    expect(access).toContain('apiCredentialDigest(input.apiSecret, "testnet-api-secret")');
    expect(access).toContain('startsWith("gmk_test_")');
  });

  it("supports own-product, AI-agent, automation and demo integrations", () => {
    expect(migration).toContain("'product_api','ai_agent','automation','demo'");
    expect(server).toContain("testnetDeveloperScopesForIntegration");
  });

  it("serializes issue/revoke/rotate operations and preserves append-only lifecycle evidence", () => {
    expect(lifecycleMigration).toContain("commercial_api_credential_lifecycle_events");
    expect(lifecycleMigration).toContain("issue_testnet_developer_credential");
    expect(lifecycleMigration).toContain("revoke_testnet_developer_credential");
    expect(lifecycleMigration).toContain("rotate_testnet_developer_credential");
    expect(lifecycleMigration).toContain("for update");
    expect(lifecycleMigration).toContain("testnet_developer_one_live_mapping_per_principal");
    expect(lifecycleMigration).toContain("revoke all on table public.commercial_api_credential_lifecycle_events from PUBLIC, anon, authenticated");
    expect(server).toContain('db.rpc("issue_testnet_developer_credential"');
    expect(server).toContain('db.rpc("revoke_testnet_developer_credential"');
    expect(server).toContain('db.rpc("rotate_testnet_developer_credential"');
  });

  it("restores one wallet-bound developer key instead of minting duplicates", () => {
    expect(server).toContain("hasUsableDeveloperCredential");
    expect(server).toContain("TESTNET_DEVELOPER_KEY_ALREADY_EXISTS");
    expect(server).toContain('.eq("principal_id", principalId)');
    expect(server).toContain('.eq("enabled", true)');
    expect(server).toContain('.is("revoked_at", null)');
    expect(issueRoute).toContain("Reconnecting restores the same API Key");
    expect(listRoute).toContain("listTestnetDeveloperApiKeys");
  });

  it("supports owner-bound atomic rotation and returns the replacement secret only once", () => {
    expect(server).toContain("rotateTestnetDeveloperApiKey");
    expect(server).toContain("rotatedFromCredentialId");
    expect(rotateRoute).toContain("rotateOwnedTestnetDeveloperApiKey");
    expect(rotateRoute).toContain("previous credential is already revoked");
    expect(rotateRoute).toContain("requireTesterPrincipal");
  });

  it("enforces capability scopes before preflight or payment", () => {
    expect(intelligenceRoute).toContain("hasTestnetCapabilityScope");
    expect(intelligenceRoute).toContain("TESTNET_API_SCOPE_REQUIRED");
    expect(intelligenceRoute.indexOf("hasTestnetCapabilityScope")).toBeLessThan(
      intelligenceRoute.indexOf("preflightTestnetIntelligenceAvailability(request)"),
    );
  });
});
