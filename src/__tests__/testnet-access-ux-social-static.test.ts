import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retiredRoute = readFileSync("src/routes/testnet-access.tsx", "utf8");
const consoleRoute = readFileSync("src/routes/testnet-console.tsx", "utf8");
const wildcard = readFileSync("src/routes/api/testnet-tester/$.tsx", "utf8");
const logout = readFileSync("server/api/testnet-tester/logout.post.ts", "utf8");
const feedback = readFileSync("server/api/demo/feedback.post.ts", "utf8");

describe("retired public Testnet UX", () => {
  it("sends legacy public Testnet visitors to the production API surface", () => {
    expect(retiredRoute).toContain('redirect({ to: "/data-api", replace: true })');
    expect(consoleRoute).toContain('new URL("/data-api", request.url)');
    expect(consoleRoute).toContain("308");
  });

  it("keeps wallet-session logout available as an internal fail-closed API", () => {
    expect(wildcard).toContain("logoutPost");
    expect(logout).toContain("revokeTestnetTesterSession");
    expect(logout).toContain("clearTesterSessionCookie");
    expect(logout).toContain("execution_authorized: false");
  });

  it("keeps the existing optional feedback endpoint without promoting Testnet UX on the production website", () => {
    expect(feedback).toContain("execution_authorized: false");
    expect(retiredRoute).not.toContain("OPTIONAL FEEDBACK + X");
    expect(retiredRoute).not.toContain("Public Testnet access");
  });
});
