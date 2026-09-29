import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase pause public-read resilience", () => {
  it("serves public event detail from B2 before consulting Supabase", () => {
    const source = read("src/lib/public-event.functions.ts");
    expect(source).toContain('readB2PublicIntelligence');
    expect(source.indexOf("const b2Rows = await readB2PublicIntelligence()"))
      .toBeLessThan(source.indexOf("const supabase = getAppSupabase()"));
    expect(source).toContain("if (!supabase) return null;");
  });

  it("serves event SEO metadata from B2 before consulting Supabase", () => {
    const source = read("src/lib/public-event-seo.functions.ts");
    expect(source).toContain('readB2PublicIntelligence');
    expect(source.indexOf("const b2Rows = await readB2PublicIntelligence()"))
      .toBeLessThan(source.indexOf("const supabase = getAppSupabase()"));
    expect(source).toContain("if (!supabase) return null;");
  });

  it("uses B2 as the permanent Ask reader before the optional Supabase fallback", () => {
    const source = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(source).toContain('readB2PublicIntelligence');
    expect(source.indexOf("const b2Rows = b2StoredRows(await readB2PublicIntelligence())"))
      .toBeLessThan(source.indexOf("const db = getAppSupabase()"));
    expect(source).toContain("if (!db) return { sufficient: false, data: null };");
  });

  it("keeps fresh Ask queries on the ephemeral live path instead of forcing stored data", () => {
    const source = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(source).toContain("forceLive: FRESHNESS_RE.test(question)");
    expect(source).toContain("durable_live_storage_write: false");
  });
});
