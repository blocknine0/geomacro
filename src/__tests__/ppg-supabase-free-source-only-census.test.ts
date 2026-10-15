import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {COUNTRIES_195} from "../lib/canonical-country-registry-195";
import {auditPpgSourceOnlyCensus} from "../../scripts/ops/world-bank-ppg-supabase-free-source-census.mjs";
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?
  Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const hash=(o:unknown)=>createHash("sha256").update(JSON.stringify(canonical(o))).digest("hex");
function auditedFiscalFixture(){
  const report={
    schema_version:"geomacro-world-bank-ppg-sovereign-fiscal-shadow-1.0",
    writes_performed:false,production_activation_allowed:false,
    scoring_production_changed:false,country_payability_changed:false,
    base_mainnet_gate_changed:false,
    normalization:{peer_count:120},
    methodology_boundary:{
      fixed_20_peer_minimum_preserved:true,
      raw_values_pooled_with_central_or_general_government_debt:false,
      ppg_external_debt_relabelled_as_total_government_debt:false,
    },
    shadow_summary:{target_reached:true,eligible_shadow_country_count:100},
    states:COUNTRIES_195.slice(0,100).map(c=>({
      module:"sovereign_fiscal",coverage:"LIMITED",
      commercial_eligibility_status:"VERIFIED",
      module_state_id:`rgv2:${c.iso3}:sovereign_fiscal:world-bank-ppg-external-debt:fixture`,
    })),
    report_hash:"",
  };
  report.report_hash=hash(report);
  return report;
}
describe("World Bank source-only Supabase-free PPG census",()=>{
  it("accepts only a SHA-bound source proof and never promotes four unobserved modules",()=>{
    const result=auditPpgSourceOnlyCensus(auditedFiscalFixture());
    expect(result).toMatchObject({
      country_count:195,ppg_fiscal_shadow_countries:100,
      source_only_target_reached:true,
      four_module_accepted_country_count:null,
      production_activation_allowed:false,x402_chargeable:false,
      supabase_connections:0,d1_writes:0,b2_gets:0,usdc_spent:0,
    });
  });
  it("rejects tampering, double-counting and falsely relabelled debt",()=>{
    const bad=auditedFiscalFixture();bad.states.push(bad.states[0]);
    expect(()=>auditPpgSourceOnlyCensus(bad)).toThrow();
    const debt=auditedFiscalFixture();
    debt.methodology_boundary.ppg_external_debt_relabelled_as_total_government_debt=true;
    debt.report_hash=hash({...debt,report_hash:""});
    expect(()=>auditPpgSourceOnlyCensus(debt)).toThrow();
    const low=auditedFiscalFixture();
    low.states.splice(0,1);
    low.shadow_summary.eligible_shadow_country_count=99;
    low.report_hash=hash({...low,report_hash:""});
    expect(auditPpgSourceOnlyCensus(low).source_only_target_reached).toBe(false);
  });
  it("production workflow never loads a frozen Supabase client to fake 100 full-risk countries",()=>{
    const workflow=readFileSync(".github/workflows/world-bank-ppg-global-shadow-census.yml","utf8");
    expect(workflow).not.toContain("assert-authoritative-supabase.mjs");
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).not.toContain("global-risk-gate-country-ppg-shadow-census.ts --require-target");
    expect(workflow).toContain("world-bank-ppg-supabase-free-source-census.mjs");
    expect(workflow).toContain("four_module_accepted_country_count==null");
  });
});
