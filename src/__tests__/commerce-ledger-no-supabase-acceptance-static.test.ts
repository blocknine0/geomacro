import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/no-supabase-commerce-acceptance.yml", "utf8");
const acceptance = readFileSync("scripts/ops/verify-commerce-no-supabase.ts", "utf8");

describe("no-Supabase commerce acceptance safety", () => {
  it("is production-scoped, pinned, and reruns on relevant canonical main changes", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('"src/lib/agent-commerce-delivery.server.ts"');
    expect(workflow).toContain('"workers/commerce-ledger/**"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(workflow).toContain('bun-version: "1.4.2"');
    expect(workflow).toContain("bun install --frozen-lockfile --ignore-scripts");
  });

  it("selects the durable ledger and uses only the dedicated shared token", () => {
    expect(workflow).toContain("GEOMACRO_COMMERCE_LEDGER_BACKEND: durable_object");
    expect(workflow).toContain("https://geomacro-commerce-ledger.daspallab202391.workers.dev");
    expect(workflow).toContain("secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY:");
    expect(workflow).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY:");
    expect(workflow).not.toContain("GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY");
    expect(workflow).not.toContain("CIRCLE_GATEWAY_API_KEY");
    expect(workflow).not.toContain("NEVERMINED_API_KEY");
  });

  it("executes the actual server adapter with Supabase credentials removed and network blocked", () => {
    expect(acceptance).toContain('await import("../../src/lib/agent-commerce-delivery.server.ts")');
    expect(acceptance).toContain('"APP_SUPABASE_URL"');
    expect(acceptance).toContain('"APP_SUPABASE_SERVICE_ROLE_KEY"');
    expect(acceptance).toContain('"SUPABASE_URL"');
    expect(acceptance).toContain('"SUPABASE_SERVICE_ROLE_KEY"');
    expect(acceptance).toContain('target?.hostname.endsWith(".supabase.co")');
    expect(acceptance).toContain("NO_SUPABASE_ACCEPTANCE_BLOCKED_SUPABASE_NETWORK");
    expect(acceptance).toContain("supabaseFetchAttempts !== 0");
  });

  it("proves fail-closed replay and settlement uniqueness without provider execution", () => {
    expect(acceptance).toContain("claimAgentCommerceDelivery");
    expect(acceptance).toContain("prepareAgentCommerceDelivery");
    expect(acceptance).toContain("completeAgentCommerceDelivery");
    expect(acceptance).toContain("releaseAgentCommerceDelivery");
    expect(acceptance).toContain('process.env.GEOMACRO_COMMERCE_LEDGER_URL = "https://geomacro-ledger-outage.invalid"');
    expect(acceptance).toContain("NO_SUPABASE_DUPLICATE_SETTLEMENT_NOT_REJECTED");
    expect(acceptance).toContain("NO_SUPABASE_WORKER_OUTAGE_DID_NOT_FAIL_CLOSED");
    expect(acceptance).toContain("external_payment_performed: false");
    expect(acceptance).toContain("execution_authorized: false");
    expect(acceptance).not.toContain("settleCoinbaseX402(");
    expect(acceptance).not.toContain("settleCircleGatewayProduction(");
    expect(acceptance).not.toContain("settleNeverminedPermissions(");
  });
});
