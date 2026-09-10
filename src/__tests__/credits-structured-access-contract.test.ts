import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("credits and structured access contract", () => {
  it("keeps Free Explorer website-only with no commercial API credits", () => {
    const contract = read("src/lib/commercial-access-contract.ts");

    expect(contract).toContain('GEOMACRO_CREDIT_CONTRACT_VERSION = "credits-v1.1.0"');
    expect(contract).toContain('label: "Free Explorer"');
    expect(contract).toContain('access_mode: "public_web_only"');
    expect(contract).toContain("credits_per_30_days: 0");
    expect(contract).toContain("free_api_access: false");
    expect(contract).toContain("free_structured_download: false");
  });

  it("never grants raw/private warehouse delivery to any customer tier", () => {
    const contract = read("src/lib/commercial-access-contract.ts");

    expect(contract).toContain("raw_customer_delivery: false");
    expect(contract).toContain("private_warehouse_customer_access: false");
    expect(contract).toContain("commercial_api_requires_paid_entitlement: true");
    expect(contract).not.toContain("raw_data_access: true");
  });

  it("removes anonymous intelligence and structural capabilities from the agent API", () => {
    const agent = read("src/lib/geomacro-agent-contract.ts");
    const route = read("src/routes/api.agent.risk.ts");
    const discovery = read("public/.well-known/geomacro-agent.json");

    expect(agent).toContain("free_api_access: false");
    expect(agent).toContain('public_api: "not_available"');
    expect(route).toContain("FREE_API_NOT_AVAILABLE");
    expect(route).not.toContain("handlePublicStructuralQuery");
    expect(route).not.toContain("handlePublicIntelligenceQuery");
    expect(discovery).toContain('"public_api": "not_available"');
    expect(discovery).not.toContain('"access": "public_free"');
  });

  it("keeps durable credit enforcement explicitly separate from public website access", () => {
    const migration = read("supabase/migrations/043_commercial_credit_ledger.sql");
    const registry = read("src/lib/structured-data-entitlement-registry.ts");

    expect(registry).toContain('access_surfaces: ["public_web"]');
    expect(registry).toContain("api_access: false");
    expect(migration).toContain("commercial_credit_accounts");
    expect(migration).toContain("commercial_credit_usage");
    expect(migration).toContain("ensure_commercial_credit_account");
    expect(migration).toContain("consume_commercial_credits");
    expect(migration).toContain("unique (account_id, request_id)");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from PUBLIC, anon, authenticated");
  });

  it("keeps the current Arc x402 flow technical proof rather than production commercial payments", () => {
    const route = read("src/routes/api.agent.risk.ts");
    const agent = read("src/lib/geomacro-agent-contract.ts");
    const roadmap = read("docs/PRODUCTION_PAYMENT_NEXT_PLAN.md");

    expect(route).toContain("Arc Testnet");
    expect(route).toContain("technical proof only");
    expect(route).toContain("not the planned production real-money commercial payment system");
    expect(agent).toContain("Current Arc Testnet x402 pricing is technical proof only");

    expect(roadmap).toContain("real-money production payment rails only");
    expect(roadmap).toContain("multi-chain settlement support");
    expect(roadmap).toContain("USD-denominated payment");
    expect(roadmap).toContain("INR-denominated payment");
    expect(roadmap).toContain("No testnet transaction is a commercial payment");
    expect(roadmap).toContain("server-side verification of provider payment status");
    expect(roadmap).toContain("webhook signature verification");
  });
});
