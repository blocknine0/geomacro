import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram signal Supabase isolation contract", () => {
  it("keeps the dedicated signal project separate from production", () => {
    const workflow = read(".github/workflows/deploy-telegram-signal-supabase.yml");

    expect(workflow).toContain("qogpagklwbfdmrgnrhzi");
    expect(workflow).not.toContain("ldpwajisioljyjtojvfx");
    expect(workflow).toContain("TELEGRAM_SIGNAL_SUPABASE_PROJECT_ID");
    expect(workflow).toContain("SIGNAL_DB_MODE");
  });

  it("creates only raw/current signal storage and never enables commercial signals", () => {
    const migration = read(
      "supabase/migrations/950_telegram_signal_ingest_isolation.sql",
    );

    expect(migration).toContain("live_telegram_channel_registry");
    expect(migration).toContain("live_flash_events");
    expect(migration).toContain("live_flash_corroborations");
    expect(migration).toContain("enabled_for_commercial_signals");
    expect(migration).toContain("false");
    expect(migration).toContain("manual_review_status");
  });

  it("makes signal mode unable to query production structured intelligence", () => {
    const corroborate = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(corroborate).toContain('SIGNAL_DB_MODE');
    expect(corroborate).toContain('if (!SIGNAL_DB_MODE)');
  });

  it("keeps country inference fail-closed until controlled alignment", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");

    expect(ingest).toContain('if (SIGNAL_DB_MODE)');
    expect(ingest).toContain("return []");
  });

  it("points the worker example at the dedicated signal endpoint", () => {
    const env = read("workers/telegram-flash/.env.example");

    expect(env).toContain(
      "https://qogpagklwbfdmrgnrhzi.supabase.co/functions/v1/live-flash-ingest",
    );
    expect(env).toContain(
      "https://qogpagklwbfdmrgnrhzi.supabase.co/functions/v1/live-flash-corroborate",
    );
  });
});
