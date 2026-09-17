import fs from "node:fs";
import { describe, expect, it } from "vitest";

const statusComponent = fs.readFileSync("src/components/agent-commerce-status.tsx", "utf8");
const healthRoute = fs.readFileSync("src/routes/api.health.ts", "utf8");
const paymentRoute = fs.readFileSync("src/routes/api.x402.intelligence.ts", "utf8");

describe("agent commerce status probe", () => {
  it("never probes the fail-closed payment endpoint from public UI", () => {
    expect(statusComponent).toContain('fetch("/api/health"');
    expect(statusComponent).not.toContain('fetch("/api/x402/intelligence"');
  });

  it("exposes x402 runtime state through a 200-only health response", () => {
    expect(healthRoute).toContain("getCoinbaseX402Config");
    expect(healthRoute).toContain('state: "controlled_prelaunch"');
    expect(healthRoute).toContain('state: "configuration_invalid"');
    expect(healthRoute).toContain("configured: false");
    expect(healthRoute).toContain("status: 200");
    expect(healthRoute).not.toContain("error.message");
  });

  it("keeps the actual payment endpoint fail-closed when x402 is disabled", () => {
    expect(paymentRoute).toContain("COINBASE_X402_NOT_CONFIGURED");
    expect(paymentRoute).toContain("503");
  });
});
