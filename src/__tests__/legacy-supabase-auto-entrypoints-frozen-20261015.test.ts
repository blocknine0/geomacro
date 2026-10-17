import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Legacy Postgres workflows cannot become active simply because someone edits
// an unrelated source, a GRI workflow succeeds, or GitHub runs a daily cron.
// The canonical source discovery and B2/D1 product workflows remain separate.
const frozen = [
  ["source-evidence-graph-auto-promotion.yml", "production-source-alignment"],
  ["historical-data-connection.yml", "probe"],
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
