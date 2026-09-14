import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = readFileSync(
  new URL("../../scripts/ingest-world-bank-live.mjs", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/918_world_bank_latest_financial_view.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Risk Gate v2 governed WDI financial inputs", () => {
  it("ingests the reviewed reserve, external-balance and banking indicators", () => {
    expect(ingest).toContain('"FI.RES.TOTL.MO"');
    expect(ingest).toContain('"BN.CAB.XOKA.GD.ZS"');
    expect(ingest).toContain('"FB.AST.NPER.ZS"');
    expect(ingest).toContain('"FB.BNK.CAPA.ZS"');
    expect(ingest).toContain('"FD.RES.LIQU.AS.ZS"');
    expect(ingest).toContain('"total_reserves_months_imports"');
    expect(ingest).toContain('"bank_nonperforming_loans_pct"');
  });

  it("serves only verified commercially eligible latest WDI rows to server code", () => {
    expect(migration).toContain("create or replace view public.live_world_bank_indicator_latest");
    expect(migration).toContain("o.source_id = 'world_bank_indicators'");
    expect(migration).toContain("o.quality_status = 'VERIFIED'");
    expect(migration).toContain("o.commercial_eligibility_status = 'VERIFIED'");
    expect(migration).toContain("revoke all on public.live_world_bank_indicator_latest");
    expect(migration).toContain("grant select on public.live_world_bank_indicator_latest");
  });
});
