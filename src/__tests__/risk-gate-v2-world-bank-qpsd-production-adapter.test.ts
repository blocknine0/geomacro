import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRiskSupabase: vi.fn(),
}));

vi.mock("../lib/risk-supabase.server", () => ({
  requireRiskSupabase: mocks.requireRiskSupabase,
}));

import { generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState } from "../lib/risk-gate-v2-world-bank-qpsd-sovereign-fiscal.server";

type SourceRow = {
  source_id: string;
  commercial_usage_status: string;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
  licence_name: string;
};

const validSource: SourceRow = {
  source_id: "world_bank_qpsd",
  commercial_usage_status: "COMMERCIAL_OK",
  enabled_for_ingestion: true,
  enabled_for_commercial_signals: false,
  licence_name: "CC BY 4.0",
};

function sourceOnlyDb(source: SourceRow | null) {
  const maybeSingle = vi.fn(async () => ({ data: source, error: null }));
  const from = vi.fn((table: string) => {
    if (table !== "live_external_sources") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    };
  });
  return { from, maybeSingle };
}

const input = {
  country_iso3: "USA",
  as_of: "2026-09-16T00:00:00.000Z",
  generated_at: "2026-09-16T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("World Bank QPSD production adapter source-state boundary", () => {
  it("returns null when a governed QPSD source is intentionally not promoted", async () => {
    const db = sourceOnlyDb(validSource);
    mocks.requireRiskSupabase.mockReturnValue(db);

    await expect(
      generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState(input),
    ).resolves.toBeNull();

    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("live_external_sources");
  });

  it.each([
    ["commercial rights", { commercial_usage_status: "REVIEW_REQUIRED" }],
    ["ingestion gate", { enabled_for_ingestion: false }],
    ["licence", { licence_name: "UNKNOWN" }],
  ])("still fails closed for an invalid %s state", async (_label, override) => {
    const db = sourceOnlyDb({ ...validSource, ...override });
    mocks.requireRiskSupabase.mockReturnValue(db);

    await expect(
      generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState(input),
    ).rejects.toThrow("World Bank QPSD source-state mismatch for production scoring");
  });

  it("still fails closed when the governed source registration is missing", async () => {
    const db = sourceOnlyDb(null);
    mocks.requireRiskSupabase.mockReturnValue(db);

    await expect(
      generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState(input),
    ).rejects.toThrow("World Bank QPSD source is not registered");
  });
});
