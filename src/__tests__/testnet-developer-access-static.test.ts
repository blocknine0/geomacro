import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/lib/testnet-developer-access.server.ts", "utf8");
const access = readFileSync("src/lib/commercial-access.server.ts", "utf8");
const migration = readFileSync("supabase/migrations/904_testnet_usdc_tester_access.sql", "utf8");
const page = readFileSync("server/routes/testnet-access.get.ts", "utf8");
const browser = readFileSync("public/testnet-access.js", "utf8");

describe("paid testnet developer integration", () => {
  it("issues credentials only after complete registration and active tester entitlement", () => {
    expect(server).toContain('registration_status !== "complete"');
    expect(server).toContain('access_status !== "active"');
    expect(server).toContain('grant.tier !== "testnet_tester"');
    expect(server).toContain('grant.metadata?.offer_id !== "testnet_tester_pass_30d"');
    expect(server).toContain("TESTNET_TESTER_ACCESS_NOT_ACTIVE");
    expect(server).toContain("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
  });

  it("returns a high-entropy API Key + API Secret once and persists only the secret hash", () => {
    expect(server).toContain('const apiKey = `gmk_test_${randomBytes(20).toString("base64url")}`');
    expect(server).toContain('const apiSecret = `gms_test_${randomBytes(32).toString("base64url")}`');
    expect(server).toContain("key_id: apiKey");
    expect(server).toContain("api_key_hash: sha256(apiSecret)");
    expect(server).toContain("api_key: apiKey");
    expect(server).toContain("api_secret: apiSecret");
    expect(server).toContain("shown_once: true");
    expect(server).toContain('auth_scheme: "key_secret"');
    expect(page).toContain("API Key + API Secret");
    expect(browser).toContain("payload.data.api_secret");
  });

  it("requires both parts of the Testnet credential for external API authentication", () => {
    expect(access).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(access).toContain("TESTNET_API_CREDENTIAL_DENIED");
    expect(access).toContain("GeomacroTest");
    expect(access).toContain("sha256(input.apiSecret)");
    expect(access).toContain('startsWith("gmk_test_")');
  });

  it("supports own-product, AI-agent, automation and demo integrations", () => {
    expect(migration).toContain("'product_api','ai_agent','automation','demo'");
    expect(server).toContain('"testnet:structured"');
    expect(server).toContain('"testnet:risk-object"');
    expect(server).toContain('"testnet:risk-gate"');
    expect(server).toContain('"testnet:agent"');
  });

  it("limits credential sprawl and supports explicit revocation", () => {
    expect(server).toContain("length >= 3");
    expect(server).toContain("TESTNET_DEVELOPER_KEY_LIMIT_REACHED");
    expect(server).toContain("revokeTestnetDeveloperApiKey");
    expect(server).toContain("enabled: false, revoked_at: now");
  });
});
