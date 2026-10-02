import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase standby production documentation contract", () => {
  it("keeps runtime, env example and hosting documentation aligned", () => {
    const runtime = read("src/lib/supabase-runtime-mode.server.ts");
    const env = read(".env.example");
    const docs = read("docs/HOSTING_ALIGNMENT.md");

    expect(runtime).toContain(
      'export type GeomacroSupabaseRuntimeMode = "primary" | "standby" | "standby_read"',
    );
    expect(runtime).toContain(
      'return env.NODE_ENV === "production" ? "standby" : "primary"',
    );
    expect(runtime).toContain(
      'return mode === "primary" || mode === "standby_read"',
    );
    expect(runtime).toContain(
      'return geomacroSupabaseRuntimeMode(env) === "primary"',
    );

    expect(env).toContain("GEOMACRO_SUPABASE_RUNTIME_MODE=standby");
    expect(env).toContain("Pinned Supabase recovery / ingestion project");
    expect(env).not.toContain(
      "Production database authority is the external Geomacro Supabase project",
    );

    expect(docs).toContain("## Supabase standby runtime contract");
    expect(docs).toContain("GEOMACRO_SUPABASE_RUNTIME_MODE=standby");
    expect(docs).toContain("B2 continuity during Supabase quota restriction");
    expect(docs).toContain("wrote_new_snapshot=false");
    expect(docs).toContain("freshness_advanced=false");
    expect(docs).not.toContain("is the production application database authority");
  });
});
