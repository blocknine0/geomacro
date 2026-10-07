import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production-first public identity", () => {
  it("keeps the public shell commercial-only", () => {
    const shell = read("src/components/site-shell.tsx");
    for (const marker of ["Technical Proof", "Testnet API", "/testnet-access", "/onchain", "/bridge-swap", "/arena", "Connect wallet"]) {
      expect(shell).not.toContain(marker);
    }
    expect(shell).toContain('label: "API & Agents"');
    expect(shell).toContain('label: "Institutions"');
    expect(shell).toContain('label: "Pricing"');
  });

  it("publishes only production or production-gated commerce status", () => {
    const status = read("src/components/agent-commerce-status.tsx");
    expect(status.toLowerCase()).not.toContain("testnet");
    expect(status).toContain("x402 commercial access · production activation pending");
    expect(status).toContain("live HTTP challenge and health contract remain the authority");
  });

  it("retires legacy client routes into current commercial surfaces", () => {
    const expectations: Array<[string, string]> = [
      ["src/routes/arena.tsx", "/intelligence"],
      ["src/routes/bridge.tsx", "/data-api"],
      ["src/routes/bridge-swap.tsx", "/data-api"],
      ["src/routes/onchain.tsx", "/data-api"],
      ["src/routes/testnet-access.tsx", "/data-api"],
      ["src/routes/testnet-console.tsx", "/data-api"],
      ["src/routes/demo.tsx", "/data-api"],
      ["src/routes/pipeline.tsx", "/research"],
    ];
    for (const [path, target] of expectations) {
      const source = read(path);
      expect(source).toContain('to: "' + target + '"');
      expect(source).toContain("replace: true");
    }
  });
});
