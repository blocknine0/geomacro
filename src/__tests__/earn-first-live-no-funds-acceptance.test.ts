import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {acceptEarningPilotLive,EARNING_PILOT_CASES,EARNING_PILOT_ALTERNATE_CASES,scheduledEarningPilotCases} from "../../scripts/agentic/verify-earn-first-live-no-funds.mjs";

const sha="a".repeat(40);
const marker={schema_version:"geomacro.deployment-build.v1",
  canonical_repository:"blocknine0/geomacro",canonical_main_sha:sha};
const catalog={schema_version:"geomacro.earn-first-offers.v1",
  chargeable:false,payment_required_now:false,signed_current_risk_object:false,
  offers:[{category:"Macro/FX",topics:["macro_risk"]}]};
const pricingCatalog={schema:"geomacro.public-capability-price-catalog.v1",
  pricing_version:"geomacro.capability-usdc.v1",
  pricing_status:"FOUNDER_LOCKED_APPROVED_SCHEDULE",
  payment_authorized:false,money_transferred:false,
  x402_payment_requirement_issued:false,source_and_rights_required:true,
  capabilities:[{capability:"structural_country_digest",variants:[{
    variant:"standard",price_usdc:"0.02",amount_atomic:"20000",
    currency:"USDC",decimals:6,output_contract:"GEOMACRO_DERIVED_STRUCTURED_ONLY",
    structured_delivery:{schema:"geomacro.derived-structured.v1"},
    included_signed_object_charge:"NOT_APPLICABLE",
  }]}]};
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
    if(path==="/api/v1/pricing")return Response.json(pricingCatalog);
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
    expect(report.first_earning_ready).toBe(false);
    expect(report.first_sale_explicit_quote_ready_count).toBe(0);
    expect(report.quote_ready_category_count).toBe(1);
    expect(report.first_sale_catalog_only.catalog_only_usdc).toBe("0.02");
    expect(report.first_sale_catalog_only.payable_quote_verified).toBe(false);
    expect(report.eligible_category_count).toBe(1);
    expect(report.real_funds_touched).toBe(false);
    expect(report.payment_header_submitted).toBe(false);
    expect(report.checkout_or_settlement_attempted).toBe(false);
    expect(received).toHaveLength(6); // build SHA, offer catalog, price catalog, three categories
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    const mined=JSON.parse(received.filter(x=>x.method==="POST")[2].body??"{}");
    expect(mined.product).toEqual({capability:"structural_country_digest",variant:"standard"});
    expect(mined.delivery_tier).toBe("structural_baseline");
    expect(mined.fulfillment_mode).toBe("published_only");
    expect(mined.topics).toEqual(["critical_minerals"]);
    expect(report.checks.slice(2).map(x=>x.country_iso3)).toEqual(["USA","USA","USA"]);
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
  it("counts first earning readiness only for a genuinely qualified exact 0.02 USDC product",async()=>{
    const {fetchImpl,received}=calls([unavailable,unavailable,eligible]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.first_sale_explicit_eligible_count).toBe(1);
    expect(report.first_sale_explicit_quote_ready_count).toBe(1);
    expect(report.first_earning_ready).toBe(true);
    expect(report.real_funds_touched).toBe(false);
    const exact=JSON.parse(received.filter(x=>x.method==="POST")[2].body??"{}");
    expect(exact.product).toEqual({capability:"structural_country_digest",variant:"standard"});
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
    expect(report.first_earning_ready).toBe(false);
    expect(report.first_sale_explicit_quote_ready_count).toBe(0);
    expect(report.checks.map(x=>x.status)).toEqual([
      "PASS","PASS","PREFLIGHT_SERVER_UNAVAILABLE",
      "ELIGIBLE_GOVERNED_BASELINE","PREFLIGHT_RATE_LIMITED",
    ]);
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain("source_contract");
    expect(JSON.stringify(report)).not.toContain("source_url");
    expect(report.real_funds_touched).toBe(false);
  });
  it("distinguishes safe central security vs data store outage without copying private errors",async()=>{
    const {fetchImpl}=calls([
      {__httpStatus:503,error:{code:"CENTRAL_SECURITY_UNAVAILABLE",
        secret_key:"NEVER_LOG_SECRET"}},
      {__httpStatus:503,error:{code:"PREFLIGHT_GOVERNED_DATA_UNAVAILABLE",
        source_url:"https://private.example.invalid"}},
      {__httpStatus:422,...unavailable,availability:{
        missing_modules:["sovereign_fiscal","macro_monetary"],
        stale_modules:["external_fx"],ineligible_source_count:3,
      }},
    ]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.checks.slice(2)).toMatchObject([
      {status:"PREFLIGHT_SERVER_UNAVAILABLE",
        blocker_code:"CENTRAL_SECURITY_UNAVAILABLE"},
      {status:"PREFLIGHT_SERVER_UNAVAILABLE",
        blocker_code:"PREFLIGHT_GOVERNED_DATA_UNAVAILABLE"},
      {status:"NO_PAYABLE_EVIDENCE",missing_module_count:2,
        stale_module_count:1,ineligible_source_count:3},
    ]);
    expect(report.quote_ready_category_count).toBe(0);
    expect(report.first_earning_ready).toBe(false);
    for (const text of ["NEVER_LOG_SECRET","private.example.invalid",
      "SOURCE_PRIVATE_DO_NOT_EXPOSE","required_source_ids","source_url"]) {
      expect(JSON.stringify(report)).not.toContain(text);
    }
    expect(report.payment_header_submitted).toBe(false);
    expect(report.real_funds_touched).toBe(false);
  });
  it("reports each tested ISO3 and exact allowlisted structural blockers without source identities",async()=>{
    const {fetchImpl}=calls([
      {...unavailable,availability:{
        missing_modules:["sovereign_fiscal","PRIVATE_SOURCE_DO_NOT_EXPORT"],
        stale_modules:["external_fx"],ineligible_source_count:1,
      }},
      {...unavailable,availability:{
        missing_modules:["macro_monetary"],stale_modules:[],ineligible_source_count:0,
      }},
      {...unavailable,availability:{
        missing_modules:[],stale_modules:["critical_minerals"],ineligible_source_count:0,
      }},
    ]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.first_earning_ready).toBe(false);
    expect(report.checks.slice(2)).toMatchObject([
      {check:"geopolitics",country_iso3:"USA",topic:"conflict_geopolitics",
        missing_public_modules:["sovereign_fiscal"],stale_public_modules:["external_fx"],
        ineligible_source_count:1},
      {check:"macro_fx",country_iso3:"USA",topic:"macro_risk",
        missing_public_modules:["macro_monetary"],stale_public_modules:[]},
      {check:"critical_minerals",country_iso3:"USA",topic:"critical_minerals",
        missing_public_modules:[],stale_public_modules:["critical_minerals"]},
    ]);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_SOURCE_DO_NOT_EXPORT");
    expect(report.real_funds_touched).toBe(false);
    expect(report.payment_header_submitted).toBe(false);
  });

  it("treats leaked issuer IDs on a 422 response as an invalid buyer boundary",async()=>{
    const leak=calls([unavailable,{...unavailable,availability:{
      required_source_ids:["NEVER_EXPORT_SOURCE_ID"]}},unavailable]);
    await expect(acceptEarningPilotLive({expectedSha:sha,fetchImpl:leak.fetchImpl}))
      .rejects.toThrow("EARNING_PILOT_PRIVATE_OR_PAYMENT_BOUNDARY_INVALID");
  });
  it("rejects arbitrary server-provided error codes as public diagnostics",async()=>{
    const {fetchImpl}=calls([
      {__httpStatus:503,error:{code:"INTERNAL_DATABASE_PASSWORD_123"}},
      {__httpStatus:503,error:{code:"SOURCE_EXPIRED_PROVENANCE_SECRET"}},
      unavailable,
    ]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl});
    expect(report.checks.slice(2,4).map(x=>x.blocker_code))
      .toEqual(["UNKNOWN_PREFLIGHT_BLOCKER","UNKNOWN_PREFLIGHT_BLOCKER"]);
    expect(JSON.stringify(report)).not.toContain("INTERNAL_DATABASE_PASSWORD_123");
    expect(JSON.stringify(report)).not.toContain("SOURCE_EXPIRED_PROVENANCE_SECRET");
    expect(report.first_earning_ready).toBe(false);
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
  it("checks exactly 3 alternative markets through the same no-funds buyer API",async()=>{
    const {fetchImpl,received}=calls([eligible,locked,unavailable]);
    const result=await acceptEarningPilotLive({
      expectedSha:sha,diagnosticOnly:true,
      pilotCases:EARNING_PILOT_ALTERNATE_CASES,fetchImpl,
    });
    expect(result.country_profile).toBe("ALTERNATE_COUNTRIES_DIAGNOSTIC_ONLY");
    expect(result.quote_ready_category_count).toBe(1);
    expect(result.payment_locked_category_count).toBe(1);
    expect(result.first_earning_ready).toBe(false);
    expect(result.real_funds_touched).toBe(false);
    expect(result.checkout_or_settlement_attempted).toBe(false);
    const posts=received.filter(x=>x.method==="POST");
    expect(posts).toHaveLength(3);
    expect(posts.map(x=>JSON.parse(x.body??"{}").subjects[0].country_iso3))
      .toEqual(["UKR","BRA","AUS"]);
    for(const post of posts){
      expect(post.headers.has("payment-signature")).toBe(false);
      expect(post.headers.has("authorization")).toBe(false);
      expect(post.url).toBe("/api/v1/intelligence/availability");
    }
  });
  it("cannot promote alternative or arbitrary country probes into paid authorization",async()=>{
    const {fetchImpl,received}=calls([eligible,eligible,eligible]);
    await expect(acceptEarningPilotLive({
      expectedSha:sha,diagnosticOnly:false,
      pilotCases:EARNING_PILOT_ALTERNATE_CASES,fetchImpl,
    })).rejects.toThrow("EARNING_PILOT_ALTERNATE_REQUIRES_DIAGNOSTIC_MODE");
    await expect(acceptEarningPilotLive({
      expectedSha:sha,diagnosticOnly:true,
      pilotCases:[{name:"macro_fx",topic:"macro_risk",country:"CHN"}],fetchImpl,
    })).rejects.toThrow("EARNING_PILOT_COUNTRY_SET_UNAPPROVED");
    expect(received).toHaveLength(0);
  });
  it("PR diagnostic inspects all three offer scopes on older live SHA but never authorizes earnings",async()=>{
    const older={...marker,canonical_main_sha:"c".repeat(40)};
    const {fetchImpl,received}=calls([eligible,locked,unavailable],older);
    const report=await acceptEarningPilotLive({
      expectedSha:sha,diagnosticOnly:true,fetchImpl,
    });
    expect(received).toHaveLength(6);
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    expect(report.exact_main_published).toBe(false);
    expect(report.diagnostic_only).toBe(true);
    expect(report.quote_ready_category_count).toBe(1);
    expect(report.payment_locked_category_count).toBe(1);
    expect(report.first_earning_ready).toBe(false);
    expect(report.checks[0]).toEqual({check:"published_build_sha",
      status:"PUBLISHED_SHA_MISMATCH_DIAGNOSTIC_ONLY"});
    expect(report.payment_header_submitted).toBe(false);
    expect(report.checkout_or_settlement_attempted).toBe(false);
    expect(report.real_funds_touched).toBe(false);
    expect(JSON.stringify(report)).not.toContain(older.canonical_main_sha);
  });
  it("even an exact-live diagnostic remains no-funds and never says ready to earn",async()=>{
    const {fetchImpl}=calls([eligible,eligible,unavailable]);
    const report=await acceptEarningPilotLive({expectedSha:sha,
      diagnosticOnly:true,fetchImpl});
    expect(report.exact_main_published).toBe(true);
    expect(report.quote_ready_category_count).toBe(2);
    expect(report.first_earning_ready).toBe(false);
    expect(report.real_funds_touched).toBe(false);
  });
  it("PR diagnostic refuses malformed deployment marker even without payment",async()=>{
    const {fetchImpl,received}=calls([],{
      ...marker,canonical_main_sha:"malformed",
    });
    await expect(acceptEarningPilotLive({
      expectedSha:sha,diagnosticOnly:true,fetchImpl,
    })).rejects.toThrow("EARNING_PILOT_BUILD_MARKER_INVALID");
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
    expect(workflow).toContain('cron: "7 */6 * * *"');
    expect(workflow).toContain("github.event_name == 'schedule'");
    expect(workflow).toContain("verify-earn-first-live-no-funds.mjs --diagnostic-only");
    expect(workflow).toContain("github.event_name != 'pull_request' && github.event_name != 'schedule'");
  });
});


describe("same-quota rotating earning discovery diagnostics",()=>{
  it("uses only fixed approved country sets, exactly three preflights every six hours",()=>{
    for(let slot=0;slot<4;slot++){
      const hour=String(slot*6).padStart(2,"0");
      const cases=scheduledEarningPilotCases(new Date(`2026-10-20T${hour}:07:00Z`));
      expect(cases).toBe(slot%2===0?EARNING_PILOT_CASES:EARNING_PILOT_ALTERNATE_CASES);
      expect(cases).toHaveLength(3);
    }
    expect(()=>scheduledEarningPilotCases(new Date(NaN))).toThrow("EARNING_PILOT_SCHEDULE_CLOCK_INVALID");
  });
  it("keeps scheduled rotation diagnostic-only and never accepts funds",async()=>{
    const {fetchImpl,received}=calls([eligible,eligible,eligible]);
    const report=await acceptEarningPilotLive({expectedSha:sha,fetchImpl,
      diagnosticOnly:true,pilotCases:scheduledEarningPilotCases(new Date("2026-10-20T07:07:00Z"))});
    expect(report.country_profile).toBe("ALTERNATE_COUNTRIES_DIAGNOSTIC_ONLY");
    expect(report.eligible_category_count).toBe(3);
    expect(report.first_earning_ready).toBe(false);
    expect(report.real_funds_touched).toBe(false);
    expect(received.filter(x=>x.method==="POST")).toHaveLength(3);
    expect(received.some(x=>x.url.includes("/api/v1/intelligence/query"))).toBe(false);
    const workflow=readFileSync(".github/workflows/earn-first-live-no-funds-acceptance.yml","utf8");
    expect(workflow).toContain("--diagnostic-only --auto-country-probe");
    expect(workflow).toContain('cron: "7 */6 * * *"');
  });
});
