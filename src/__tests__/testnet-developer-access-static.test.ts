import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/lib/testnet-developer-access.server.ts", "utf8");
const migration = readFileSync("supabase/migrations/904_testnet_usdc_tester_access.sql", "utf8");

describe("paid testnet developer integration", () => {
  it("issues keys only after complete registration and active paid tester entitlement", () => {
    expect(server).toContain('registration_status !== "complete"');
    expect(server).toContain('access_status !== "active"');
    expect(server).toContain('grant.tier !== "testnet_tester"');
    expect(server).toContain('grant.metadata?.offer_id !== "testnet_tester_pass_30d"');
    expect(server).toContain("TESTNET_TESTER_ACCESS_NOT_ACTIVE");
    expect(server).toContain("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
  });

  it("returns a high-entropy plaintext key once while persisting only its hash", () => {
    expect(server).toContain('randomBytes(32).toString("base64url")');
    expect(server).toContain('const apiKeyHash = sha256(plaintext)');
    expect(server).toContain("api_key_hash: apiKeyHash");
    expect(server).toContain("api_key: plaintext");
    expect(server).toContain("shown_once: true");
    expect(migration).toContain("Plaintext API keys remain outside the database");
  });

  it("supports own-product, AI-agent, automation and demo integrations", () => {
    expect(migration).toContain("'product_api','ai_agent','automation','demo'");
    expect(server).toContain('"testnet:structured"');
    expect(server).toContain('"testnet:risk-object"');
    expect(server).toContain('"testnet:risk-gate"');
    expect(server).toContain('"testnet:agent"');
  });

  it("limits key sprawl and supports explicit revocation", () => {
    expect(server).toContain("length >= 3");
    expect(server).toContain("TESTNET_DEVELOPER_KEY_LIMIT_REACHED");
    expect(server).toContain("revokeTestnetDeveloperApiKey");
    expect(server).toContain("enabled: false, revoked_at: now");
  });
});
