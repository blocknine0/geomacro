import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Day 3 D1/B2 serving migration", () => {
  it("derives GRO record hashes only from verified B2 readback", () => {
    const script = read("scripts/ops/d1-gro-index-backfill.ts");
    expect(script).toContain("await b2.get(archiveKey)");
    expect(script).toContain("verifyRiskObjectSignature(object, keys).valid");
    expect(script).toContain("canonicalRiskObjectJson(object)");
    expect(script).toContain('record_sha256_source: "canonical_verified_b2_readback"');
    expect(script).toContain("supabase_payload_used_for_record_hash: false");
    expect(script).toContain("archive_bundle_key IS NULL");
    expect(script).not.toContain('select("payload,');
    expect(script).not.toContain("delete(");
  });

  it("uses a bounded direct-Postgres migration export instead of restricted Supabase REST", () => {
    const script = read("scripts/ops/d1-gro-index-backfill.ts");
    const workflow = read(".github/workflows/d1-gro-index-backfill.yml");
    expect(script).toContain('process.env.SUPABASE_DB_URL');
    expect(script).toContain('execFileSync("psql"');
    expect(script).toContain('metadata_source: "direct_postgres_export"');
    expect(script).toContain("supabase_rest_used: false");
    expect(script).not.toContain('@supabase/supabase-js');
    expect(script).not.toContain("createClient(");
    expect(workflow).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    expect(workflow).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY:");
    expect(workflow).not.toContain("APP_SUPABASE_URL:");
  });

  it("batches D1 writes so verified GRO migrations cannot exceed process argument limits", () => {
    const script = read("scripts/ops/d1-gro-index-backfill.ts");
    const workflow = read(".github/workflows/d1-gro-index-backfill.yml");
    expect(script).toContain("const D1_WRITE_BATCH_SIZE = 12");
    expect(script).toContain("function executeD1Statements(statements: string[]): number");
    expect(script).toContain("offset += D1_WRITE_BATCH_SIZE");
    expect(script).toContain("statements.slice(offset, offset + D1_WRITE_BATCH_SIZE)");
    expect(script).toContain("const writeBatches = executeD1Statements(statements)");
    expect(script).not.toContain('"--command", statements.join("\\n")');
    expect(script).toContain("write_batches: writeBatches");
    expect(script).toContain("d1_write_batch_size: D1_WRITE_BATCH_SIZE");
    expect(workflow).toContain("p.write_batches");
    expect(workflow).toContain("p.d1_write_batch_size !== 12");
  });

  it("requires exact D1 checksum parity and remains non-destructive", () => {
    const workflow = read(".github/workflows/d1-gro-index-backfill.yml");
    expect(workflow).toContain("source_checksum !== p.target_checksum");
    expect(workflow).toContain("p.metadata_source !== 'direct_postgres_export'");
    expect(workflow).toContain("p.supabase_rest_used !== false");
    expect(workflow).toContain("p.destructive_changes !== false");
    expect(workflow).toContain("p.production_cutover !== false");
    expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(workflow).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
    expect(workflow).not.toContain("schedule:");
  });

  it("serves canonical country GROs from verified B2 before Supabase recovery", () => {
    const resolver = read("src/lib/country-gro-resolver.server.ts");
    const b2 = resolver.indexOf("readB2LatestCanonicalCountryGro(countryIso3, atOrBefore)");
    const recovery = resolver.indexOf("getLatestCompatibleCountryRiskObjectAtOrBefore(");
    expect(b2).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(-1);
    expect(b2).toBeLessThan(recovery);
  });

  it("uses the B2-only production risk reader for paid GRI preflight", () => {
    const reader = read("src/lib/production-global-risk.server.ts");
    const preflight = read("src/lib/testnet-intelligence-preflight.server.ts");
    expect(reader).toContain("readB2PublicRisk");
    expect(reader).not.toContain("getAppSupabase");
    expect(preflight).toContain('from "./production-global-risk.server"');
    expect(preflight).toContain("readProductionGlobalRisk()");
    expect(preflight).not.toContain('from "./global-risk-read.server"');
  });
});
