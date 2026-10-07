import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("canonical one-data multi-delivery architecture", () => {
  it("keeps one governed intelligence foundation", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    expect(contract).toContain("one governed intelligence foundation");
    expect(contract).toContain("not a separate risk engine");
    expect(contract).toContain("There is no API-only, pay-per-call-only or x402-only risk database");
  });

  it("keeps commercial API on governed structural context", () => {
    expect(read("server/api/commercial/structural.post.ts")).toContain("loadStructuralContext");
  });

  it("keeps A2A commercial delivery on canonical risk services", () => {
    const a2a = read("src/lib/a2a-service.server.ts");
    expect(a2a).toContain("preflightTestnetIntelligenceAvailability");
    expect(a2a).toContain("runCanonicalTestnetIntelligence");
    expect(a2a).toContain('capability: "risk_gate_bundle"');
    expect(a2a).toContain("execution_authorized: false");
    expect(a2a).not.toContain("settleTestnetApiCall");
  });

  it("keeps x402 payment as a transport around canonical delivery", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    expect(contract).toContain("Pay-per-call is settlement around canonical intelligence");
    expect(contract).toContain("payment challenge only if deliverable");
    expect(contract).toContain("final deliverability recheck");
  });

  it("keeps customer execution outside Geomacro", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    expect(contract).toContain("Customer identity + permissions + policy");
    expect(contract).toContain("Customer-controlled action");
    expect(contract).toContain("execution_authorized=false");
  });
});
