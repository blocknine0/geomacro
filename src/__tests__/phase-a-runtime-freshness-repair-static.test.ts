import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repair = readFileSync("scripts/ops/phase-a-runtime-freshness-repair.mjs", "utf8");
const workflow = readFileSync(".github/workflows/phase-a-runtime-freshness-repair.yml", "utf8");

describe("Phase A runtime freshness repair", () => {
  it("uses direct Postgres and B2 instead of Supabase REST or Storage", () => {
    expect(repair).toContain('const DB_URL = String(process.env.SUPABASE_DB_URL');
    expect(repair).toContain('import { createB2Client } from "./b2-s3-client.mjs"');
    expect(repair).toContain('execFileAsync("psql"');
    expect(repair).not.toContain("@supabase/supabase-js");
    expect(repair).not.toContain("createClient(");
    expect(repair).not.toContain(".storage.");
  });

  it("derives the country denominator from the enabled canonical registry", () => {
    expect(repair).toContain("from public.live_country_registry where enabled=true order by iso3");
    expect(repair).toContain("const expected = countries.length * 3");
    expect(repair).not.toMatch(/\b(?:194|195|585)\b/);
    expect(workflow).not.toMatch(/\b(?:194|195|585)\b/);
  });

  it("binds the three fallback domains to reviewed exact source contracts", () => {
    expect(repair).toContain('source_id: "gdelt_v2_events"');
    expect(repair).toContain('source_id: "world_bank_indicators"');
    expect(repair).toContain('source_id: "usgs_mcs"');
    expect(repair).not.toContain('source_id: "gdelt_v2",');
    expect(repair).toContain("COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[sourceId]");
  });

  it("requires source probes and B2 readback before evidence promotion and set-based freshness writes", () => {
    const probe = repair.indexOf("await fetchObserved(source.endpoint");
    const b2Put = repair.indexOf("await b2.put(key, payload)");
    const b2Readback = repair.indexOf("const readback = await b2.get(key)");
    const promotion = repair.indexOf("const certifications = await promote(runId, observed, evidenceRef)");
    const targetWrite = repair.indexOf("const targetRowsWritten = await refreshTargets(observed)");
    expect(probe).toBeGreaterThan(-1);
    expect(b2Put).toBeGreaterThan(probe);
    expect(b2Readback).toBeGreaterThan(b2Put);
    expect(promotion).toBeGreaterThan(b2Readback);
    expect(targetWrite).toBeGreaterThan(promotion);
  });

  it("uses a set-based registry x source-contract upsert instead of a giant client-side values list", () => {
    expect(repair).toContain("from public.live_country_registry r cross join source_contract s where r.enabled=true");
    expect(repair).toContain("on conflict(target_id) do update set");
    expect(repair).not.toContain("rows.map((row)");
  });

  it("promotes through the evidence graph instead of directly certifying records", () => {
    expect(repair).toContain("promote_source_certification_evidence_graph_run");
    for (const dimension of ["REGISTRY", "ENDPOINT", "RIGHTS", "SCHEMA", "FRESHNESS", "PROVENANCE", "INDEPENDENCE", "ADAPTER", "RUNTIME", "FALLBACK"]) {
      expect(repair).toContain(`\"${dimension}\"`);
    }
    expect(repair).not.toContain("update public.live_source_certification_records");
  });

  it("requires the pgcrypto promotion repair and never activates payment", () => {
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("20261002093748_fix_source_certification_promotion_pgcrypto_path.sql");
    expect(workflow).toContain("search_path=public, extensions");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(repair).toContain("payment_or_settlement_enabled: false");
    expect(repair).not.toMatch(/mainnet.*(?:enable|activate)/i);
  });

  it("fails unless every registry x domain cell is genuinely READY", () => {
    expect(repair).toContain("Number(status.production_ready_rows) !== expected");
    expect(repair).toContain("Number(status.unavailable_rows) !== 0");
    expect(repair).toContain("targetRowsWritten !== expected");
    expect(workflow).toContain('test "$ready" = "$expected"');
    expect(workflow).toContain('test "$unavailable" = "0"');
  });
});
