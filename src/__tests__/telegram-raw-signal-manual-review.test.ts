import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram automated global coverage contract", () => {
  it("does not require founder/operator approval for runtime admission", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");
    expect(ingest).toContain("auto_admission_status");
    expect(ingest).toContain('"ACTIVE"');
    expect(ingest).not.toContain('manual_review_status === "APPROVED"');
  });

  it("discovers public channels through Telegram global channel search", () => {
    const discovery = read("workers/telegram-flash/discover.py");
    expect(discovery).toContain("SearchGlobalRequest");
    expect(discovery).toContain("broadcasts_only=True");
    expect(discovery).toContain("UNVERIFIED_OWNERSHIP");
    expect(discovery).toContain("INTERNAL_RESEARCH_ONLY");
  });

  it("keeps Telegram evidence unverified until corroboration", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");
    expect(ingest).toMatch(
      /sourceId\s*===\s*"telegram_mtproto_flash"[\s\S]*?\?\s*"UNVERIFIED"/,
    );
  });

  it("covers isolated-signal automated admission", () => {
    const migration = read(
      "supabase/isolated-signal/migrations/954_telegram_automated_admission.sql",
    );
    expect(migration).toContain("auto_admission_status");
    expect(migration).toContain("ACTIVE");
    expect(migration).toContain("DEGRADED");
    expect(migration).toContain("QUARANTINED");
    expect(migration).toContain("Legacy compatibility field");
  });

  it("keeps the global discovery policy automated", () => {
    const matrix = JSON.parse(read("config/telegram-global-coverage-matrix.json"));
    expect(matrix.runtime_effect).toBe(false);
    expect(matrix.coverage_goal).toContain("Global geographic and linguistic coverage");
    expect(matrix.approval_policy).toMatch(/machine/i);
  });
});
