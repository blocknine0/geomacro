import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const ARCHITECTURE_TOKENS = [
  "Real-world evidence and data",
  "Normalize, classify and preserve provenance",
  "Structured intelligence state",
  "Separate Risk Indices - Live",
  "Ask Geomacro - Live",
  "Country Risk Object - Private Pilot",
  "Corridor Risk Object - Private Pilot",
  "Risk Gate - Private Pilot",
  "Commercial API / agent delivery - Production Gated",
  "Customer identity + permissions + policy",
  "Customer-controlled action",
] as const;

describe("commercial website source-of-truth contract", () => {
  it("aligns canonical product architecture", () => {
    for (const path of ["README.md", "src/content/docs/02-product-architecture.md", "docs/CANONICAL_DELIVERY_ARCHITECTURE.md"]) {
      const content = read(path);
      for (const token of ARCHITECTURE_TOKENS) expect(content, path).toContain(token);
    }
  });

  it("keeps navigation commercial-only", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Risk Indices"');
    expect(shell).toContain('label: "API & Agents"');
    expect(shell).toContain('label: "Institutions"');
    expect(shell).toContain('label: "Pricing"');
    expect(shell).not.toMatch(/Technical Proof|Testnet API|Arc \/ Onchain|Bridge & Swap|Prediction Markets/);
  });

  it("keeps commercial delivery bounded and production-gated", () => {
    expect(read("src/routes/data-api.tsx")).toContain("Real-money x402 access stays fail-closed");
    expect(read("src/routes/pricing.tsx")).toContain("0.05");
    expect(read("src/routes/risk-gate.tsx")).toContain("PRIVATE PILOT");
    expect(read("src/routes/risk-gate.tsx")).toContain("execution_authorized = false");
  });

  it("retires superseded routes to current commercial surfaces", () => {
    expect(read("src/routes/feed.tsx")).toContain('to: "/intelligence"');
    expect(read("src/routes/bridge.tsx")).toContain('to: "/data-api"');
    expect(read("src/routes/onchain.tsx")).toContain('to: "/data-api"');
    expect(read("src/routes/arena.tsx")).toContain('to: "/intelligence"');
    expect(read("src/routes/pipeline.tsx")).toContain('to: "/research"');
  });

  it("keeps Circle membership factual without implying endorsement", () => {
    const ecosystem = read("src/routes/ecosystem.tsx");
    expect(ecosystem).toContain("https://partners.circle.com/partner/geomacro");
    expect(ecosystem).toContain("It does not mean Circle endorses Geomacro");
    expect(ecosystem).not.toContain("Official Circle Partner");
  });
});
