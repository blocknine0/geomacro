import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registrationSource = readFileSync(
  new URL("../lib/testnet-tester-registration.server.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../../server/routes/testnet-access.get.ts", import.meta.url),
  "utf8",
);

describe("testnet tester registration boundary", () => {
  it("persists only hashed identity references", () => {
    expect(registrationSource).toContain("email_hash");
    expect(registrationSource).toContain("wallet_address_hash");
    expect(registrationSource).toContain("x_account_id_hash");
    expect(registrationSource).toContain("discord_account_id_hash");
    expect(registrationSource).toContain("sha256Canonical");
  });

  it("does not accept raw OAuth access tokens or wallet secrets", () => {
    for (const forbiddenParameter of [
      "x_access_token:",
      "discord_access_token:",
      "refresh_token:",
      "private_key:",
      "seed_phrase:",
    ]) {
      expect(registrationSource).not.toContain(forbiddenParameter);
    }
  });

  it("requires the full tester identity flow before the fixed quota is described", () => {
    expect(pageSource).toContain("Verify email");
    expect(pageSource).toContain("Connect wallet");
    expect(pageSource).toContain("Connect X");
    expect(pageSource).toContain("Connect Discord");
    expect(pageSource).toContain("Complete profile");
    expect(pageSource).toContain("0.50 Testnet USDC");
    expect(pageSource).toContain("500 credits");
    expect(pageSource).toContain("one quota per verified email + wallet");
    expect(pageSource).toContain("Post feedback on X");
  });
});
