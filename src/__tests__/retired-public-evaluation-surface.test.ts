import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("retired public evaluation surfaces", () => {
  it("redirects legacy browser routes to the production API and Agents page", () => {
    const accessRoute = read("src/routes/testnet-access.tsx");
    const consoleRoute = read("src/routes/testnet-console.tsx");

    expect(accessRoute).toContain('redirect({ to: "/data-api", replace: true })');
    expect(consoleRoute).toContain('Response.redirect(new URL("/data-api", request.url), 308)');
  });

  it("redirects legacy Nitro handlers permanently", () => {
    const accessHandler = read("server/routes/testnet-access.get.ts");
    const consoleHandler = read("server/routes/testnet-console.get.ts");

    expect(accessHandler).toContain('sendRedirect(event, "/data-api", 308)');
    expect(consoleHandler).toContain('sendRedirect(event, "/data-api", 308)');
  });

  it("does not expose retired evaluation access in public navigation", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).not.toContain('{ to: "/testnet-access"');
    expect(shell).not.toContain('label: "Testnet API"');
  });

  it("keeps the historical evaluation document out of public docs", () => {
    const docs = read("src/lib/docs-content.ts");
    expect(docs).toContain('PUBLIC_DOCS_EXCLUDED_SLUGS = new Set(["36-arc-testnet"])');
  });
});
