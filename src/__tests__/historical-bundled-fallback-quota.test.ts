import { describe, expect, it, vi } from "vitest";
import { quotaGuardedHistoricalFetch } from "../lib/historical-supabase-fetch.server";
import { historicalSupabaseReadMode } from "../lib/historical-supabase-read-mode.server";

const project = "https://nqvpcbnnvjsrlvyxxevk.supabase.co";
const canary = project + "/rest/v1/commercial_structural_country_profiles?country_iso3=eq.USA&limit=1";

describe("historical Supabase website fallback uses shared atomic central quota", () => {
  it("only activates automatically if production has isolated historical and D1 budget credentials", () => {
    expect(historicalSupabaseReadMode({ NODE_ENV: "production",
      HISTORICAL_SUPABASE_URL: project,
      HISTORICAL_SUPABASE_SERVICE_ROLE_KEY: "fixture",
      GEOMACRO_COMMERCE_LEDGER_TOKEN: "x".repeat(40),
      GEOMACRO_SUPABASE_RUNTIME_MODE: "standby" })).toBe("fallback");
    expect(historicalSupabaseReadMode({ NODE_ENV: "production",
      HISTORICAL_SUPABASE_URL: project,
      HISTORICAL_SUPABASE_SERVICE_ROLE_KEY: "fixture" })).toBe("off");
    expect(historicalSupabaseReadMode({ NODE_ENV: "production",
      HISTORICAL_SUPABASE_URL: project,
      HISTORICAL_SUPABASE_SERVICE_ROLE_KEY: "fixture",
      GEOMACRO_COMMERCE_LEDGER_TOKEN: "x".repeat(40),
      GEOMACRO_HISTORICAL_SUPABASE_READ_MODE: "off" })).toBe("off");
  });
  it("requires one central reservation per actual historical REST GET", async () => {
    const reserve = vi.fn(async (route, key) => {
      expect(route).toBe("historical_supabase_fallback");
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      return { allowed: true, retry_after_seconds: 1 };
    });
    const fetcher = vi.fn(async () => new Response("[]", { status: 200 }));
    await quotaGuardedHistoricalFetch(canary, undefined, {
      reserve: reserve as never, fetcher: fetcher as never,
    });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
  });
  it("never calls historical Supabase if global quota is denied", async () => {
    const fetcher = vi.fn();
    await expect(quotaGuardedHistoricalFetch(canary, undefined, {
      reserve: (async () => ({ allowed: false, retry_after_seconds: 10 })) as never,
      fetcher: fetcher as never,
    })).rejects.toThrow("HISTORICAL_FALLBACK_CENTRAL_D1_BUDGET_HELD");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects wrong Supabase, writes and browser-unrelated destinations", async () => {
    const reserve = vi.fn();
    const fetcher = vi.fn();
    for (const [url, init] of [
      ["https://ldpwajisioljyjtojvfx.supabase.co/rest/v1/example", undefined],
      ["https://evil.example/rest/v1/example", undefined],
      [project + "/auth/v1/user", undefined],
      [canary, { method: "POST" }],
    ] as const) {
      await expect(quotaGuardedHistoricalFetch(url, init as RequestInit, {
        reserve: reserve as never, fetcher: fetcher as never,
      })).rejects.toThrow("HISTORICAL_FALLBACK_PINNED_READ_ONLY_REQUIRED");
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
