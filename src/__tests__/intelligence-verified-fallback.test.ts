import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Intelligence verified fallback contract", () => {
  it("keeps a bounded verified B2 snapshot readable when the live database is unavailable", () => {
    const source = read("src/lib/b2-live.server.ts");

    expect(source).toContain("PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("keeps B2 as the public read fast path with Supabase only as a bounded fallback", () => {
    const source = read("src/lib/public-intelligence.functions.ts");

    expect(source).toContain("const b2Rows = await readB2PublicIntelligence()");
    expect(source).toContain("if (b2Rows?.length) return sortAndDedupe(b2Rows)");
    expect(source).toContain("return readPublicIntelligenceRowsFromSupabase()");
  });
});
