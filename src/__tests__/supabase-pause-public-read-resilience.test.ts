import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase pause public-read resilience", () => {
  it("serves public event detail from B2 only", () => {
    const source = read("src/lib/public-event.functions.ts");
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).not.toContain("getAppSupabase");
    expect(source).not.toContain("supabase.co");
  });

  it("serves event SEO metadata from B2 only", () => {
    const source = read("src/lib/public-event-seo.functions.ts");
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).not.toContain("getAppSupabase");
    expect(source).not.toContain("supabase.co");
  });

  it("keeps the Ask permanent reader B2-only", () => {
    const source = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(source).toContain("readB2PublicIntelligence");
    expect(source).toContain("readB2PublicRisk");
    expect(source).toContain("Production permanent reads are B2-only");
    expect(source).not.toContain("getAppSupabase");
    expect(source).not.toContain('.from("events")');
  });

  it("requires fresh B2 evidence before freshness-sensitive Ask queries avoid live retrieval", () => {
    const source = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(source).toContain("freshnessMaxAgeHours");
    expect(source).toContain("forceLive: false");
    expect(source).toContain("stale\n  // evidence falls through to bounded ephemeral retrieval instead");
    expect(source).toContain("durable_live_storage_write: false");
  });
});
