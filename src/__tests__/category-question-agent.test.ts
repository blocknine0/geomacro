import {describe,it,expect,vi} from "vitest";
import {GEOMACRO_CATEGORY_AGENT_PROFILES,geomacroAgentToolToCanonicalQuery}
 from "../lib/geomacro-agent-tools";
import {buildAgentQueryPlan} from "../lib/agent-query-plan";
import {officialGeomacroAgentHandlers,planOfficialGeomacroToolCall}
 from "../lib/official-geomacro-agent.server";

const questions={geopolitics:"What geopolitical risks affect India?",
 "macro-fx":"What macro and FX risks affect India?",
 "critical-minerals":"What critical minerals risks affect India?"};
describe("three separate category question agents on the canonical engine",()=>{
 it.each(GEOMACRO_CATEGORY_AGENT_PROFILES)("preserves the buyer question and exact $id scope",profile=>{
  const args={country_iso3:"ind",question:questions[profile.id],max_age_seconds:3600};
  const query=geomacroAgentToolToCanonicalQuery(profile.tool,args);
  expect(query.question).toBe(args.question);
  expect(query.subjects).toEqual([{type:"country",country_iso3:"IND"}]);
  expect(query.topics).toEqual(profile.topics);
  expect(buildAgentQueryPlan(query).fulfillment_mode).toBe("live_on_demand");
  expect(buildAgentQueryPlan({...query,fulfillment_mode:"published_only"}).fulfillment_mode).toBe("published_only");
  expect(()=>geomacroAgentToolToCanonicalQuery(profile.tool,{...args,topics:["risk_object"]})).toThrow();
  expect(()=>geomacroAgentToolToCanonicalQuery(profile.tool,{...args,question:"Audit a signed risk object"})).toThrow();
 });
 it.each(GEOMACRO_CATEGORY_AGENT_PROFILES)("forwards $id paid retry and response without changing quoted bytes",async profile=>{
  const response=new Response('{"frozen":"customer-answer"}',{status:200,headers:{
   "PAYMENT-RESPONSE":"test-receipt","X-Geomacro-Delivery-SHA256":"test-hash"}});
  const canonical=vi.fn(async({request}:{request:Request})=>{
   expect(new URL(request.url).pathname).toBe("/api/v1/intelligence/query");
   expect(request.headers.get("payment-signature")).toBe("untrusted-test-proof");
   const query=await request.json();
   expect(query.question).toBe(questions[profile.id]);
   expect(query.fulfillment_mode).toBe("published_only");
   expect(query.topics).toEqual(profile.topics);
   return response;
  });
  const result=await officialGeomacroAgentHandlers(canonical).POST({request:new Request(
   "https://geomacro.live/api/v1/agent",{method:"POST",headers:{"content-type":"application/json",
   "payment-signature":"untrusted-test-proof"},body:JSON.stringify({tool:profile.tool,arguments:{
    country_iso3:"IND",question:questions[profile.id],fulfillment_mode:"published_only"}})})});
  expect(result).toBe(response);
  expect(canonical).toHaveBeenCalledTimes(1);
 });
 it("rejects unknown and cross-category paid tool calls before forwarding",()=>{
  expect(planOfficialGeomacroToolCall({tool:"geopolitics_query",arguments:{country_iso3:"IND",
   question:"What is the critical minerals supply risk?"}})).toBeNull();
  expect(planOfficialGeomacroToolCall({tool:"macro_fx_query",arguments:{country_iso3:"IND",
   question:"What is the FX risk?",fulfillment_mode:"pay_anyway"}})).toBeNull();
 });
});
