import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production-first public identity", () => {
  it("keeps retired testnet access out of buyer and technical-proof navigation", () => {
    const shell = read("src/components/site-shell.tsx");
    const primary = shell.match(/const PRIMARY_NAV = \[[\s\S]*?\] as const;/)?.[0] ?? "";
    const technical = shell.match(/const TECHNICAL_NAV = \[[\s\S]*?\] as const;/)?.[0] ?? "";
    const retiredRoute = read("src/routes/testnet-access.tsx");

    expect(primary).not.toContain("Testnet API");
    expect(primary).not.toContain("/testnet-access");
    expect(technical).not.toContain("Testnet API");
    expect(technical).not.toContain("/testnet-access");
    expect(retiredRoute).toContain('redirect({ to: "/data-api", replace: true })');
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

  it("retains legacy route compatibility without making testnet part of the production identity", () => {
    const routeTree = read("src/routeTree.gen.ts");
    expect(routeTree).toContain("/testnet-access");
    expect(routeTree).toContain("/onchain");
    expect(routeTree).toContain("/demo");
  });
});
