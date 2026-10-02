import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production-first public identity", () => {
  it("keeps testnet access isolated inside Technical Proof rather than primary buyer navigation", () => {
    const shell = read("src/components/site-shell.tsx");
    const primary = shell.match(/const PRIMARY_NAV = \[[\s\S]*?\] as const;/)?.[0] ?? "";
    const technical = shell.match(/const TECHNICAL_NAV = \[[\s\S]*?\] as const;/)?.[0] ?? "";

    expect(primary).not.toContain("Testnet API");
    expect(primary).not.toContain("/testnet-access");
    expect(technical).toContain('{ to: "/testnet-access", label: "Testnet API"');
    expect(shell).not.toContain("Connect testnet wallet");
    expect(shell).not.toContain("Testable implementation proof");
    expect(shell).toContain("Implementation proof");
    expect(shell).toContain("machine access follows live runtime policy");
  });

  it("reports live commerce mode without promoting testnet settlement as commercial revenue", () => {
    const status = read("src/components/agent-commerce-status.tsx");
    expect(status).not.toContain("x402 agent access · testnet proof");
    expect(status).not.toContain("configured for testnet proof only");
    expect(status).toContain("x402 agent access · controlled pre-launch");
    expect(status).toContain("x402 agent access · controlled testnet");
    expect(status).toContain("Testnet settlement is not commercial revenue");
    expect(status).toContain("live HTTP challenge and health contract remain the authority");
  });

  it("retains technical proof routes without making them the production identity", () => {
    const routeTree = read("src/routeTree.gen.ts");
    expect(routeTree).toContain("/testnet-access");
    expect(routeTree).toContain("/onchain");
    expect(routeTree).toContain("/demo");
  });
});
