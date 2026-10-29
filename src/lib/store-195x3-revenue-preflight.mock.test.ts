import {describe,expect,it,vi} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {preflightStoreProductData} from "./store-product-availability.server";
import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";
import type {AgentQueryPlan} from "./agent-query-plan";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";

/**
 * SYNTHETIC CONTRACT TEST, NOT LIVE PUBLISHER COVERAGE.
 * 195 canonical ISO3 x 3 categories = 585 explicit client contracts. All
 * source identities/timestamps in this file are mocks. Real original
 * SHA/date/rights and owner-authorized buyer delivery stay independent gates.
 */
const DOMAINS = [
 {category:"geopolitics",topic:"conflict_geopolitics",module:"geopolitical_security"},
 {category:"macro_fx",topic:"macro_risk",module:"macro_monetary"},
 {category:"critical_minerals",topic:"critical_minerals",module:"critical_minerals"},
] as const;
const request=(iso3:string,topic:string,headers:Record<string,string>={})=>
 new Request("https://geomacro.live/api/v1/intelligence/products-availability",{
   method:"POST",
   headers:{"content-type":"application/json",...headers},
   body:JSON.stringify({
     schema_version:"geomacro.agent-query.v1",
     delivery_tier:"structural_baseline",fulfillment_mode:"published_only",
     product:{capability:"structural_country_digest",variant:"standard"},
     subjects:[{type:"country",country_iso3:iso3}],topics:[topic],detail:"compact",
   }),
 });
const sourceId=(module:string)=>"mock_original_"+module;
const success=(plan:AgentQueryPlan):AgentQueryDeliverability=>({
 deliverable:true,code:"AVAILABLE",query_plan_hash:plan.query_plan_hash,
 checked_at:new Date().toISOString(),
 missing_modules:[],stale_modules:[],ineligible_source_ids:[],
 source_contracts:plan.required_modules.map(module=>({
   source_id:sourceId(module),commercial_usage_status:"DERIVED_ONLY",
   raw_redistribution_allowed:false,attribution_required:false,licence_name:"MOCK_ONLY",
 })),
 subjects:plan.subjects.map(subject=>({
   subject,status:"AVAILABLE",available_modules:[...plan.required_modules],
   // This is a synthetic source-native observation clock, not an ingestion time.
   latest_evidence_at:new Date(Date.now()-86_400_000).toISOString(),
   required_source_ids:plan.required_modules.map(sourceId),
   governed_fallback_modules:[],
 })),
});
const options=(check:(plan:AgentQueryPlan)=>Promise<AgentQueryDeliverability>)=>({
 rateLimit:()=>true,check,
 classify:(plan:AgentQueryPlan)=>resolveGeomacroCapabilityPrice(
   plan.product!.capability,plan.product!.variant),
});
const isNeverPayable=(value:any)=>{
 expect(value.chargeable).toBe(false);
 expect(value.payment_required_now).toBe(false);
 expect(value.payment_authorized).toBe(false);
 expect(value.execution_authorized).toBe(false);
 expect(JSON.stringify(value)).not.toContain("mock_original_");
 expect(JSON.stringify(value)).not.toContain("MOCK_ONLY");
};

describe("195 x 3 585-cell synthetic Store no-funds coverage contracts",()=>{
 it("tests ALL 585 cases of hypothetical native original+rights proof with no price inflation or payments",async()=>{
   expect(COUNTRIES_195).toHaveLength(195);
   let cases=0;
   for(const country of COUNTRIES_195)for(const domain of DOMAINS){
     const check=vi.fn(async(plan:AgentQueryPlan)=>success(plan));
     const response=await preflightStoreProductData(
       request(country.iso3,domain.topic),options(check));
     const body=await response.json();
     expect(response.status, country.iso3+":"+domain.category).toBe(200);
     expect(body.status).toBe("DATA_ELIGIBLE_NOT_YET_PREPARED_OR_PAYABLE");
     expect(body.catalog_price.amount_usdc).toBe("0.02");
     expect(body.catalog_price.authoritative_payment_quote).toBe(false);
     expect(body.selected_product.capability).toBe("structural_country_digest");
     expect(body.availability.subjects[0].available_modules).toEqual([domain.module]);
     isNeverPayable(body);
     expect(check).toHaveBeenCalledOnce();
     cases++;
   }
   expect(cases).toBe(585);
 });
 it("tests ALL 585 missing-original country/category cases: deny without paid quote",async()=>{
   let cases=0;
   for(const country of COUNTRIES_195)for(const domain of DOMAINS){
     const response=await preflightStoreProductData(request(country.iso3,domain.topic),
       options(async plan=>({
         ...success(plan),deliverable:false,code:"INSUFFICIENT_COVERAGE",
         missing_modules:[domain.module],source_contracts:[],
         subjects:success(plan).subjects.map(s=>({...s,available_modules:[],
           latest_evidence_at:null,required_source_ids:[]})),
       })));
     const body=await response.json();
     expect(response.status,country.iso3+":"+domain.category).toBe(422);
     expect(body.status).toBe("DATA_NOT_CURRENTLY_DELIVERABLE");
     isNeverPayable(body);
     cases++;
   }
   expect(cases).toBe(585);
 });
 it.each(DOMAINS)("rejects wrong country, no rights, missing original clock and false module in $category",async domain=>{
   const validPlan=async()=> {
     const response=await preflightStoreProductData(
       request("USA",domain.topic),options(async plan=>success(plan)));
     expect(response.status).toBe(200);
   };
   await validPlan();
   const mutations: Array<(v:AgentQueryDeliverability)=>AgentQueryDeliverability>=[
     a=>({...a,source_contracts:[]}),
     a=>({...a,source_contracts:a.source_contracts.map(s=>({...s,attribution_required:true}))}),
     a=>({...a,source_contracts:a.source_contracts.map(s=>({...s,commercial_usage_status:"UNREVIEWED"}))}),
     a=>({...a,source_contracts:a.source_contracts.map(s=>({...s,source_id:"different_unrelated_source"}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,subject:{type:"country",country_iso3:"CHN"}}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,latest_evidence_at:null}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,latest_evidence_at:"2099-01-01T00:00:00.000Z"}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,available_modules:[]}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,required_source_ids:[]}))}),
     a=>({...a,subjects:a.subjects.map(s=>({...s,status:"UNAVAILABLE"}))}),
     a=>({...a,checked_at:"2020-01-01T00:00:00.000Z"}),
     a=>({...a,checked_at:"2099-01-01T00:00:00.000Z"}),
     a=>({...a,stale_modules:[domain.module]}),
   ];
   for(const mutate of mutations){
     const response=await preflightStoreProductData(request("USA",domain.topic),
       options(async plan=>mutate(success(plan))));
     expect(response.status,domain.category).toBe(422);
     const body=await response.json();
     expect(body.payment_authorized).toBe(false);
     expect(body.chargeable).toBe(false);
     // Some denied receipts are rejected by the earlier canonical checker
     // before the independent structural defence-in-depth check. Both
     // responses MUST remain 422/no-charge, and neither implies proof.
     if(body.error)expect(body.error.code).toBe("STORE_PREFLIGHT_SOURCE_EVIDENCE_UNVERIFIED");
     else expect(body.status).toBe("DATA_NOT_CURRENTLY_DELIVERABLE");
   }
 });
 it("a signed current Intelligence query cannot be sold with a mock annual structural source",async()=>{
   const invalid=new Request("https://geomacro.live/api/v1/intelligence/products-availability",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({
       fulfillment_mode:"published_only",delivery_tier:"structural_baseline",
       product:{capability:"structural_country_digest",variant:"standard"},
       subjects:[{type:"country",country_iso3:"USA"}],
       topics:["critical_minerals","macro_risk"],detail:"compact",
     }),
   });
   const checker=vi.fn(async(plan:AgentQueryPlan)=>success(plan));
   const res=await preflightStoreProductData(invalid,options(checker));
   expect(res.status).toBe(400);
   expect(checker).not.toHaveBeenCalled();
   isNeverPayable(await res.json());
 });
});
