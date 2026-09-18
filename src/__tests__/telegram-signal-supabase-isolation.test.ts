import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram signal Supabase isolation contract", () => {
  it("keeps the dedicated signal project separate from production", () => {
    const workflow = read(".github/workflows/deploy-telegram-signal-supabase.yml");

    expect(workflow).toContain("qogpagklwbfdmrgnrhzi");
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).not.toContain(
      "SUPABASE_PROJECT_ID: ldpwajisioljyjtojvfx",
    );
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

  it("uses compact fractional storage for the isolated signal hot index", () => {
    const migration = read(
      "supabase/migrations/951_telegram_signal_compact_storage.sql",
    );

    expect(migration).toContain("severity_bps smallint");
    expect(migration).toContain("source_reliability_bps smallint");
    expect(migration).toContain("verification_score_bps smallint");
    expect(migration).toContain("latitude_e6 integer");
    expect(migration).toContain("longitude_e6 integer");
    expect(migration).toContain("compression text not null default 'gzip'");
    expect(migration).toContain("live_signal_fragment_manifest");
    expect(migration).toContain("prevent_live_signal_fragment_mutation");
  });

  it("does not persist Telegram raw body or raw payload in signal mode", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");

    expect(ingest).toContain("body:\n      null");
    expect(ingest).toContain("raw_payload:\n      null");
    expect(ingest).toContain("severity_bps:");
    expect(ingest).toContain("source_reliability_bps:");
    expect(ingest).toContain("latitude_e6:");
    expect(ingest).toContain("longitude_e6:");
  });

  it("makes signal mode unable to query production structured intelligence", () => {
    const corroborate = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(corroborate).toContain("SIGNAL_DB_MODE");
    expect(corroborate).toContain("if (!SIGNAL_DB_MODE)");
  });

  it("keeps country inference fail-closed until controlled alignment", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");

    expect(ingest).toContain("if (SIGNAL_DB_MODE)");
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
