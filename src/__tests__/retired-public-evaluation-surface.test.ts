import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("retired public evaluation surfaces", () => {
  it("redirects legacy browser routes to the production API surface", () => {
    const accessRoute = read("src/routes/testnet-access.tsx");
    const consoleRoute = read("src/routes/testnet-console.tsx");

    expect(accessRoute).toContain('redirect({ to: "/data-api", replace: true })');
    expect(consoleRoute).toContain('Response.redirect(new URL("/data-api", request.url), 308)');
    expect(accessRoute).not.toContain("TestnetAccessPage");
    expect(consoleRoute).not.toContain("testnetConsoleHandler");
  });

  it("redirects legacy Nitro handlers permanently", () => {
    const accessHandler = read("server/routes/testnet-access.get.ts");
    const consoleHandler = read("server/routes/testnet-console.get.ts");

    expect(accessHandler).toContain('sendRedirect(event, "/data-api", 308)');
    expect(consoleHandler).toContain('sendRedirect(event, "/data-api", 308)');
  });
});
