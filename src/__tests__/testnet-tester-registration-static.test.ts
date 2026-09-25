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

  it("uses only profile plus wallet in the tester flow", () => {
    expect(pageSource).toContain("Create a tester profile and verify one EVM wallet");
    expect(pageSource).toContain("Connect & verify wallet");
    expect(pageSource).not.toContain("Verify email");
    expect(pageSource).not.toContain("Connect X");
    expect(pageSource).not.toContain("Connect Discord");
  });

  it("describes canonical Testnet pay-per-call pricing, developer credentials and post-test X sharing", () => {
    expect(pageSource).toContain("The live manifest is the source of truth for capabilities, pricing and payment configuration.");
    expect(pageSource).toContain("No upfront activation payment.");
    expect(pageSource).toContain("API Secret is shown once");
    expect(pageSource).toContain("402 → pay → retry");
    expect(pageSource).toContain("TEST → X → FEEDBACK");
    expect(pageSource).toContain("open one X post");
  });
});
