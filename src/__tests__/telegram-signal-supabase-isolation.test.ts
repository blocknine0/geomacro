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
    expect(migration).toContain("geomacro-telegram-signal");
    expect(migration).toContain("storage.buckets");
    expect(migration).toContain("storage_bucket text not null default 'geomacro-telegram-signal'");
    expect(migration).toContain("compression text not null default 'gzip'");
    expect(migration).toContain("live_signal_fragment_manifest");
    expect(migration).toContain("prevent_live_signal_fragment_mutation");
  });

  it("keeps additional Telegram coverage candidates disabled until manual approval", () => {
    const migration = read("supabase/migrations/954_telegram_coverage_candidates.sql");
    expect(migration).toContain("'bricsnews'");
    expect(migration).toContain("'uztmk_official'");
    expect(migration).toContain("'INTERNAL_RESEARCH_ONLY'");
    expect(migration).toContain("enabled,");
    expect(migration).toContain("false,");
    expect(migration).toContain("pending manual approval");
  });
  it("defines a canonical event-family lifecycle and material-update ledger", () => {
    const lifecycle = read(
      "supabase/migrations/952_realtime_flash_event_lifecycle.sql",
    );
    const familyVersions = read(
      "supabase/migrations/953_event_family_version_ledger.sql",
    );
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");
    const corroborate = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(lifecycle).toContain("signal_category text not null default 'UNCLASSIFIED'");
    expect(lifecycle).toContain("source_version integer not null default 1");
    expect(lifecycle).toContain("material_update boolean not null default false");
    expect(lifecycle).toContain("live_flash_event_families");
    expect(lifecycle).toContain("live_flash_event_family_members");
    expect(lifecycle).toContain("live_flash_event_versions");
    expect(familyVersions).toContain("live_flash_event_family_versions");
    expect(familyVersions).toContain("unique (family_id, version)");
    const latency = read("supabase/migrations/955_realtime_detection_latency.sql");
    expect(latency).toContain("source_updated_at_utc timestamptz");
    expect(latency).toContain("detection_latency_ms bigint");
    expect(latency).toContain("detection_latency_ms >= 0");
    expect(ingest).toContain("const sourceUpdatedAtUtc");
    expect(ingest).toContain("const detectionLatencyMs");
    expect(archive).toContain("detection_latency_ms");
    expect(ingest).toContain("const signalCategory = classifySignalCategory(");
    expect(ingest).toContain("const existingResult =");
    expect(ingest).toContain("live_flash_event_versions");
    expect(corroborate).toContain("live_flash_event_families");
    expect(corroborate).toContain("live_flash_event_family_versions");
  });

  it("keeps the compact archive aligned with the actual flash primary key", () => {
    const archive = read("supabase/functions/live-flash-archive/index.ts");

    expect(archive).toContain("select(\"flash_id,source_record_id");
    expect(archive).toContain("flash_id: event.flash_id");
    expect(archive).toContain(".in(\"flash_id\", ids)");
    expect(archive).not.toContain("event.id");
    expect(archive).not.toContain("source_channel_key: event.source_channel_key");
    expect(archive).toContain("telegram-flash|${periodStart}|${periodEnd}");
    expect(archive).not.toContain("\\${periodStart}");
  });
  it("archives compact signal records as private gzip evidence with readback verification", () => {
    const archive = read("supabase/functions/live-flash-archive/index.ts");

    expect(archive).toContain("CompressionStream(\"gzip\")");
    expect(archive).toContain("geomacro-telegram-signal");
    expect(archive).toContain("payload_sha256");
    expect(archive).toContain("compressed_sha256");
    expect(archive).toContain("archive_readback_sha_mismatch");
    expect(archive).toContain("archived_fragment_id");
    expect(archive).toContain("archived_at");
    expect(archive).not.toContain("raw_payload");
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
