import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {buildPaidMarketWatch} from "./paid-market-watch";
import {publicGeomacroStructuredOutputCatalog} from "./capability-structured-output-contract";

const base={
  capability:"structural_country_digest",variant:"standard",
  state_version:"gstate_test_123",
  verified_dimensions:["external_fx","critical_minerals"],
  verified_signed_drivers:[],
  qualified_event_types:[],
  latest_evidence_at:"2026-10-28T12:00:00.000Z",
  refresh_not_before_seconds:3600,
};

describe("paid machine/user market watch from qualified existing data",()=>{
  it("reuses existing qualified dimensions and never generates a price quote or market prediction",()=>{
    const a=buildPaidMarketWatch(base);
    expect(a.schema_version).toBe("geomacro.paid-market-watch.v1");
    expect(a.status).toBe("CONDITIONAL_MARKET_WATCH");
    expect(a.items).toHaveLength(1);
    expect(a.items[0].market).toBe("Foreign-exchange rates");
    expect(a.items[0].reference_instruments).toContain("US Dollar Index (DXY)");
    expect(a.items[0].instrument_scope_status).toBe("REFERENCE_CANDIDATES_ONLY");
    expect(a.items[0].predicted_direction).toBe("NOT_ESTABLISHED");
    expect(a.items[0].current_market_price).toBe(null);
    expect(a.items[0].estimated_price_change_pct).toBe(null);
    expect(a.items[0].evidence_basis).toBe("VERIFIED_STRUCTURAL_MODULE");
    expect(a.monitoring.state_version).toBe("gstate_test_123");
    expect(a.monitoring.recommended_not_before_seconds).toBe(3600);
    expect(a.limitations.execution_authorized).toBe(false);
    expect(a.limitations.private_inputs_exposed).toBe(false);
    expect(a.limitations.live_quotes_included).toBe(false);
    expect(a.limitations.reference_instruments_are_not_confirmed_exposure).toBe(true);
    expect(a.trader_checklist).toHaveLength(4);
    expect(a.trader_checklist.join(" ")).toContain("bid-ask spread");
  });
  it("cannot grow a sparse digest into five watch items; higher tiers only add known channels",()=>{
    const more={...base,verified_dimensions:[
      "external_fx","critical_minerals","trade_corridor","geopolitical_security",
      "macro_monetary","energy_commodities","sovereign_fiscal",
    ]};
    expect(buildPaidMarketWatch(more).items).toHaveLength(1);
    expect(buildPaidMarketWatch({...more,capability:"structural_country_profile"}).items).toHaveLength(3);
    expect(buildPaidMarketWatch({...more,capability:"intelligence_query",variant:"complex_multi_source"}).items).toHaveLength(5);
    expect(buildPaidMarketWatch({...more,capability:"signed_risk_object",variant:"existing_valid_signed"}).items).toHaveLength(2);
  });
  it("never converts unrelated or unqualified headline text into market claims",()=>{
    const a=buildPaidMarketWatch({...base,verified_dimensions:[],verified_signed_drivers:[],qualified_event_types:[]});
    expect(a.status).toBe("NO_QUALIFIED_MARKET_LINKAGE");
    expect(a.items).toEqual([]);
    expect(a.monitoring.recommended_not_before_seconds).toBe(3600);
    const b=buildPaidMarketWatch({...base,verified_dimensions:["unknown dimension"]});
    expect(b.items).toEqual([]);
  });
  it("accepts GRO risk drivers only when supplied as verified and never exposes the original driver text",()=>{
    const driver="FX pressure from private source https://secret.invalid/raw";
    const a=buildPaidMarketWatch({...base,verified_dimensions:[],verified_signed_drivers:[driver]});
    expect(a.items).toHaveLength(1);
    expect(a.items[0].evidence_basis).toBe("VERIFIED_SIGNED_GRO_DRIVER");
    expect(JSON.stringify(a)).not.toContain("secret.invalid");
    expect(JSON.stringify(a)).not.toContain(driver);
  });
  it("prioritizes qualified current developments ahead of old structural channels under a one-item digest",()=>{
    const a=buildPaidMarketWatch({...base,verified_dimensions:["external_fx"],
      verified_signed_drivers:["inflation"],qualified_event_types:["critical_minerals"]});
    expect(a.items).toHaveLength(1);
    expect(a.items[0].market).toBe("Critical-minerals price benchmarks");
    expect(a.items[0].evidence_basis).toBe("QUALIFIED_CURRENT_DERIVED_EVENT");
    expect(a.items[0].evidence_class).toBe("QUALIFIED_EVENT");
    expect(a.items[0].reference_instruments).toContain("COMEX copper futures (HG) / LME copper (for copper evidence)");
    expect(a.items[0].predicted_direction).toBe("NOT_ESTABLISHED");
    expect(JSON.stringify(a)).not.toContain("source_url");
  });
  it("maps verified evidence across all three categories to bounded trader instrument references",()=>{
    const cases=[
      ["geopolitical_security","Gold spot reference (XAU/USD)"],
      ["sanctions_restrictions","Commodity futures for the specifically affected import or export"],
      ["trade_corridor","Baltic Dry Index (BDI)"],
      ["macro_monetary","Subject sovereign 2-year yield"],
      ["external_fx","US Dollar Index (DXY)"],
      ["sovereign_fiscal","Subject sovereign USD bond spread"],
      ["critical_minerals","COMEX copper futures (HG) / LME copper (for copper evidence)"],
      ["energy_commodities","ICE Brent crude futures (BRN)"],
      ["food_agriculture","CBOT wheat futures (ZW)"],
      ["banking_financial_system","Affected bank senior-credit spread (if quoted)"],
      ["political_governance","Subject sovereign USD bond spread"],
      ["natural_hazards","Route or port-specific freight rates"],
    ] as const;
    for(const [dimension,instrument] of cases){
      const result=buildPaidMarketWatch({...base,verified_dimensions:[dimension]});
      expect(result.items[0]?.reference_instruments,{dimension}).toContain(instrument);
      expect(result.items[0]?.instrument_scope_status).toBe("REFERENCE_CANDIDATES_ONLY");
      expect(result.items[0]?.predicted_direction).toBe("NOT_ESTABLISHED");
      expect(result.items[0]?.estimated_price_change_pct).toBeNull();
    }
  });
  it("all nine launch contracts require a market watch; Risk Gate remains Coming Soon",()=>{
    const products=publicGeomacroStructuredOutputCatalog();
    const launch=products.filter(p=>p.capability!=="risk_gate_bundle");
    expect(launch).toHaveLength(9);
    for(const product of launch){
      expect(product.only_when_verified).toContain("decision_intelligence[*].market_watch.status");
      expect(product.only_when_verified).toContain("decision_intelligence[*].market_watch.monitoring");
    }
    for(const product of products.filter(p=>p.capability==="risk_gate_bundle")){
      expect(product.only_when_verified).not.toContain("decision_intelligence[*].market_watch.status");
    }
  });
  it("has no ingestion, OSINT or DB fetch inside the paid market mapper",()=>{
    const file=readFileSync("src/lib/paid-market-watch.ts","utf8");
    expect(file).not.toMatch(/fetch\s*\(|SELECT\s+|INSERT\s+|process\.env|supabase|backblaze|D1Database/i);
    const schema=JSON.parse(readFileSync("schemas/paid-market-watch-v1.schema.json","utf8"));
    expect(schema.properties.items.maxItems).toBe(5);
    expect(schema.properties.trader_checklist.maxItems).toBe(4);
    expect(schema.properties.items.items.properties.reference_instruments.maxItems).toBe(3);
    expect(schema.properties.items.items.properties.predicted_direction.const).toBe("NOT_ESTABLISHED");
  });
});
