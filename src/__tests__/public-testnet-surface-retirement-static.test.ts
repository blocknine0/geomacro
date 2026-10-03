import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const middleware = read("server/middleware/05-retire-public-testnet-surfaces.ts");
const reactAccess = read("src/routes/testnet-access.tsx");
const reactConsole = read("src/routes/testnet-console.tsx");
const serverAccess = read("server/routes/testnet-access.get.ts");
const serverConsole = read("server/routes/testnet-console.get.ts");

describe("public Testnet surface retirement", () => {
  it("permanently redirects only the two buyer-facing Testnet deep links", () => {
    expect(middleware).toContain('"/testnet-access"');
    expect(middleware).toContain('"/testnet-console"');
    expect(middleware).toContain('sendRedirect(event, "/data-api", 308)');
    expect(middleware).toContain('method !== "GET" && method !== "HEAD"');
    expect(middleware).toContain("RETIRED_PUBLIC_TESTNET_PATHS.has(pathname)");
  });

  it("does not broaden the redirect boundary to Testnet APIs or assets", () => {
    expect(middleware).not.toContain('"/api/testnet');
    expect(middleware).not.toContain('startsWith("/testnet');
    expect(middleware).not.toContain('includes("/testnet');
  });

  it("preserves the source-level technical Testnet contracts for validation and recovery", () => {
    expect(reactAccess).toContain('createFileRoute("/testnet-access")');
    expect(reactAccess).toContain('AUTH_FLOW = "client-wallet-first-v4-public-developer"');
    expect(reactConsole).toContain('createFileRoute("/testnet-console")');
    expect(serverAccess).toContain("Geomacro Testnet Access");
    expect(serverConsole).toContain("CANONICAL INTELLIGENCE PIPELINE");
  });
});
