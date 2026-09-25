import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Arc Mainnet network configuration", () => {
  it("pins the current Arc Mainnet parameters without activating them", () => {
    const source = readFileSync("src/lib/arc.ts", "utf8");

    expect(source).toContain("chainIdDec: 5042");
    expect(source).toContain('chainIdHex: "0x13b2"');
    expect(source).toContain('rpcUrl: "https://rpc.mainnet.arc.io"');
    expect(source).toContain('explorer: "https://explorer.arc.io"');
    expect(source).toContain("live: false");
  });

  it("keeps Arc Testnet as the active technical-proof network", () => {
    const source = readFileSync("src/lib/arc.ts", "utf8");

    expect(source).toContain("chainIdDec: 5042002");
    expect(source).toContain('rpcUrl:');
    expect(source).toContain("ARC_TESTNET_RPC_URLS");
  });
});
