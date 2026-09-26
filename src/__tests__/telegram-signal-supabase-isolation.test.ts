import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram signal Supabase isolation contract", () => {
  it("keeps the dedicated signal project separate from production", () => {
    const workflow = read(".github/workflows/deploy-telegram-signal-supabase.yml");
    const helper = read("scripts/prepare-telegram-isolated-migration-workdir.mjs");

    expect(workflow).toContain("qogpagklwbfdmrgnrhzi");
    expect(workflow).not.toContain(
      "SUPABASE_PROJECT_ID: ldpwajisioljyjtojvfx",
    );
    expect(workflow).toContain("TELEGRAM_SIGNAL_SUPABASE_PROJECT_ID");
    expect(workflow).toContain("SIGNAL_DB_MODE");
    expect(workflow).toContain("ISOLATED_WORKDIR=/tmp/geomacro-signal-supabase");
    expect(workflow).toContain("prepare-telegram-isolated-migration-workdir.mjs");
    expect(helper).toContain("[0, 54]");
    expect(helper).toContain("[900, 951]");
    expect(helper).toContain("production migrations 952+ are never copied");
    expect(workflow).not.toContain("supabase migration repair");
  });

  it("uses collision-free isolated migration versions", () => {
    const workflow = read(".github/workflows/deploy-telegram-signal-supabase.yml");

    expect(workflow).toContain("980_telegram_signal_ingest_isolation.sql");
    expect(workflow).toContain("984_telegram_authorized_publisher_only.sql");
    expect(workflow).toContain("985_breaking_feed_registry_parity.sql");
    expect(workflow).not.toContain("950_telegram_signal_ingest_isolation.sql");
    expect(workflow).not.toContain("954_telegram_authorized_publisher_only.sql");
  });

  it("creates only raw/current signal storage and never enables commercial signals", () => {
    const migration = read(
      "supabase/isolated-signal/migrations/980_telegram_signal_ingest_isolation.sql",
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
      "supabase/isolated-signal/migrations/981_telegram_signal_compact_storage.sql",
    );

    expect(migration).toContain("severity_bps smallint");
    expect(migration).toContain("source_reliability_bps smallint");
    expect(migration).toContain("verification_score_bps smallint");
    expect(migration).toContain("latitude_e6 integer");
    expect(migration).toContain("longitude_e6 integer");
    expect(migration).toContain("geomacro-telegram-signal");
    expect(migration).toContain("storage.buckets");
    expect(migration).toContain("live_signal_fragment_manifest");
  });

  it("defines a canonical event-family lifecycle and material-update ledger", () => {
    const lifecycle = read(
      "supabase/isolated-signal/migrations/982_realtime_flash_event_lifecycle.sql",
    );
    const familyVersions = read(
      "supabase/isolated-signal/migrations/983_event_family_version_ledger.sql",
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
    expect(ingest).toContain("const signalCategory = classifySignalCategory(");
    expect(ingest).toContain("live_flash_event_versions");
    expect(corroborate).toContain("live_flash_event_families");
    expect(corroborate).toContain("live_flash_event_family_versions");
  });

  it("keeps public Telegram MTProto disabled in every production runtime path", () => {
    const entrypoint = read("workers/telegram-flash/production_entrypoint.py");
    const rssCycle = read("scripts/run-rss-live-cycle.mjs");
    const discovery = read("workers/telegram-flash/global_discovery.py");
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");
    const authorized = read(
      "supabase/isolated-signal/migrations/984_telegram_authorized_publisher_only.sql",
    );

    expect(entrypoint).toContain('os.environ["TELEGRAM_ENABLED"] = "false"');
    expect(entrypoint).toContain('os.environ["TELEGRAM_CHANNELS"] = ""');
    expect(rssCycle).toContain('TELEGRAM_ENABLED: "false"');
    expect(rssCycle).toContain('TELEGRAM_CHANNELS: ""');
    expect(discovery).toContain('"status": "DISABLED_BY_POLICY"');
    expect(discovery).not.toContain("TelegramClient");
    expect(orchestrator).toContain('key: "telegram_discovery"');
    expect(orchestrator).toContain('requiredEnv: []');
    expect(authorized).toContain("telegram_mtproto_flash");
    expect(authorized).toContain("commercial_usage_status = 'BLOCKED'");
    expect(authorized).toContain("telegram_authorized_publisher_feed");
    expect(authorized).toContain("publisher_authorized");
  });

  it("runs NWS active alerts as a 60-second normalized lead feed", () => {
    const nws = read("workers/telegram-flash/nws_alerts_loop.py");
    const supervisor = read("workers/telegram-flash/supervisor.py");
    const dockerfile = read("workers/telegram-flash/Dockerfile");
    const registry = read(
      "supabase/isolated-signal/migrations/985_breaking_feed_registry_parity.sql",
    );

    expect(nws).toContain("https://api.weather.gov/alerts/active.atom");
    expect(nws).toContain('"NWS_ALERTS_POLL_SECONDS", "60"');
    expect(nws).toContain('"source_id": "nws_active_alerts_atom"');
    expect(nws).toContain('"body": None');
    expect(nws).toContain('"raw_payload": None');
    expect(nws).toContain('"verification_status": "UNVERIFIED"');
    expect(supervisor).toContain('("nws-alerts", sys.executable, "nws_alerts_loop.py")');
    expect(dockerfile).toContain("COPY nws_alerts_loop.py ./");
    expect(registry).toContain("'nws_active_alerts_atom'");
    expect(registry).toContain("'https://api.weather.gov/alerts/active.atom'");
    expect(registry).toContain("enabled_for_commercial_signals = false");
  });

  it("does not persist raw body or raw payload in signal mode", () => {
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
    expect(env).toContain("NWS_ALERTS_POLL_SECONDS=60");
  });
});
