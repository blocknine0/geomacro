import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accountSource = readFileSync(
  new URL("../lib/testnet-tester-account.server.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../../server/routes/testnet-access.get.ts", import.meta.url),
  "utf8",
);

describe("testnet tester registration boundary", () => {
  it("stores the verified wallet only as a hash", () => {
    expect(accountSource).toContain("wallet_address_hash");
    expect(accountSource).toContain("sha256(walletAddress)");
    expect(accountSource).toContain("TESTNET_WALLET_ALREADY_REGISTERED");
    expect(accountSource).not.toContain("private_key:");
    expect(accountSource).not.toContain("seed_phrase:");
  });

  it("does not require email or social OAuth in the new tester flow", () => {
    expect(pageSource).toContain("Wallet-only identity");
    expect(pageSource).toContain("Connect & verify wallet");
    expect(pageSource).not.toContain("Verify email");
    expect(pageSource).not.toContain("Connect X");
    expect(pageSource).not.toContain("Connect Discord");
  });

  it("describes the fixed quota and post-test X share-card flow", () => {
    expect(pageSource).toContain("0.50 Testnet USDC");
    expect(pageSource).toContain("500 credits");
    expect(pageSource).toContain("one quota per verified wallet");
    expect(pageSource).toContain("TEST → CARD → X");
    expect(pageSource).toContain("Share result on X");
  });
});
