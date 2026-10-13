import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {acceptEarningPilotLive,EARNING_PILOT_CASES} from "../../scripts/agentic/verify-earn-first-live-no-funds.mjs";

const sha="a".repeat(40);
const marker={schema_version:"geomacro.deployment-build.v1",
  canonical_repository:"blocknine0/geomacro",canonical_main_sha:sha};
const catalog={schema_version:"geomacro.earn-first-offers.v1",
  chargeable:false,payment_required_now:false,signed_current_risk_object:false,
  offers:[{category:"Macro/FX",topics:["macro_risk"]}]};
const eligible={ok:true,chargeable:false,payment_required_now:false,
  execution_authorized:false,delivery_tier:"structural_baseline",
  query_plan_hash:"b".repeat(64),status:"ELIGIBLE_FOR_X402_QUOTE"};
const locked={...eligible,status:"ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED"};
const unavailable={ok:false,chargeable:false,payment_required_now:false,
  execution_authorized:false,status:"NOT_CURRENTLY_DELIVERABLE"};

function calls(outcomes: unknown[]= [unavailable,eligible,unavailable],
  markerData:unknown=marker) {
  const received: Array<{url:string,method:string,body:string|undefined,headers:Headers}>=[];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname;
    received.push({url:path,method:init?.method??"GET",
      body:init?.body as string|undefined,headers:new Headers(init?.headers)});
    if(path==="/.well-known/geomacro-build.json")return Response.json(markerData);
    if(path==="/api/v1/intelligence/availability"){
      if(init?.method==="GET")return Response.json(catalog);
      const k=received.filter(x=>x.method==="POST").length-1;
      const outcome=outcomes[k] as {ok?:boolean,__httpStatus?:number};
      return Response.json(outcome,{status:outcome.__httpStatus??(outcome.ok?200:422)});
    }
    throw Error("Unexpected call");
  });
  return {fetchImpl,received};
}
describe("first revenue no-funds exact deployment acceptance",()=>{
  it("tests 3 literal buyer categories and reports only genuine quote-ready eligibility",async()=>{
    const {fetchImpl,received}=calls();
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl,
      now:new Date("2026-10-13T15:00:00Z")});
    expect(report.no_funds_preflight_complete).toBe(true);
    expect(report.first_earning_ready).toBe(true);
    expect(report.quote_ready_category_count).toBe(1);
    expect(report.eligible_category_count).toBe(1);
    expect(report.real_funds_touched).toBe(false);
    expect(report.payment_header_submitted).toBe(false);
    expect(report.checkout_or_settlement_attempted).toBe(false);
    expect(received).toHaveLength(5); // build SHA, catalog, three categories
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    for(const x of received){
      expect(x.headers.has("payment-signature")).toBe(false);
      expect(x.headers.has("authorization")).toBe(false);
      expect(x.url).not.toBe("/api/v1/intelligence/query");
    }
    expect(received.filter(x=>x.method==="POST").map(x=>
      JSON.parse(x.body??"{}").topics[0]))
      .toEqual(EARNING_PILOT_CASES.map(x=>x.topic));
    expect(JSON.stringify(report)).not.toContain("source_contract");
    expect(JSON.stringify(report)).not.toContain("source_url");
  });
  it("reports 503 on one category without hiding a separately eligible baseline",async()=>{
    const {fetchImpl,received}=calls([
      {__httpStatus:503},eligible,{__httpStatus:429},
    ]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.no_funds_preflight_complete).toBe(true);
    expect(report.preflight_transport_error_category_count).toBe(2);
    expect(report.eligible_category_count).toBe(1);
    expect(report.quote_ready_category_count).toBe(1);
    expect(report.first_earning_ready).toBe(true);
    expect(report.checks.map(x=>x.status)).toEqual([
      "PASS","PASS","PREFLIGHT_SERVER_UNAVAILABLE",
      "ELIGIBLE_GOVERNED_BASELINE","PREFLIGHT_RATE_LIMITED",
    ]);
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain("source_contract");
    expect(JSON.stringify(report)).not.toContain("source_url");
    expect(report.real_funds_touched).toBe(false);
  });
  it("keeps all 503/429 preflights NON-payable and reports each independently",async()=>{
    const {fetchImpl}=calls([
      {__httpStatus:503},{__httpStatus:429},unavailable,
    ]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.quote_ready_category_count).toBe(0);
    expect(report.governed_no_payable_category_count).toBe(1);
    expect(report.preflight_transport_error_category_count).toBe(2);
    expect(report.first_earning_ready).toBe(false);
    expect(report.real_funds_touched).toBe(false);
    expect(report.checks.map(x=>x.status).slice(2)).toEqual([
      "PREFLIGHT_SERVER_UNAVAILABLE","PREFLIGHT_RATE_LIMITED","NO_PAYABLE_EVIDENCE",
    ]);
  });
  it("does not promote unexpected 200 rail states as quote-ready",async()=>{
    const {fetchImpl}=calls([{...eligible,status:"UNKNOWN_STATE"},unavailable,unavailable]);
    await expect(acceptEarningPilotLive({expectedSha:sha,fetchImpl}))
      .rejects.toThrow("EARNING_PILOT_UNKNOWN_RAIL_STATUS_GEOPOLITICS");
  });
  it("never turns 200 with a locked payment rail into revenue-ready",async()=>{
    const {fetchImpl}=calls([locked,locked,unavailable]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.eligible_category_count).toBe(2);
    expect(report.payment_locked_category_count).toBe(2);
    expect(report.quote_ready_category_count).toBe(0);
    expect(report.first_earning_ready).toBe(false);
  });
  it("fails closed before spending even source lookup quota on a stale deployment",async()=>{
    const {fetchImpl,received}=calls([], {...marker,canonical_main_sha:"c".repeat(40)});
    await expect(acceptEarningPilotLive({expectedSha:sha,fetchImpl}))
      .rejects.toThrow("EARNING_PILOT_NOT_EXACT_MAIN_PUBLISHED");
    expect(received).toHaveLength(1);
  });
  it("does not promote missing evidence or leaky source response",async()=>{
    const {fetchImpl}=calls([unavailable,unavailable,unavailable]);
    const r=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(r.first_earning_ready).toBe(false);
    expect(r.eligible_category_count).toBe(0);
    const leak=calls([unavailable,{...eligible,source_url:"private://original"},unavailable]);
    await expect(acceptEarningPilotLive({expectedSha:sha,fetchImpl:leak.fetchImpl}))
      .rejects.toThrow("EARNING_PILOT_PRIVATE_OR_PAYMENT_BOUNDARY_INVALID");
  });
  it("locks live operator acceptance to no-funds calls on owned exact domain",()=>{
    const s=readFileSync("scripts/agentic/verify-earn-first-live-no-funds.mjs","utf8");
    expect(s).toContain('payment_header_submitted:false');
    expect(s).toContain('checkout_or_settlement_attempted:false');
    expect(s).not.toContain('settleCoinbaseX402(');
    expect(s).not.toContain('PAYMENT-SIGNATURE":');
    expect(s).not.toContain('COINBASE_X402_MAINNET_ACK');
    const workflow=readFileSync(".github/workflows/earn-first-live-no-funds-acceptance.yml","utf8");
    expect(workflow).toContain("EXPECTED_CANONICAL_SHA:");
    expect(workflow).toContain("workflow_dispatch:");
  });
});
