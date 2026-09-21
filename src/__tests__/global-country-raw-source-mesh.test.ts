import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync("supabase/migrations/967_global_raw_source_coverage_mesh.sql","utf8");
const worker = fs.readFileSync("scripts/sync-country-raw-source-mesh.mjs","utf8");
const audit = fs.readFileSync("scripts/audit-global-raw-source-coverage.mjs","utf8");
const workflow = fs.readFileSync(".github/workflows/global-country-raw-source-mesh.yml","utf8");
const snapshot = fs.readFileSync("supabase/migrations/968_country_raw_web_snapshot_store.sql","utf8");

describe("global country raw source mesh",()=>{
  it("defines all three categories and a 195-country contract",()=>{
    for(const value of ["GEOPOLITICS","MACRO","CRITICAL_MINERALS","195","13","raw_source_coverage_100_complete"]){
      expect(migration).toContain(value);
    }
    expect(audit).toContain("canonicalIso3.length!==195");
    expect(audit).toContain("live_country_primary_source_directory");
    expect(audit).toContain("expected_total_targets:195*(3+4+6)");
    expect(audit).toContain("for(const iso of canonicalIso3) {");
  });

  it("keeps commercial promotion separate from raw capture",()=>{
    expect(migration).toContain("commercial_promotion_allowed boolean not null default false");
    expect(worker).toContain("country_raw_web_mesh");
    expect(snapshot).toContain("live_raw_source_snapshots");
  });

  it("uses country-aware global fallbacks",()=>{
    expect(worker).toContain("worldbank.org/v2/country/");
    expect(worker).toContain("api.gdeltproject.org/api/v2/doc/doc");
    expect(worker).toContain("sourcecountry:");
    expect(worker).toContain("const countryIso2=new Map");
    expect(worker).toContain("GEO:COVERAGE_FALLBACK:");
    expect(worker).toContain("MACRO:COVERAGE_FALLBACK:");
    expect(worker).toContain("MINERALS:COVERAGE_FALLBACK:");
    expect(worker).toContain("MESH_FILLER:");
  });

  it("runs every five minutes against authoritative production",()=>{
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).toContain("sync-country-raw-source-mesh.mjs");
    expect(workflow).toContain("live-structure-intelligence");
    expect(workflow.indexOf("Reconcile and capture country web/API sources")).toBeLessThan(
      workflow.indexOf("Verify 195-country three-category raw mesh"),
    );
  });

  it("self-heals missing directory targets without weakening commercial rights",()=>{
    expect(worker).toContain("commercial_promotion_allowed: false");
    expect(worker).toContain("live_country_primary_source_directory");
    expect(worker).toContain("Expected exactly 195 canonical countries from the government-portal baseline");
    expect(worker).toContain("inserted_targets");
  });

  it("keeps raw bytes private and hashed",()=>{
    expect(snapshot).toContain("content_sha256");
    expect(snapshot).toContain("storage_bucket");
    expect(snapshot).toContain("live_raw_source_snapshots");
    expect(worker).toContain('contentType:"application/gzip"');
  });
});
