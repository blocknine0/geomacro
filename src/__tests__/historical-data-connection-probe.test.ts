import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const adapter = readFileSync("global-intelligence/adapters/historical-data.mjs", "utf8");
const probe = readFileSync("global-intelligence/scripts/probe-historical-data.mjs", "utf8");

describe("Historical data connection probe", () => {
  it("uses the bounded connection probe instead of production retrieval adapters", () => {
    expect(probe).toContain("probeHistoricalConnection");
    expect(probe).not.toContain("fetchHistoricalGeopolitics");
    expect(probe).not.toContain("fetchHistoricalMacro");
    expect(probe).not.toContain("fetchHistoricalRareEarths");
  });

  it("probes the governed geopolitical base interface without expensive ordering while full retrieval keeps the latest-country serving view", () => {
    expect(adapter).toContain('table: DEFAULT_TABLES.geopolitical');
    expect(adapter).toContain('table: options.table ?? DEFAULT_TABLES.geopoliticalCountryLatest');
    expect(adapter).toContain("export async function probeHistoricalConnection(domain)");
    expect(adapter).toContain("limit: 1");
    expect(adapter).toContain("order: undefined");
  });

  it("does not weaken the full historical retrieval policy", () => {
    expect(adapter).toContain('source_repository: "blocknine0/geomacro-historical-data"');
    expect(adapter).toContain('methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_OR_GRO_UNTIL_SEPARATELY_VERSIONED"');
    expect(adapter).toContain('raw_warehouse_access: false');
    expect(adapter).toContain('"automatic_GRI_GRO_score_changes"');
  });
});
