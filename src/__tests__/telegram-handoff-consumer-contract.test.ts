import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "workers/control-plane/migrations/0006_telegram_signal_handoff_queue.sql",
  "utf8",
);
const consumer = readFileSync(
  "scripts/ops/consume-telegram-signal-handoffs.mjs",
  "utf8",
);
const reader = readFileSync(
  "scripts/ops/telegram-b2-reader.mjs",
  "utf8",
);
const verifier = readFileSync("scripts/verify-telegram-lead-envelope.mjs", "utf8");

describe("Telegram B2 -> D1 -> canonical evidence handoff", () => {
  it("keeps a lossless compact main-owned queue instead of only a latest pointer", () => {
    expect(migration).toContain("telegram_signal_handoff_queue");
    expect(migration).toContain("trg_telegram_signal_checkpoint_enqueue_insert");
    expect(migration).toContain("trg_telegram_signal_checkpoint_enqueue_update");
    expect(migration).toContain("new.last_b2_sha256");
    expect(migration).toContain("new.last_b2_object_key");
    expect(migration).toContain("substr(new.last_b2_sha256, 1, 16)");
    expect(migration).not.toContain("headline");
    expect(migration).not.toContain("raw_payload");
    expect(migration).not.toContain("message_body");
  });

  it("reads only strict private Telegram B2 objects and verifies the queued hash", () => {
    expect(reader).toContain('const BUCKET = "geomacro-private-archive"');
    expect(reader).toContain('const ENDPOINT = "https://s3.us-east-005.backblazeb2.com"');
    expect(reader).toContain("telegram\\/leads\\/");
    expect(consumer).toContain("telegramB2Sha256(packed) !== row.objectHash");
    expect(consumer).toContain("TELEGRAM_B2_READBACK_HASH_MISMATCH");
    expect(consumer).toContain("gunzipSync");
    expect(consumer).toContain("maxOutputLength: 1_000_000");
  });

  it("uses direct PostgreSQL canonical tables without creating a Telegram truth DB", () => {
    expect(consumer).toContain('GRI_DB_MODE ?? ""');
    expect(consumer).toContain("TELEGRAM_HANDOFF_DIRECT_POSTGRES_REQUIRED");
    expect(consumer).toContain('from("live_flash_events")');
    expect(consumer).toContain('from("live_flash_event_versions")');
    expect(consumer).toContain('from("live_flash_event_countries")');
    expect(consumer).not.toContain("createClient(");
    expect(consumer).not.toContain("TELEGRAM_SCORE");
  });

  it("forces Telegram into the same fail-closed UNVERIFIED evidence semantics", () => {
    expect(consumer).toContain("verifyTelegramLeadEnvelope(envelope)");
    expect(consumer).toContain('verification_status: "UNVERIFIED"');
    expect(consumer).toContain("severity: null");
    expect(consumer).toContain("raw_payload: null");
    expect(verifier).toContain('input.verification_status !== "UNVERIFIED"');
    expect(verifier).toContain("TELEGRAM_PREPROMOTION_FORBIDDEN");
  });

  it("acks D1 only after B2 verification and canonical persistence succeed", () => {
    const readAt = consumer.indexOf("const packed = await b2.get(row.objectKey)");
    const persistAt = consumer.indexOf("await persistCanonicalLead(envelope)");
    const ackAt = consumer.indexOf("consumed.push(acknowledge(row, result))");
    expect(readAt).toBeGreaterThan(-1);
    expect(persistAt).toBeGreaterThan(readAt);
    expect(ackAt).toBeGreaterThan(persistAt);
    expect(consumer).toContain("WHERE handoff_id=${sqlText(row.handoffId)} AND status='PENDING'");
    expect(consumer).toContain("commercial_promotion_performed: false");
    expect(consumer).toContain("raw_telegram_persisted: false");
  });
});
