import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("GitHub Supabase Lovable hosting alignment", () => {
  it("keeps GitHub as source authority and external Supabase as database authority", () => {
    const health = read("src/routes/api.health.ts");
    const docs = read("docs/HOSTING_ALIGNMENT.md");

    expect(health).toContain("github-main-external-supabase-lovable-v1");
    expect(health).toContain('"ldpwajisioljyjtojvfx"');
    expect(docs).toContain("GitHub `main`");
    expect(docs).toContain("ldpwajisioljyjtojvfx");
    expect(docs).toContain("Publish changes");
  });

  it("does not let server operations fall back to browser Supabase configuration", () => {
    for (const path of [
      "scripts/diagnose-risk-object-event-window.ts",
      "scripts/diagnose-live-fragment-backlog.ts",
      "scripts/export-admitted-events-for-structure.mjs",
    ]) {
      const source = read(path);
      expect(source).not.toContain("VITE_SUPABASE_URL");
      expect(source).toContain("APP_SUPABASE_URL");
      expect(source).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});
