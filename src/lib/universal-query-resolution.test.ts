import {describe,expect,it,vi} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {publicQueryResolution,QUERY_RESOLUTION_SCHEMA} from "./universal-query-resolution";
import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";
import {paidStructuredAnswer} from "./paid-structured-answer.server";
import {mainnetIntelligenceHandlers} from "./mainnet-intelligence-endpoint.server";

describe("Universal GeoMacro scope review for all human and machine buyers",()=>{
  it("never silently changes an explicit paid profile, signed object or baseline",()=>{
    const r=publicQueryResolution({
      question:"India lithium",subjects:[{type:"country",country_iso3:"IND"}],
      topics:["critical_minerals"],
      product:{capability:"structural_country_profile",variant:"standard"},
    },new Error("PROFILE_REQUIRES_AT_LEAST_TWO_DIMENSIONS"));
    expect(r.schema_version).toBe(QUERY_RESOLUTION_SCHEMA);
    expect(r.status).toBe("REQUIRES_BUYER_REVIEW");
    expect(r.suggested_product).toEqual({capability:"intelligence_query",variant:"focused"});
    expect(r.indicative_price_usdc).toBe("0.05");
    expect(r.suggested_canonical_request).toMatchObject({
      topics:["critical_minerals"],subjects:[{type:"country",country_iso3:"IND"}],
      product:{capability:"intelligence_query",variant:"focused"},
    });
    expect(r.reviewer_must_explicitly_submit_suggested_request).toBe(true);
    expect(r.available_evidence_checked).toBe(false);
    expect(r.payment_required_now).toBe(false);
    expect(r.payment_authorized).toBe(false);
  });

  it("does not fabricate signed proof from ordinary macro questions or unsupported risk gate",()=>{
    const signed=publicQueryResolution({
      question:"What is India inflation?",subjects:[{type:"country",country_iso3:"IND"}],
      topics:["macro_risk"],
      product:{capability:"signed_risk_object",variant:"existing_valid_signed"},
    },new Error("STORE_SIGNED_OBJECT_SCOPE_MISMATCH"));
    expect(signed.suggested_product).toEqual({capability:"intelligence_query",variant:"focused"});
    expect(JSON.stringify(signed)).not.toContain("signed_risk_object.v1");
    expect(signed.auto_charge).toBe(false);
    const denied=publicQueryResolution({question:"Risk gate India",
      product:{capability:"structural_country_digest",variant:"standard"}},
      new Error("STORE_STRUCTURAL_QUESTION_SCOPE_UNSUPPORTED"));
    expect(denied.suggested_product).toBeNull();
    expect(denied.payment_authorized).toBe(false);
  });

  it("preserves strict malformed input handling rather than recommending a sale",()=>{
    for(const input of [null,{}, {question:""}, {question:"x".repeat(2100)},
      {question:"India inflation",product:{capability:"risk_gate_bundle",variant:"standard"}}]){
      const out=publicQueryResolution(input,new Error("UNKNOWN_ERROR"));
      expect(out.suggested_canonical_request).toBeNull();
      expect(out.suggested_product).toBeNull();
      expect(out.payment_authorized).toBe(false);
    }
  });

  it("routes the complete 195-country x 3-category matrix as no-funds discovery",()=>{
    expect(COUNTRIES_195).toHaveLength(195);
    const queries=[
      {topic:"conflict_geopolitics",text:"geopolitical conflict"},
      {topic:"macro_risk",text:"inflation"},
      {topic:"critical_minerals",text:"lithium"},
    ] as const;
    let count=0;
    for(const country of COUNTRIES_195)for(const item of queries){
      const request={
        question:`What is the ${item.text} situation in ISO3: ${country.iso3}?`,
        subjects:[{type:"country" as const,country_iso3:country.iso3}],
        topics:[item.topic],
      };
      const v=interpretMultilingualIntelligenceQuery(request);
      expect(v.subjects).toEqual(request.subjects);
      expect(v.topics).toContain(item.topic);
      expect(v.query_plan_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(v.evidence_checked).toBe(false);
      expect(v.payment_required_now).toBe(false);
      expect(v.execution_authorized).toBe(false);
      count++;
    }
    expect(count).toBe(585);
  });

  it("returns no-charge suggested SKU from the normal user endpoint without calling x402",async()=>{
    const post=vi.fn(async()=>Response.json({ok:true},{status:200}));
    const body={question:"India lithium",subjects:[{type:"country",country_iso3:"IND"}],
      topics:["critical_minerals"],product:{capability:"structural_country_profile",variant:"standard"}};
    const response=await paidStructuredAnswer(new Request(
      "https://geomacro.live/api/v1/intelligence/structured-answer",{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),
      }),{rateLimit:()=>true,post});
    expect(response.status).toBe(400);
    const json=await response.json();
    expect(json.error.code).toBe("PAID_STRUCTURED_UNSUPPORTED_SCOPE");
    expect(json.resolution.suggested_product).toEqual({
      capability:"intelligence_query",variant:"focused",
    });
    expect(json.resolution.payment_authorized).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("returns no-charge buyer guidance from the canonical machine endpoint",async()=>{
    const request={
      question:"India lithium",subjects:[{type:"country",country_iso3:"IND"}],
      topics:["critical_minerals"],product:{capability:"signed_risk_object",variant:"existing_valid_signed"},
      intent:"single_subject",detail:"standard",delivery_tier:"signed_risk_intelligence",
      fulfillment_mode:"published_only",
    };
    const res=await mainnetIntelligenceHandlers.POST({request:new Request(
      "https://geomacro.live/api/v1/intelligence/query",{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request),
      })});
    expect(res.status).toBe(400);
    const j=await res.json();
    expect(j.error.code).toBe("UNSUPPORTED_ADAPTIVE_QUERY");
    expect(j.resolution.suggested_product).toEqual({capability:"intelligence_query",variant:"focused"});
    expect(j.resolution.payment_required_now).toBe(false);
  });
});
