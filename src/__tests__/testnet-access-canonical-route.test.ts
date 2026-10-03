import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accessRoute = readFileSync("src/routes/testnet-access.tsx", "utf8");
const consoleRoute = readFileSync("src/routes/testnet-console.tsx", "utf8");

describe("retired public Testnet onboarding surface", () => {
  it("keeps the historical route stable but redirects buyers to the production API surface", () => {
    expect(accessRoute).toContain('createFileRoute("/testnet-access")');
    expect(accessRoute).toContain('redirect({ to: "/data-api", replace: true })');
    expect(accessRoute).not.toContain("TestnetAccessPage");
    expect(accessRoute).not.toContain("/api/testnet-tester/");
  });

  it("retires the legacy server console without deleting backend test contracts", () => {
    expect(consoleRoute).toContain('createFileRoute("/testnet-console")');
    expect(consoleRoute).toContain('Response.redirect(new URL("/data-api", request.url), 308)');
    expect(consoleRoute).not.toContain("testnetConsoleHandler");
  });
});
