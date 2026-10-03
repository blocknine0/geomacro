import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const workflow = read(".github/workflows/permanent-runtime-health.yml");
const b2Canary = read("scripts/ops/verify-b2-public-no-supabase.ts");
const commerceCanary = read("scripts/ops/verify-commerce-no-supabase.ts");

describe("permanent runtime health acceptance", () => {
  it("does not inject or require any Supabase credential", () => {
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).not.toContain("secrets.APP_SUPABASE");
    expect(workflow).not.toContain("SUPABASE_DB_URL:");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY:");
    expect(workflow).not.toContain("APP_SUPABASE_URL:");
    expect(workflow).toContain("Prove no Supabase credential is injected");
    expect(workflow).toContain("supabase_required_for_serving!==false");
    expect(workflow).toContain('supabase_runtime_mode!=="standby"');
  });

  it("requires D1, direct B2 and Durable Object runtime authorities", () => {
    expect(workflow).toContain("Verify live D1 control plane");
    expect(workflow).toContain('b?.store==="d1"');
    expect(workflow).toContain('b?.durable_payload_store==="b2"');
    expect(workflow).toContain('b?.commerce_ledger==="durable_object"');
    expect(workflow).toContain("Verify B2 directly with Supabase network blocked");
    expect(workflow).toContain("verify-b2-public-no-supabase.ts");
    expect(workflow).toContain('b?.production_data_authority!=="backblaze-b2"');
    expect(workflow).toContain("Verify Durable Object commerce ledger health");
    expect(workflow).toContain('b?.storage!=="durable_objects_sqlite"');
  });

  it("blocks Supabase network access during direct B2 serving verification", () => {
    expect(b2Canary).toContain('delete process.env.SUPABASE_DB_URL');
    expect(b2Canary).toContain('host.endsWith(".supabase.co")');
    expect(b2Canary).toContain('host.endsWith(".pooler.supabase.com")');
    expect(b2Canary).toContain("readB2PublicIntelligence()");
    expect(b2Canary).toContain("readB2PublicRisk()");
    expect(b2Canary).toContain("supabase_network_attempts: supabaseNetworkAttempts");
    expect(b2Canary).toContain("supabase_credentials_present: false");
  });

  it("executes the real commerce adapter against Durable Objects with Supabase blocked", () => {
    expect(workflow).toContain("Execute actual commerce adapter with Supabase absent");
    expect(workflow).toContain("bun scripts/ops/verify-commerce-no-supabase.ts");
    expect(workflow).toContain("GEOMACRO_COMMERCE_LEDGER_BACKEND: durable_object");
    expect(commerceCanary).toContain("NO_SUPABASE_ACCEPTANCE_BLOCKED_SUPABASE_NETWORK");
    expect(commerceCanary).toContain('replay.disposition !== "REPLAY"');
    expect(commerceCanary).toContain("NO_SUPABASE_DUPLICATE_SETTLEMENT_NOT_REJECTED");
    expect(commerceCanary).toContain("NO_SUPABASE_WORKER_OUTAGE_DID_NOT_FAIL_CLOSED");
  });

  it("seals a no-funds, non-destructive, no-cutover acceptance artifact", () => {
    expect(workflow).toContain("payment_performed:false");
    expect(workflow).toContain("external_payment_performed:false");
    expect(workflow).toContain("execution_authorized:false");
    expect(workflow).toContain("destructive_change:false");
    expect(workflow).toContain("production_cutover:false");
    expect(workflow).toContain("supabase_network_attempts:{b2:b2.supabase_network_attempts,commerce:acceptance.supabase_network_attempts}");
    expect(workflow).not.toContain("x402/intelligence");
    expect(workflow).not.toContain("storage.objects");
    expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(workflow).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  });
});
