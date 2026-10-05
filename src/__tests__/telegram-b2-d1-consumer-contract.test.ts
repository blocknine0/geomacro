import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram B2/D1 governed consumer", () => {
  it("keeps the generic B2 client strict by default and allows only an explicit Telegram namespace override", () => {
    const client = read("scripts/ops/b2-s3-client.mjs");
    expect(client).toContain('DEFAULT_ALLOWED_PREFIXES = Object.freeze(["geomacro-evidence/v1/"])');
    expect(client).toContain('EXTRA_ALLOWED_PREFIXES = Object.freeze(new Set(["telegram/leads/"]))');
    expect(client).toContain("B2_ARCHIVE_PREFIX_CONFIG_INVALID");
    expect(client).toContain("allowedKeyPrefixes = null");
    expect(client).toContain("normalizedKey.includes(\"..\")");
  });

  it("requires checkpoint hash verification before exposing a sanitized lead", () => {
    const drain = read("scripts/ops/drain-telegram-b2-leads.mjs");
    expect(drain).toContain('/^telegram\\/leads\\/\\d{4}\\/\\d{2}\\/\\d{2}\\/');
    expect(drain).toContain('allowedKeyPrefixes: ["telegram/leads/"]');
    expect(drain).toContain("TELEGRAM_B2_CHECKPOINT_HASH_MISMATCH");
    expect(drain).toContain("gunzipSync");
    expect(drain).toContain("verifyTelegramLeadEnvelope(envelope)");
    expect(drain).toContain('verification_status: "UNVERIFIED"');
    expect(drain).toContain("commercial_eligible: false");
  });

  it("executes the canonical flash handler through direct PostgreSQL and preserves channel authorization identity", () => {
    const runner = read("scripts/run-live-flash-ingest-local.ts");
    expect(runner).toContain("LIVE_FLASH_LOCAL_REQUIRES_DIRECT_POSTGRES");
    expect(runner).toContain('createGriDbClient()');
    expect(runner).toContain("rewriteDenoEnvGets(source)");
    expect(runner).toContain('source_channel_key:\\n      cleanString(payload.source_channel_key, 64)');
    expect(runner).toContain("LOCAL_FLASH_CHANNEL_KEY_TRANSPORT_MISSING");
    expect(runner).toContain("local_canonical_source_direct_postgres");
  });

  it("uses main-owned D1 plus B2 and never calls Supabase Edge for the bridge", () => {
    const workflow = read(".github/workflows/telegram-b2-d1-consumer.yml");
    expect(workflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(workflow).toContain("B2_BUCKET: geomacro-private-archive");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("drain-telegram-b2-leads.mjs");
    expect(workflow).toContain("run-live-flash-ingest-local.ts");
    expect(workflow).not.toContain("supabase.co/functions/v1/live-flash-ingest");
  });

  it("pins the exact green private producer revision in bridge and D1", () => {
    const bridge = JSON.parse(read("config/telegram-private-signal-bridge.json"));
    const migration = read("workers/control-plane/migrations/0005_telegram_signal_producer_repin.sql");
    const accepted = "79fb75cf342a652216cff4355448012c5bab8cbf";
    expect(bridge.producer_commit).toBe(accepted);
    expect(migration).toContain(accepted);
    expect(migration).toContain("telegram_signal_runtime_status");
  });
});
