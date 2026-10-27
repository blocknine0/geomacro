import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Legacy Postgres workflows cannot become active simply because someone edits
// an unrelated source, a GRI workflow succeeds, or GitHub runs a daily cron.
// The canonical source discovery and B2/D1 product workflows remain separate.
const frozen = [
  ["source-evidence-graph-auto-promotion.yml", "production-source-alignment"],
  ["usgs-earthquake-hazards-sync.yml", "sync"],
  ["risk-indices-realtime-direct-postgres.yml", "publish-three-risk-indices"],
] as const;

describe("frozen legacy Supabase automation", () => {
  for (const [name, job] of frozen) {
    it(`${name} cannot trigger its Supabase job automatically or manually`, () => {
      const text = readFileSync(`.github/workflows/${name}`, "utf8");
      const events = text.slice(text.indexOf("\non:\n"), text.indexOf("\npermissions:"));
      expect(events).toContain("workflow_dispatch:");
      expect(events).not.toMatch(/^  (?:push|schedule|workflow_run|repository_dispatch):/m);
      const from = text.indexOf(`  ${job}:\n`);
      expect(from).toBeGreaterThan(-1);
      const guard = text.slice(from, from + 260);
      expect(guard).toContain("    if: ${{ false }}");
    });
  }

  it("permits only the pinned three-GET historical-only canary, never the old Postgres writer", () => {
    const workflow = readFileSync(".github/workflows/historical-data-connection.yml", "utf8");
    const probe = readFileSync("scripts/ops/historical-main-readback.mjs", "utf8");
    expect(workflow).toContain("Independent Supabase");
    expect(workflow).toContain("    needs: contract");
    expect(workflow).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain("HISTORICAL_SUPABASE_URL: https://nqvpcbnnvjsrlvyxxevk.supabase.co");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).not.toContain("global-intelligence/scripts/probe-historical-data.mjs");
    expect(probe).toContain('main_supabase_queries: 0');
    expect(probe).toContain('main_d1_queries: 0');
    expect(probe).toContain('b2_operations: 0');
    expect(probe).toContain('writes: 0');
    expect(probe).toContain('raw_records_emitted: 0');
    expect(probe).toContain('redirect: "error"');
    expect(probe).toContain('target.searchParams.set("limit", "1")');
    expect(probe).toContain('target.searchParams.set(column, filter)');
    expect(probe).not.toContain("POST");
  });

  it("preserves verification of USGS and independent Telegram source transport", () => {
    const usgs = readFileSync(".github/workflows/usgs-earthquake-hazards-sync.yml", "utf8");
    const telegram = readFileSync(".github/workflows/telegram-b2-d1-consumer.yml", "utf8");
    const official = readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml", "utf8");
    expect(usgs).toContain("  dry-run:");
    expect(usgs).toContain("  pull_request:");
    expect(telegram).toContain("Telegram B2 D1 Governed Consumer");
    expect(telegram).toContain("check-telegram-b2-d1-admission.mjs --stage budget");
    expect(official).toContain("schedule:");
  });
});
