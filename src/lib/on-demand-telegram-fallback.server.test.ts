import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupTelegramFallback } from "./on-demand-telegram-fallback.server";

const input = { country_iso3: "IND", categories: ["macro"] as const,
  originalArticleEvidenceSufficient: false };
const url = "https://private-reader.example.org/v1/private/telegram/lookup";

describe("on-demand Telegram research fallback", () => {
  beforeEach(() => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", "");
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never makes a Telegram request if no private reader is configured", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupTelegramFallback(input)).toMatchObject({
      attempted: false, status: "NOT_CONFIGURED", chargeable: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips retrieval when existing original evidence is sufficient", async () => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", url);
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "test-token");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupTelegramFallback({
      ...input, originalArticleEvidenceSufficient: true,
    })).toMatchObject({ attempted: false, status: "NOT_NEEDED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a minimal fixed-term private request and counts-only response", async () => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", url);
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "test-token");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: "geomacro.private-telegram-query-receipt.v1",
      authorization_checked: true, source_text_retained: false,
      commercial_eligible: false, searched_channel_count: 2,
      unverified_lead_count: 4,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const output = await lookupTelegramFallback(input);
    expect(output).toEqual({
      attempted: true, status: "UNVERIFIED_LEADS",
      searched_channel_count: 2, unverified_lead_count: 4,
      verified_intelligence_created: false, chargeable: false,
    });
    const [, options] = fetcher.mock.calls[0];
    expect(JSON.parse(String(options.body))).toEqual({
      schema: "geomacro.private-telegram-query.v1",
      country_iso3: "IND", categories: ["macro"],
      max_channels: 3, max_messages_per_channel: 20, max_hours: 6,
    });
    expect(String(options.body)).not.toContain("question");
  });

  it("rejects reader replies containing unexpected raw content or verified claims", async () => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", url);
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: "geomacro.private-telegram-query-receipt.v1",
      authorization_checked: true, source_text_retained: false,
      commercial_eligible: false, searched_channel_count: 1,
      unverified_lead_count: 1, message: "untrusted post text",
    }), { headers: { "content-type": "application/json" } })));
    expect(await lookupTelegramFallback(input)).toMatchObject({
      status: "UNAVAILABLE", chargeable: false,
    });
  });

  it("does not use insecure or localhost bridge addresses", async () => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "test-token");
    for (const blocked of [
      "http://private-reader.example.org/v1/private/telegram/lookup",
      "https://127.0.0.1/v1/private/telegram/lookup",
      "https://localhost/v1/private/telegram/lookup",
    ]) {
      vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", blocked);
      expect((await lookupTelegramFallback(input)).status).toBe("NOT_CONFIGURED");
    }
  });

  it("cannot charge when the remote reader fails", async () => {
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_URL", url);
    vi.stubEnv("GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await lookupTelegramFallback(input)).toMatchObject({
      attempted: true, status: "UNAVAILABLE",
      verified_intelligence_created: false, chargeable: false,
    });
  });
});
