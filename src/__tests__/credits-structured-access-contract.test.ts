import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("credits and structured access contract", () => {
  it("keeps the launch Free Explorer quota at 500 credits per 30 days", () => {
    const contract = read("src/lib/commercial-access-contract.ts");

    expect(contract).toContain('GEOMACRO_CREDIT_CONTRACT_VERSION = "credits-v1.0.1"');
    expect(contract).toContain('label: "Free Explorer"');
    expect(contract).toContain("credits_per_30_days: 500");
  });

  it("never grants raw/private warehouse delivery to any customer tier", () => {
    const contract = read("src/lib/commercial-access-contract.ts");

    expect(contract).toContain("raw_customer_delivery: false");
    expect(contract).toContain("private_warehouse_customer_access: false");
    expect(contract).toContain("structured_delivery_required_for_every_tier: true");
    expect(contract).not.toContain("raw_data_access: true");
  });

  it("exposes a bounded public structural query without upgrading free users to full profiles", () => {
    const agent = read("src/lib/geomacro-agent-contract.ts");
    const digest = read("src/lib/public-structural-digest.server.ts");
    const route = read("src/routes/api.agent.risk.ts");

    expect(agent).toContain('"structural_query"');
    expect(agent).toContain("up to three latest eligible observations");
    expect(digest).toContain("max_structural_observations_per_response");
    expect(digest).toContain('raw_data_included: false');
    expect(digest).toContain('private_warehouse_access: false');
    expect(route).toContain('hasCapability(rawBody, "structural_query")');
    expect(route).toContain("handlePublicStructuralQuery");
    expect(route).toContain('namespace: "geomacro-agent-structural"');
  });

  it("keeps durable credit enforcement explicitly separate from anonymous rate limits", () => {
    const agent = read("src/lib/geomacro-agent-contract.ts");
    const digest = read("src/lib/public-structural-digest.server.ts");
    const migration = read("supabase/migrations/043_commercial_credit_ledger.sql");

    expect(agent).toContain("Anonymous public endpoints remain rate-limited until durable account credit metering is activated");
    expect(digest).toContain("durable_metering_active: false");
    expect(migration).toContain("commercial_credit_accounts");
    expect(migration).toContain("commercial_credit_usage");
    expect(migration).toContain("ensure_commercial_credit_account");
    expect(migration).toContain("consume_commercial_credits");
    expect(migration).toContain("greatest(included_credits, p_included_credits)");
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
