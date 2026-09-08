import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Agentic Commerce public demo contract", () => {
  it("exposes the public sandbox, paid agent endpoint and feedback endpoint", () => {
    for (const path of [
      "src/routes/demo.tsx",
      "src/routes/api.demo.preflight.ts",
      "src/routes/api.agent.risk.ts",
      "src/routes/api.demo.feedback.ts",
    ]) {
      expect(existsSync(join(ROOT, path))).toBe(true);
    }

    expect(read("src/routes/api.demo.preflight.ts")).toContain(
      'createFileRoute("/api/demo/preflight")',
    );
    expect(read("src/routes/api.agent.risk.ts")).toContain(
      'createFileRoute("/api/agent/risk")',
    );
    expect(read("src/routes/api.demo.feedback.ts")).toContain(
      'createFileRoute("/api/demo/feedback")',
    );
  });

  it("pins the Circle x402 Arc Testnet payment contract", () => {
    const x402 = read("src/lib/circle-x402.server.ts");
    const pkg = read("package.json");

    expect(pkg).toContain('"@circle-fin/x402-batching": "3.4.0"');
    expect(pkg).toContain('"@x402/core": "2.25.0"');
    expect(pkg).toContain('"@x402/evm": "2.25.0"');
    expect(x402).toContain('"eip155:5042002"');
    expect(x402).toContain('"0x3600000000000000000000000000000000000000"');
    expect(x402).toContain('"0x0077777d7EBA4688BDeF3E311b846F25870A19B9"');
    expect(x402).toContain('"0.001"');
    expect(x402).toContain('"1000"');
    expect(x402).toContain("BatchFacilitatorClient");
    expect(x402).toContain("PAYMENT-REQUIRED");
    expect(x402).toContain("payment-signature");
    expect(x402).toContain("PAYMENT-RESPONSE");
  });

  it("keeps the free sandbox and paid path on the same fail-closed Risk Gate service", () => {
    const service = read("src/lib/agentic-demo-service.server.ts");
    const freeRoute = read("src/routes/api.demo.preflight.ts");
    const paidRoute = read("src/routes/api.agent.risk.ts");

    expect(service).toContain("evaluateCountryRiskGate");
    expect(service).toContain("evaluateCorridorRiskGate");
    expect(service).toContain("execution_authorized !== false");
    expect(freeRoute).toContain("runAgenticPreflightDemo");
    expect(paidRoute).toContain("runAgenticPreflightDemo");
    expect(paidRoute).toContain("verifyAndSettleCircleX402");
    expect(paidRoute).toContain("we do not recompute a second Risk Gate result");
  });

  it("uses the governed current structural serving layer without changing GRI v1.2", () => {
    const structural = read("src/lib/structural-context.server.ts");
    const contract = read("src/lib/agentic-demo-contract.ts");
    const service = read("src/lib/agentic-demo-service.server.ts");

    expect(structural).toContain("commercial_structural_country_profiles");
    expect(structural).toContain("commercial_structural_corridor_latest");
    expect(contract).toContain("EVIDENCE_ONLY_NOT_IN_GRI_V1_2");
    expect(service).toContain("structural_evidence_is_not_gri_v1_2_input");
    expect(service).toContain("loadStructuralContext(parsed.subject)");
    expect(structural).not.toContain('from("structural_geopolitical_observations")');
  });

  it("keeps the public demo allowlist deliberately narrow", () => {
    const service = read("src/lib/agentic-demo-service.server.ts");
    expect(service).toContain('["USA", "CHN"]');
    expect(service).toContain('["USA>CHN", "CHN>USA"]');
  });

  it("keeps feedback persistence privacy-minimized and does not store raw payer identity", () => {
    const migration = read("supabase/migrations/035_agentic_demo_feedback.sql");
    const endpoint = read("src/routes/api.demo.feedback.ts");
    const x402 = read("src/lib/circle-x402.server.ts");

    for (const forbidden of [
      "ip_address",
      "wallet_address",
      "raw_request",
      "payment_payload",
    ]) {
      expect(migration.toLowerCase()).not.toContain(`${forbidden} `);
    }

    expect(endpoint).toContain("stored without your IP address or wallet address");
    expect(x402).toContain('createHash("sha256")');
    expect(x402).toContain("x402:sha256:");
  });
});
