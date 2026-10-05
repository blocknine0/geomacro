import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram governed discovery-roots bridge", () => {
  it("exports only explicitly reviewed working non-Telegram roots", () => {
    const source = read("scripts/export-telegram-discovery-roots.mjs");
    expect(source).toContain('cert.endpoint_status !== "PASS"');
    expect(source).toContain('cert.endpoint_disposition !== "WORKING"');
    expect(source).toContain('cert.rights_status === "UNREVIEWED"');
    expect(source).toContain('.startsWith("telegram")');
    expect(source).toContain('new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"])');
    expect(source).toContain('auto_authorization: false');
    expect(source).toContain('auto_activation: false');
  });

  it("keeps the committed bridge snapshot sanitized, three-domain and discovery-only", () => {
    const payload = JSON.parse(read("config/telegram-discovery-roots.json"));
    expect(payload.schema).toBe("geomacro.telegram-governed-discovery-roots.v1");
    expect(payload.policy.discovery_only).toBe(true);
    expect(payload.policy.auto_authorization).toBe(false);
    expect(payload.policy.auto_activation).toBe(false);
    expect(payload.roots.length).toBeGreaterThan(0);

    const domains = new Set(payload.roots.map((row: any) => row.category));
    expect(domains).toEqual(new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]));
    for (const row of payload.roots) {
      expect(row.endpoint_status).toBe("PASS");
      expect(row.endpoint_disposition).toBe("WORKING");
      expect(row.rights_status).not.toBe("UNREVIEWED");
      expect(String(row.source_id).toLowerCase().startsWith("telegram")).toBe(false);
      expect(/^https?:\/\//.test(row.root_url)).toBe(true);
      expect(row.authentication_type).toBeUndefined();
      expect(row.credentials).toBeUndefined();
      expect(row.secret).toBeUndefined();
    }
  });

  it("audits production drift without auto-writing the snapshot", () => {
    const workflow = read(".github/workflows/telegram-discovery-roots-audit.yml");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("export-telegram-discovery-roots.mjs");
    expect(workflow).toContain("TELEGRAM_DISCOVERY_ROOT_SNAPSHOT_DRIFT");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
  });
});
