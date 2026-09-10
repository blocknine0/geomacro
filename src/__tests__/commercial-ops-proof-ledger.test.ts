import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const migration = read("supabase/migrations/902_commercial_ops_proof_ledger.sql");
const backfill = read("supabase/migrations/903_commercial_ops_legacy_testnet_backfill.sql");
const service = read("src/lib/commercial-ops.server.ts");
const ownerPage = read("server/routes/internal/commercial-ops.get.ts");
const publicPage = read("server/routes/proof/commercial/[slug].get.ts");
const structuralApi = read("server/api/commercial/structural.post.ts");
const circleX402 = read("src/lib/circle-x402.server.ts");

describe("central commercial operations and proof ledger", () => {
  it("creates normalized usage, payment and proof tables with service-role-only access", () => {
    expect(migration).toContain("commercial_payment_events");
    expect(migration).toContain("commercial_usage_events");
    expect(migration).toContain("commercial_proof_snapshots");
    expect(migration).toContain("commercial_ops_usage_rollup");
    expect(migration).toContain("commercial_ops_payment_rollup");
    expect(migration).toContain("revoke all on table public.commercial_payment_events from PUBLIC, anon, authenticated");
    expect(migration).toContain("revoke all on table public.commercial_usage_events from PUBLIC, anon, authenticated");
    expect(migration).toContain("grant all on table public.commercial_payment_events to service_role");
    expect(migration).toContain("grant all on table public.commercial_usage_events to service_role");
  });

  it("hard-blocks Testnet revenue classification and execution authorization", () => {
    expect(migration).toContain("environment = 'testnet' and commercial_revenue = true");
    expect(migration).toContain("environment <> 'testnet' or revenue_classification = 'testnet_non_revenue'");
    expect(migration).toContain("check (execution_authorized = false)");
    expect(backfill).toContain("'testnet_non_revenue'");
    expect(backfill).toContain("false,");
    expect(backfill).toContain("provider_reference_is_not_assumed_tx_hash");
  });

  it("does not create columns for upstream news-source disclosure or raw secrets", () => {
    const lower = migration.toLowerCase();
    expect(lower).not.toContain("news_source_name text");
    expect(lower).not.toContain("publisher_name text");
    expect(lower).not.toContain("source_url text");
    expect(lower).not.toContain("raw_request_body");
    expect(lower).not.toContain("api_key text");
    expect(lower).not.toContain("private_key");
    expect(lower).not.toContain("ip_address");
  });

  it("uses a high-entropy owner token only through a non-persistent same-origin header", () => {
    expect(service).toContain("COMMERCIAL_OPS_ADMIN_TOKEN");
    expect(service).toContain("timingSafeEqual");
    expect(ownerPage).toContain("x-geomacro-ops-token");
    expect(ownerPage).toContain("not stored in localStorage, cookies or the URL");
    expect(ownerPage).not.toContain("localStorage.setItem");
    expect(ownerPage).not.toContain("document.cookie");
  });

  it("publishes only redacted aggregate proof snapshots with integrity hashes", () => {
    expect(service).toContain("payload_sha256");
    expect(service).toContain("public-redaction-v1");
    expect(service).toContain("customer_identity_disclosed: false");
    expect(service).toContain("upstream_news_source_identity_disclosed: false");
    expect(publicPage).toContain("payload_sha256_valid");
    expect(publicPage).toContain("Testnet is always non-revenue");
  });

  it("supports sharing public proof without exposing the owner token", () => {
    for (const target of [
      "twitter.com/intent/tweet",
      "linkedin.com/sharing/share-offsite",
      "reddit.com/submit",
      "wa.me",
      "t.me/share/url",
    ]) {
      expect(publicPage).toContain(target);
    }
    expect(publicPage).not.toContain("COMMERCIAL_OPS_ADMIN_TOKEN");
    expect(publicPage).not.toContain("x-geomacro-ops-token");
  });

  it("records paid structured delivery and Circle Testnet settlement into the centralized ledger", () => {
    expect(structuralApi).toContain("recordCommercialUsageEvent");
    expect(structuralApi).toContain('access_surface: "commercial_api"');
    expect(structuralApi).toContain("structural_observation_count");
    expect(structuralApi).toContain("response_sha256");
    expect(circleX402).toContain("recordCommercialPaymentEvent");
    expect(circleX402).toContain('environment: "testnet"');
    expect(circleX402).toContain('revenue_classification: "testnet_non_revenue"');
    expect(circleX402).toContain("commercial_revenue: false");
  });
});
