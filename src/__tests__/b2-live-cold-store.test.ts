import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 live and cold-store boundary", () => {
  it("keeps B2 credentials server-only and bounded", () => {
    const reader = read("src/lib/b2-live.server.ts");
    expect(reader).toContain('process.env.B2_KEY_ID');
    expect(reader).toContain('process.env.B2_APPLICATION_KEY');
    expect(reader).not.toContain('VITE_B2');
    expect(reader).toContain('REQUEST_TIMEOUT_MS = 3_500');
    expect(reader).toContain('CIRCUIT_OPEN_MS = 30_000');
  });

  it("serves Intelligence and verified Risk Indices from B2 before Supabase fallbacks", () => {
    const intelligence = read("src/lib/public-intelligence.functions.ts");
    const risk = read("src/lib/public-risk.functions.ts");
    expect(intelligence).toContain("readB2PublicIntelligence");
    expect(intelligence.indexOf("readB2PublicIntelligence"))
      .toBeLessThan(intelligence.lastIndexOf("readPublicIntelligenceRowsFromSupabase"));
    expect(risk).toContain("readB2PublicRisk");
    expect(risk).toContain('verificationStatus !== "verified"');
  });

  it("requires full B2 readback before cold source deletion", () => {
    const events = read("scripts/ops/b2-archive-structured-events.mjs");
    const observations = read("scripts/ops/b2-archive-observation-rows.mjs");
    for (const source of [events, observations]) {
      expect(source).toContain("await b2.put");
      expect(source).toContain("await b2.get");
      expect(source.indexOf("await b2.get")).toBeLessThan(source.indexOf("delete_verified_cold"));
    }
  });

  it("keeps the maintenance cadence bounded and serialized", () => {
    const workflow = read(".github/workflows/b2-cold-row-maintenance.yml");
    expect(workflow).toContain('cron: "11 */6 * * *"');
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("B2_COLD_EVENT_LIMIT: \"100\"");
    expect(workflow).toContain("B2_COLD_OBSERVATION_LIMIT: \"100\"");
  });
});
