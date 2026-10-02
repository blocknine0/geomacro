import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production-first public identity", () => {
  it("keeps testnet-only access out of buyer-facing shell navigation and footer", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).not.toContain('label: "Testnet API"');
    expect(shell).not.toContain("Connect testnet wallet");
    expect(shell).not.toContain('to="/testnet-access"');
    expect(shell).not.toContain("Testable implementation proof");
    expect(shell).toContain("Implementation proof");
    expect(shell).toContain("machine access follows live runtime policy");
  });

  it("does not advertise a testnet commerce mode as the public product status", () => {
    const status = read("src/components/agent-commerce-status.tsx");
    expect(status).not.toContain("x402 agent access · testnet proof");
    expect(status).not.toContain("configured for testnet proof only");
    expect(status).toContain("x402 agent access · controlled");
    expect(status).toContain("live HTTP challenge and health contract remain the authority");
  });

  it("retains technical proof routes without making them the production identity", () => {
    const routeTree = read("src/routeTree.gen.ts");
    expect(routeTree).toContain("/testnet-access");
    expect(routeTree).toContain("/onchain");
    expect(routeTree).toContain("/demo");
  });
});
