import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Telegram raw-signal manual-review contract", () => {
  it("keeps every Telegram source behind explicit database approval", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");

    expect(ingest).toContain('from("live_telegram_channel_registry")');
    expect(ingest).toContain("manual_review_status");
    expect(ingest).toContain('"APPROVED"');
    expect(ingest).toContain('"telegram_channel_not_approved"');
    expect(ingest).toContain('"telegram_public_channel_key_required"');
    expect(ingest).toContain('"telegram_public_source_url_required"');
  });

  it("forces Telegram evidence to enter as unverified", () => {
    const ingest = read("supabase/functions/live-flash-ingest/index.ts");

    expect(ingest).toMatch(
      /sourceId\s*===\s*"telegram_mtproto_flash"[\s\S]*?\?\s*"UNVERIFIED"/,
    );
  });

  it("requires a public Telegram username at the worker boundary", () => {
    const worker = read("workers/telegram-flash/worker.py");

    expect(worker).toContain('"source_channel_key": key');
    expect(worker).toContain(
      "Telegram raw-signal source must be a public channel with a username",
    );
    expect(worker).toContain(
      "Configured Telegram source {channel!r} is not a public username channel",
    );
  });

  it("resets historical starter channels to pending and disabled", () => {
    const migration = read(
      "supabase/migrations/946_telegram_manual_review_gate.sql",
    );

    expect(migration).toContain("manual_review_status = 'PENDING'");
    expect(migration).toContain("enabled = false");
    expect(migration).toContain(
      "manual_review_status=APPROVED plus enabled=true",
    );
  });

  it("ships with Telegram disabled and no default channel list", () => {
    const env = read("workers/telegram-flash/.env.example");

    expect(env).toContain("TELEGRAM_ENABLED=false");
    expect(env).toContain("TELEGRAM_CHANNELS=");
    expect(env).toContain("TELEGRAM_SOURCE_RELIABILITY_JSON={}");
    expect(env).not.toContain(
      "TELEGRAM_CHANNELS=@liveuamap,@FinancialJuice,@ReutersWorldChannel",
    );
  });

  it("keeps the global coverage matrix discovery-only and fail-closed", () => {
    const matrix = JSON.parse(read("config/telegram-global-coverage-matrix.json"));

    expect(matrix.schema_version).toBe("geomacro.telegram.global-coverage.v1");
    expect(matrix.runtime_effect).toBe(false);
    expect(matrix.approval_policy).toContain("PENDING");
    expect(matrix.coverage_goal).toContain("Global geographic and linguistic coverage");

    expect(matrix.regions.length).toBeGreaterThanOrEqual(13);
    expect(matrix.regions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "north_america" }),
        expect.objectContaining({ id: "latin_america_caribbean" }),
        expect.objectContaining({ id: "eastern_europe_balkans" }),
        expect.objectContaining({ id: "middle_east" }),
        expect.objectContaining({ id: "africa" }),
        expect.objectContaining({ id: "south_asia" }),
        expect.objectContaining({ id: "east_asia" }),
        expect.objectContaining({ id: "southeast_asia" }),
        expect.objectContaining({ id: "central_asia_caucasus" }),
        expect.objectContaining({ id: "oceania_pacific" }),
      ]),
    );

    for (const candidate of matrix.reviewed_candidates) {
      expect(["PENDING", "HOLD"]).toContain(candidate.status);
      expect(candidate.rights).toBe("INTERNAL_RESEARCH_ONLY");
    }

    expect(matrix.reviewed_candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: "@ReutersWorldChannel",
          status: "HOLD",
        }),
        expect.objectContaining({
          handle: "@bbcworld",
          status: "HOLD",
        }),
      ]),
    );
  });
});
