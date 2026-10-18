import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {publicThreeDomainContinuityResponse,THREE_DOMAIN_CONTINUITY_WORKER}
  from "../lib/three-domain-evidence-continuity-client";

const request=(suffix="?view=continuous")=>
  new Request("https://geomacro.live/api/v1/intelligence/query"+suffix);
const stub=()=>({
  ok:true,schema:"geomacro.three-domain-evidence-continuity.v1",
  three_domains_returned:true,chargeable:false,x402_payment_required:false,
  commercial_rights_verified:false,signed_gro_verified:false,
  upstream_new_event_guaranteed:false,
  categories:{geopolitics:{service_state:"NO_VERIFIED_SOURCE_CONTEXT"},
    macro:{service_state:"CURRENT_SOURCE_CHECK_WITH_DATA"},
    rare_earth:{service_state:"LAST_KNOWN_OR_NEWS_ONLY_NOT_CURRENT_SOURCE_CHECK"}}
});
describe("no-charge canonical three-domain continuity alias",()=>{
 it("reads only the fixed direct Worker and keeps 3 honest category states",async()=>{
   const f=vi.fn(async()=>Response.json(stub()));
   const response=await publicThreeDomainContinuityResponse(request(),f as typeof fetch);
   expect(response.status).toBe(200);
   const data=await response.json();
   expect(data.categories.macro.service_state).toBe("CURRENT_SOURCE_CHECK_WITH_DATA");
   expect(data.upstream_new_event_guaranteed).toBe(false);
   expect(f).toHaveBeenCalledOnce();
   expect(String(f.mock.calls[0][0])).toBe(THREE_DOMAIN_CONTINUITY_WORKER);
   expect(f.mock.calls[0][1].method).toBe("GET");
   expect(f.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
   expect(data.chargeable).toBe(false);
 });
 it("never forwards arbitrary query parameters or buyer-supplied URLs",async()=>{
   const f=vi.fn(async()=>Response.json(stub()));
   for(const suffix of ["?view=continuous&source=https://evil.invalid",
     "?view=continuous&view=continuous","?view=continuous&wallet=anything"]){
     const response=await publicThreeDomainContinuityResponse(request(suffix),f as typeof fetch);
     expect(response.status).toBe(400);
   }
   expect(f).not.toHaveBeenCalled();
 });
 it("fails closed on invalid Worker contract, private source URLs or outage",async()=>{
   for(const payload of [
     {...stub(),chargeable:true},
     {...stub(),categories:{geopolitics:{}}},
     {...stub(),original_url:"https://private.example.invalid"},
   ]){
     const res=await publicThreeDomainContinuityResponse(request(),
       (async()=>Response.json(payload)) as typeof fetch);
     expect(res.status).toBe(503);
   }
   const failed=await publicThreeDomainContinuityResponse(request(),
     (async()=>new Response("unavailable",{status:503})) as typeof fetch);
   expect(failed.status).toBe(503);
   expect((await failed.json()).chargeable).toBe(false);
 });
 it("routes before canonical mainnet x402 handler without changing its POST",()=>{
   const source=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
   expect(source).toContain('url.searchParams.get("view")==="continuous"');
   expect(source).toContain("publicThreeDomainContinuityResponse(request)");
   expect(source).toContain("...mainnetIntelligenceHandlers");
   expect(source).toContain("return mainnetIntelligenceHandlers.GET({request})");
 });
});
