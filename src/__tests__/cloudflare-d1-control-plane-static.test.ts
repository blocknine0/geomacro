import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Cloudflare D1 permanent control plane", () => {
  it("keeps D1 bounded to hot metadata and B2 pointers", () => {
    const schema = read("workers/control-plane/migrations/0001_core.sql");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS source_state");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS country_domain_state");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS risk_object_index");
    expect(schema).toContain("archive_key TEXT NOT NULL");
    expect(schema).toContain("archive_sha256 TEXT NOT NULL");
    expect(schema).not.toMatch(/raw_payload\s+TEXT/i);
    expect(schema).not.toMatch(/evidence_payload\s+TEXT/i);
    expect(schema).not.toMatch(/signed_risk_object\s+TEXT/i);
  });

  it("exposes only a bounded derived current-intelligence overlay publicly", () => {
    const worker = read("workers/control-plane/src/index.mjs");
    expect(worker).toContain('PUBLIC_INTELLIGENCE_OVERLAY_KEY = "public_intelligence_live_observed_v1"');
    expect(worker).toContain('PUBLIC_INTELLIGENCE_OVERLAY_MAX_ROWS = 24');
    expect(worker).toContain('PUBLIC_INTELLIGENCE_OVERLAY_MAX_AGE_MS = 6 * 60 * 60 * 1000');
    expect(worker).toContain('url.pathname === "/v1/public/intelligence-overlay"');
    expect(worker).toContain('raw.public_status !== "live_observed"');
    expect(worker).toContain('raw.severity !== null');
    expect(worker).toContain('raw.delta !== null');
    expect(worker).toContain('value.raw_source_headlines_exposed !== false');
    expect(worker).toContain('value.provider_identity_exposed !== false');
  });

  it("fails closed when control-plane authentication or D1 is unavailable", () => {
    const worker = read("workers/control-plane/src/index.mjs");
    expect(worker).toContain("CONTROL_PLANE_AUTH_UNCONFIGURED");
    expect(worker).toContain("D1_BINDING_MISSING");
    expect(worker).toContain("D1_SCHEMA_NOT_READY");
    expect(worker).toContain("DURABLE_PAYLOAD_BELONGS_IN_B2");
    expect(worker).toContain('commerce_ledger: "durable_object"');
    expect(worker).toContain('durable_payload_store: "b2"');
  });

  it("does not require an always-on database subscription", () => {
    const docs = read("docs/PERMANENT_NEAR_ZERO_RUNTIME.md");
    expect(docs).toContain("fixed monthly infrastructure cost: `0 USD`");
    expect(docs).toContain("Workers Paid");
    expect(docs).toContain("No provider migration should be required");
    expect(docs).toContain("Never delete `storage.objects` through SQL");
  });
});
