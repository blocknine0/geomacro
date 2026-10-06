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
    expect(client).toContain('normalizedKey.includes("..")');
  });

  it("uses a versioned append-only pointer queue so bursts and edits cannot collapse to one checkpoint", () => {
    const migration = read("workers/control-plane/migrations/0006_telegram_signal_lead_queue.sql");
    expect(migration).toContain("create table if not exists telegram_signal_lead_queue");
    expect(migration).toContain("delivery_id text primary key");
    expect(migration).toContain("signal_id text not null");
    expect(migration).toContain("b2_object_key text not null unique");
    expect(migration).toContain("b2_sha256 text not null");
    expect(migration).toContain("trg_telegram_checkpoint_enqueue_insert");
    expect(migration).toContain("trg_telegram_checkpoint_enqueue_update");
    expect(migration).toContain("last_signal_id || '_' || substr(lower(new.last_b2_sha256), 1, 16)");
    expect(migration).not.toContain("raw_payload");
    expect(migration).not.toContain("message_body");
  });

  it("keeps D1 trigger migrations compatible with the remote statement splitter", () => {
    const migration = read("workers/control-plane/migrations/0006_telegram_signal_lead_queue.sql");
    const attributes = read(".gitattributes");
    expect((migration.match(/\nBEGIN\n/g) ?? []).length).toBe(2);
    expect(migration).not.toMatch(/\nbegin\n/);
    expect(migration).toContain("END;");
    expect(attributes).toContain("workers/control-plane/migrations/*.sql text eol=lf");
  });

  it("requires queue B2 hash verification before exposing a sanitized lead", () => {
    const drain = read("scripts/ops/drain-telegram-b2-leads.mjs");
    expect(drain).toContain('/^telegram\\/leads\\/\\d{4}\\/\\d{2}\\/\\d{2}\\/');
    expect(drain).toContain('allowedKeyPrefixes: ["telegram/leads/"]');
    expect(drain).toContain("TELEGRAM_B2_QUEUE_HASH_MISMATCH");
    expect(drain).toContain("TELEGRAM_QUEUE_DELIVERY_ID_MISMATCH");
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

  it("acknowledges an exact delivery only after canonical ingestion succeeds", () => {
    const workflow = read(".github/workflows/telegram-b2-d1-consumer.yml");
    expect(workflow).toContain("WHERE state='PENDING' ORDER BY created_at ASC, delivery_id ASC LIMIT 25");
    expect(workflow).toContain("CANONICAL_INGEST_IN_PROGRESS");
    expect(workflow).toContain("CANONICAL_INGEST_FAILED");
    expect(workflow).toContain("WHERE delivery_id='$delivery' AND state='PENDING'");
    expect(workflow).toContain("SET state='CONSUMED',consumed_at=datetime('now')");
    expect(workflow).toContain("DELETE FROM telegram_signal_lead_queue WHERE state='CONSUMED'");
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

  it("uses protocol-hash acceptance so non-protocol producer commits do not require repins", () => {
    const bridge = JSON.parse(read("config/telegram-private-signal-bridge.json"));
    const migration = read("workers/control-plane/migrations/0009_telegram_signal_protocol_v2.sql");
    expect(bridge.producer_acceptance).toBe("protocol_hash");
    expect(bridge.payload_schema).toBe("geomacro.telegram-lead-envelope.v2");
    expect(bridge.protocol_contract_sha256).toBe("6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9");
    expect(migration).toContain("6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9");
    expect(migration).toContain("telegram_signal_runtime_status");
  });
});
