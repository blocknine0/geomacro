import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("./risk-supabase.server", () => ({
  requireRiskSupabase: () => ({
    rpc: storage.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: storage.maybeSingle }),
        }),
      }),
    }),
  }),
}));
import { ensureCommercialCreditAccount, CommercialAccessError } from "./commercial-access.server";

const principal = {
  principal_id: "00000000-0000-4000-8000-000000000001",
  principal_type: "api_client",
  principal_external_id: "example-client",
  key_id: "gmk_qualified_test",
  scopes: [],
};

describe("paid credit issuance boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); storage.maybeSingle.mockResolvedValue({ data: null, error: null }); });
  it.each(["starter_dev", "pro_analyst", "business_pilot"] as const)(
    "never grants free credits for %s from an ordinary API request", async tier => {
      await expect(ensureCommercialCreditAccount({ principal, tier }))
        .rejects.toMatchObject({ code: "PAYMENT_FUNDING_REQUIRED", status: 402 });
      expect(storage.rpc).not.toHaveBeenCalled();
    },
  );
  it("accepts an already settled matching paid account without rewriting its quota", async () => {
    storage.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "account-1", tier: "starter_dev", contract_version: "credits-v1.1.0",
        included_credits: 1000, credits_used: 75, status: "active",
        period_started_at: "2026-10-30T00:00:00Z",
        period_ends_at: "2099-11-30T00:00:00Z",
      }, error: null,
    });
    const result = await ensureCommercialCreditAccount({ principal, tier: "starter_dev" });
    expect(result).toMatchObject({ credits_remaining: 925, included_credits: 1000 });
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("requires a settled renewal after a paid period has expired", async () => {
    storage.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "account-1", tier: "pro_analyst", contract_version: "credits-v1.1.0",
        included_credits: 5000, credits_used: 100, status: "active",
        period_ends_at: "2020-01-01T00:00:00Z",
      }, error: null,
    });
    await expect(ensureCommercialCreditAccount({ principal, tier: "pro_analyst" }))
      .rejects.toMatchObject({ code: "CREDIT_PERIOD_EXPIRED", status: 402 });
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("rejects tier mismatch instead of promoting an old credit pool", async () => {
    storage.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "account-1", tier: "starter_dev", contract_version: "credits-v1.1.0",
        included_credits: 1000, credits_used: 1, status: "active",
        period_ends_at: "2099-11-30T00:00:00Z",
      }, error: null,
    });
    await expect(ensureCommercialCreditAccount({ principal, tier: "business_pilot" }))
      .rejects.toMatchObject({ code: "COMMERCIAL_CREDIT_ACCOUNT_MISMATCH", status: 403 });
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("preserves legacy pilot provisioning for existing contracted users", async () => {
    storage.rpc.mockResolvedValueOnce({ data: { account_id: "legacy-1" }, error: null });
    expect(await ensureCommercialCreditAccount({ principal, tier: "analyst_pilot" }))
      .toMatchObject({ account_id: "legacy-1" });
    expect(storage.rpc).toHaveBeenCalledWith("ensure_commercial_credit_account",
      expect.objectContaining({ p_tier: "analyst_pilot", p_period_days: 30 }));
  });
});
