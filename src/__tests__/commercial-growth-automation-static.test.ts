import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/935_commercial_marketing_draft_queue.sql",
  "utf8",
);
const service = readFileSync("src/lib/commercial-growth.server.ts", "utf8");
const getRoute = readFileSync("server/api/internal/commercial-growth.get.ts", "utf8");
const postRoute = readFileSync("server/api/internal/commercial-growth.post.ts", "utf8");
const dashboard = readFileSync("server/routes/internal/commercial-ops.get.ts", "utf8");
const manifest = JSON.parse(
  readFileSync("config/commercial-launch-manifest.json", "utf8"),
) as any;

describe("commercial growth automation safety contract", () => {
  it("queues automatic drafts only from matched settled production revenue", () => {
    expect(migration).toContain("new.environment not in ('mainnet', 'fiat')");
    expect(migration).toContain("new.payment_status <> 'settled'");
    expect(migration).toContain("new.reconciliation_status <> 'matched'");
    expect(migration).toContain("new.commercial_revenue is not true");
    expect(migration).toContain("new.revenue_classification <> 'commercial_revenue'");
    expect(migration).toContain("v_count not in (1, 10, 100, 1000, 10000, 100000)");
  });

  it("hard-disables automatic public publishing and requires owner review", () => {
    expect(migration).toContain("check (requires_human_approval = true)");
    expect(migration).toContain("check (auto_publish_allowed = false)");
    expect(service).toContain('.eq("status", "draft")');
    expect(service).toContain('.eq("requires_human_approval", true)');
    expect(service).toContain('.eq("auto_publish_allowed", false)');
    expect(postRoute).toContain("publication_performed: false");
    expect(postRoute).not.toContain('action: "publish"');
    expect(dashboard).toContain("Approve");
    expect(dashboard).toContain("Reject");
    expect(dashboard).toContain("No external publication performed");
    expect(dashboard).not.toContain("action:'publish'");
    expect(dashboard).not.toContain('action:"publish"');
  });

  it("keeps the marketing queue private and service-role only", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "revoke all on table public.commercial_marketing_drafts from PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.commercial_marketing_drafts to service_role",
    );
    expect(getRoute).toContain("requireCommercialOpsToken");
    expect(postRoute).toContain("requireCommercialOpsToken");
    expect(dashboard).toContain("x-geomacro-ops-token");
    expect(dashboard).not.toContain("localStorage");
    expect(dashboard).not.toContain("document.cookie");
  });

  it("does not expose payer/customer identity in automatic milestone evidence", () => {
    expect(migration).not.toContain("payer_reference_hash");
    expect(migration).not.toContain("principal_id");
    expect(migration).not.toContain("recipient_reference_hash");
    expect(service).toContain("customer_identity_disclosed: false");
    expect(service).toContain("payer_identity_disclosed: false");
    expect(service).toContain("raw_request_disclosed: false");
  });

  it("keeps GOAT mainnet outside the initial commercial launch cohort", () => {
    expect(manifest.providers.goat_x402.launch_cohort).toBe(false);
    expect(manifest.providers.goat_x402.production_enabled).toBe(false);
    expect(manifest.providers.goat_x402.status).toBe(
      "deferred_manual_mainnet_merchant_onboarding",
    );
    expect(manifest.providers.coinbase_x402.launch_cohort).toBe(true);
    expect(manifest.providers.nevermined.launch_cohort).toBe(true);
  });
});
