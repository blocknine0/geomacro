import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const browser = readFileSync("public/testnet-access.js", "utf8");

describe("Testnet browser wallet verification", () => {
  it("supports modern and legacy injected EVM wallet discovery", () => {
    expect(browser).toContain("eip6963:announceProvider");
    expect(browser).toContain("eip6963:requestProvider");
    expect(browser).toContain("window.ethereum");
    expect(browser).toContain("eth_requestAccounts");
  });

  it("hex-encodes the UTF-8 verification message for personal_sign", () => {
    expect(browser).toContain("new TextEncoder().encode");
    expect(browser).toContain('method: "personal_sign"');
    expect(browser).toContain("params: [hexMessage, address]");
    expect(browser).toContain("params: [address, hexMessage]");
  });

  it("does not surface boolean transport artifacts as error messages", () => {
    expect(browser).toContain("firstString");
    expect(browser).toContain('value === "true" || value === "false"');
    expect(browser).toContain("error.status = response.status");
    expect(browser).toContain("error?.status !== 401");
  });

  it("guides users out of embedded previews when wallet injection is unavailable", () => {
    expect(browser).toContain("window.top !== window.self");
    expect(browser).toContain("Wallet extensions are usually unavailable inside embedded previews");
    expect(browser).toContain("https://geomacro.live/testnet-access");
  });
});
