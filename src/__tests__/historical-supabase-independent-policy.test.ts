import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  historicalSupabaseReadMode,
  historicalSupabaseReadFallbackAllowed,
} from "../lib/historical-supabase-read-mode.server";

describe("independent historical Supabase policy", () => {
  it("defaults to off without depending on main Supabase mode", () => {
    expect(historicalSupabaseReadMode({ NODE_ENV: "production", GEOMACRO_SUPABASE_RUNTIME_MODE: "primary" })).toBe("off");
    expect(historicalSupabaseReadFallbackAllowed({ NODE_ENV: "production", GEOMACRO_SUPABASE_RUNTIME_MODE: "standby_read" })).toBe(false);
  });

  it("allows explicit historical fallback even while main Supabase is standby", () => {
    const env = {
      NODE_ENV: "production",
      GEOMACRO_SUPABASE_RUNTIME_MODE: "standby",
      GEOMACRO_HISTORICAL_SUPABASE_READ_MODE: "fallback",
    };
    expect(historicalSupabaseReadFallbackAllowed(env)).toBe(true);
  });

  it("keeps the historical warehouse off when main Supabase is primary", () => {
    expect(historicalSupabaseReadFallbackAllowed({
      GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
      GEOMACRO_HISTORICAL_SUPABASE_READ_MODE: "off",
    })).toBe(false);
  });

  it("rejects misconfigured policies instead of silently enabling queries", () => {
    expect(() => historicalSupabaseReadMode({
      GEOMACRO_HISTORICAL_SUPABASE_READ_MODE: "primary",
    })).toThrow(/must be off or fallback/);
  });

  it("uses independent gating and B2-first reads in structural context", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/structural-context.server.ts"), "utf8");
    expect(source).toContain("historicalSupabaseReadFallbackAllowed()");
    expect(source).not.toContain("supabaseReadFallbackAllowed()");
    expect(source).toContain('if (b2Continuity?.status === "AVAILABLE") return b2Continuity;');
    expect(source.indexOf("const b2Continuity = db ? await loadB2StructuralContext(subject) : null;"))
      .toBeLessThan(source.indexOf('if (subject.type === "country") {\n      const result = await fetchCountryProfile(db'));
  });
});
