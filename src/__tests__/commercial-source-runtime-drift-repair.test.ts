import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261007093000_repair_commercial_source_alignment_runtime_drift.sql",
  "utf8",
);

describe("commercial source runtime drift repair", () => {
  it("fails GDACS ingestion closed until the complete certification contract is proven", () => {
    expect(migration).toContain("source_id = 'gdacs_global_disasters'");
    expect(migration).toContain("enabled_for_ingestion = false");
    expect(migration).toContain("cert.certification_state = 'CERTIFIED'");
    expect(migration).toContain("cert.runtime_status in ('PASS', 'NOT_APPLICABLE')");
    expect(migration).toContain("cert.fallback_status in ('READY', 'NOT_REQUIRED')");
  });

  it("records Telegram as the locked B2/D1 governed bridge without authorizing it", () => {
    expect(migration).toContain("b2://geomacro-private-archive/telegram/leads/");
    expect(migration).toContain("access_type = 'MIXED'");
    expect(migration).toContain("authentication_type = 'SIGNED_ENVELOPE_PROTOCOL_HASH'");
    expect(migration).toContain("commercial_usage_status = 'REVIEW_REQUIRED'");
    expect(migration).toContain("enabled_for_commercial_signals = false");
    expect(migration).toContain("when cert.certification_state = 'NOT_STARTED' then 'IN_REVIEW'");
    expect(migration).toContain("when cert.rights_status = 'UNREVIEWED' then 'REVIEW_REQUIRED'");
    expect(migration).toContain("enabled_for_ingestion = false");
  });

  it("does not fabricate direct commercial or publisher authorization", () => {
    expect(migration).not.toContain("enabled_for_commercial_signals = true");
    expect(migration).not.toContain("publisher_authorized = true");\n    expect(migration).not.toContain("sync_telegram_authorized_feed_source_state()");
    expect(migration).not.toContain("rights_status = 'COMMERCIAL_OK'");
  });
});
