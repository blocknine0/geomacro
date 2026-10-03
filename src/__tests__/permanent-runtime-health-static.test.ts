import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const workflow = read(".github/workflows/permanent-runtime-health.yml");

describe("permanent runtime health acceptance", () => {
  it("does not inject or require any Supabase credential", () => {
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).not.toContain("secrets.APP_SUPABASE");
    expect(workflow).not.toContain("SUPABASE_DB_URL:");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY:");
    expect(workflow).toContain("Prove no Supabase credential is injected");
    expect(workflow).toContain("supabase_required_for_serving!==false");
    expect(workflow).toContain('supabase_runtime_mode!=="standby"');
  });

  it("requires all three permanent runtime authorities", () => {
    expect(workflow).toContain("Verify live D1 control plane");
    expect(workflow).toContain('b?.store==="d1"');
    expect(workflow).toContain('b?.durable_payload_store==="b2"');
    expect(workflow).toContain('b?.commerce_ledger==="durable_object"');
    expect(workflow).toContain("Verify B2-authoritative public production with Supabase standby");
    expect(workflow).toContain('b?.production_data_authority!=="backblaze-b2"');
    expect(workflow).toContain("Verify Durable Object commerce ledger without payment");
    expect(workflow).toContain('b?.storage!=="durable_objects_sqlite"');
  });

  it("remains no-funds and non-destructive", () => {
    expect(workflow).toContain("payment_performed:false");
    expect(workflow).toContain("destructive_change:false");
    expect(workflow).not.toContain("x402/intelligence");
    expect(workflow).not.toContain("storage.objects");
    expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(workflow).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  });
});
