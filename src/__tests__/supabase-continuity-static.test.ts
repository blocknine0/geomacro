import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase continuity contract", () => {
  it("bounds app Supabase calls and prevents retry storms", () => {
    const source = read("src/lib/supabase-app.server.ts");
    expect(source).toContain("APP_SUPABASE_REQUEST_TIMEOUT_MS = 8_000");
    expect(source).toContain("APP_SUPABASE_CIRCUIT_FAILURE_THRESHOLD = 3");
    expect(source).toContain("APP_SUPABASE_CIRCUIT_OPEN_MS = 30_000");
    expect(source).toContain("db: { retry: false }");
    expect(source).toContain("idempotentRead ? 2 : 1");
    expect(source).toContain("x-geomacro-degraded");
    expect(source).not.toContain("VITE_SUPABASE_");
  });

  it("keeps privileged risk writes fail-closed without automatic replay", () => {
    const source = read("src/lib/risk-supabase.server.ts");
    expect(source).toContain("RISK_SUPABASE_REQUEST_TIMEOUT_MS = 15_000");
    expect(source).toContain("RISK_SUPABASE_CIRCUIT_FAILURE_THRESHOLD = 3");
    expect(source).toContain("RISK_SUPABASE_CIRCUIT_OPEN_MS = 30_000");
    expect(source).toContain("db: { retry: false }");
    expect(source).toContain("risk-supabase-circuit-open");
    expect(source).not.toContain("APP_SUPABASE_ANON_KEY");
    expect(source).not.toContain("SUPABASE_ANON_KEY");
  });
});
