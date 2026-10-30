import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {GEOMACRO_AGENT_TOOLS} from "../lib/geomacro-agent-tools";
import {GEOMACRO_OFFICIAL_API_CATALOG,GEOMACRO_OFFICIAL_API_DISPLAY_NAMES}
 from "../lib/geomacro-official-api-branding";
import {publicGeomacroPaidPricingManifest} from "../lib/geomacro-paid-pricing-manifest.server";
import {buildAgentQueryPlan} from "../lib/agent-query-plan";
import {GEOMACRO_CAPABILITY_PRICES,GEOMACRO_CAPABILITY_PRICING_VERSION}
 from "../lib/capability-pricing-catalog";
import {classifyCentralSecurityRoute,isCoinbaseTestnetLocalSecurityFallbackAllowed}
 from "../lib/central-security.server";
import {
 OFFICIAL_AGENT_PATH,officialGeomacroAgentDiscovery,
 officialGeomacroAgentOpenApi,officialGeomacroAgentHandlers,
 planOfficialGeomacroToolCall,
} from "../lib/official-geomacro-agent.server";

const url="https://geomacro.live/api/v1/agent";
const req=(payload:unknown,headers:Record<string,string>={})=>new Request(url,{
 method:"POST",headers:{"content-type":"application/json",...headers},
 body:JSON.stringify(payload),
});

describe("official Geomacro API and AI Agent v1",()=>{
 it("exports stable official discovery, all existing tools and final founder pricing",async()=>{
  const d=officialGeomacroAgentDiscovery();
  expect(d.schema).toBe("geomacro.official-agent.v1");
  expect(d.countries_routable).toBe(195);
  expect(d.domains).toEqual(["geopolitics","macro","rare_earth"]);
  expect(d.endpoints.canonical_intelligence).toBe("/api/v1/intelligence/query");
  expect(d.endpoints.free_finds).toBe("/api/v1/finds");
  expect(d.endpoints.mcp).toBe("/api/mcp");
  expect(d.endpoints.a2a).toBe("/api/a2a");
  expect(d.tools).toHaveLength(GEOMACRO_AGENT_TOOLS.length);
  expect(d.tools.filter(t=>t.access==="CANONICAL_X402_VERIFIED_ONLY")).toHaveLength(GEOMACRO_AGENT_TOOLS.filter(t=>t.paid).length);
  expect(d.tools.find(t=>t.name==="verify_risk_object")?.endpoint).toBe("/api/mcp");
  expect(d.pricing_version).toBe(GEOMACRO_CAPABILITY_PRICING_VERSION);
  expect(d.pricing.flatMap(x=>x.variants).find(p=>
   p.capability==="intelligence_query"&&p.variant==="standard")?.amount_usdc).toBe("0.03");
  expect(d.pricing.flatMap(x=>x.variants).find(p=>
   p.capability==="structural_corridor_profile")?.amount_usdc).toBe("0.05");
  expect(d.payment_authorized_by_discovery).toBe(false);
  expect(d.execution_authorized).toBe(false);
  expect(d.all_routed_country_category_cells_commercially_verified).toBe(false);
  expect(JSON.stringify(d)).not.toContain("public_api_enabled");
  const openapi=officialGeomacroAgentOpenApi();
  expect(openapi.openapi).toBe("3.1.0");
  expect(openapi.paths["/api/v1/agent"].post.requestBody.content["application/json"].schema.required).toEqual(["tool","arguments"]);
  expect(openapi.paths["/api/v1/intelligence/query"]).toHaveProperty("post");
  expect(openapi.paths["/api/v1/finds"]).toHaveProperty("get");
  const media=openapi.paths["/api/v1/agent"].post.requestBody.content["application/json"];
  const paid=GEOMACRO_AGENT_TOOLS.filter(tool=>tool.paid);
  expect(media.schema.oneOf).toHaveLength(paid.length);
  for(const tool of paid){
   const variant=media.schema.oneOf.find(x=>x.properties.tool.const===tool.name);
   expect(variant?.properties.arguments).toEqual(tool.inputSchema);
   const example=media.examples[tool.name].value;
   expect(example.tool).toBe(tool.name);
   expect(planOfficialGeomacroToolCall(example)?.tool).toBe(tool.name);
  }
  expect(media.examples).not.toHaveProperty("verify_risk_object");
  expect(openapi.paths["/api/v1/agent"].post.responses).toHaveProperty("429");
  expect(d.buyer_integration.preflight_does_not_charge).toBe(true);
  expect(d.buyer_integration.no_automatic_payment_retry).toBe(true);
  expect(d.buyer_integration.baseline_preflight_scope).toBe("structural_baseline_only");
  expect(openapi["x-geomacro"].execution_authorized).toBe(false);
 });
 it("uses GEOMACRO product names, not HTTP verbs, as the official API labels",()=>{
  const agent=officialGeomacroAgentDiscovery();
  const openapi=officialGeomacroAgentOpenApi();
  const pricing=publicGeomacroPaidPricingManifest();
  expect(GEOMACRO_OFFICIAL_API_CATALOG).toHaveLength(5);
  expect(agent.official_api_display_names).toEqual(GEOMACRO_OFFICIAL_API_DISPLAY_NAMES);
  expect(agent.official_api_catalog).toEqual(GEOMACRO_OFFICIAL_API_CATALOG);
  expect(pricing.official_api_display_names).toEqual(GEOMACRO_OFFICIAL_API_DISPLAY_NAMES);
  expect(pricing.official_api_catalog).toEqual(GEOMACRO_OFFICIAL_API_CATALOG);
  expect(openapi["x-geomacro"].official_api_display_names)
    .toEqual(GEOMACRO_OFFICIAL_API_DISPLAY_NAMES);
  for(const api of GEOMACRO_OFFICIAL_API_CATALOG){
    expect(api.name).toMatch(/^GEOMACRO /);
    expect(api.name).not.toMatch(/\b(?:GET|POST)\b/);
    expect(api.method).toBe("POST");
    const operation=(openapi.paths as any)[api.path].post;
    expect(operation.summary).toBe(api.name);
    // Existing stable operation IDs, route URLs and request methods remain untouched.
    expect(operation.operationId).toBeTruthy();
  }
  expect(pricing.official_api.geopolitics).toBe("POST /api/v1/intelligence/geopolitics");
  expect(pricing.official_api.macro_fx).toBe("POST /api/v1/intelligence/macro-fx");
  expect(pricing.official_api.critical_minerals).toBe("POST /api/v1/intelligence/critical-minerals");
  expect(agent.payment_authorized_by_discovery).toBe(false);
  expect(pricing.payment_authorized).toBe(false);
 });
 it.each(["country_risk","corridor_risk","change_since_last_verified",
    "why_changed","three_domain_state","risk_gate_decision_context"] as const)(
  "%s maps into the existing canonical agent-query builder only",tool=>{
   const arguments_=GEOMACRO_AGENT_TOOLS.find(x=>x.name===tool)!.example;
   const got=planOfficialGeomacroToolCall({tool,arguments:arguments_});
   expect(got?.tool).toBe(tool);
   expect(got?.query.schema_version).toBe("geomacro.agent-query.v1");
   expect(got?.query.subjects.length).toBeGreaterThan(0);
   expect(()=>buildAgentQueryPlan(got?.query)).not.toThrow();
  });
 it("rejects all unsupported tools, extra keys, wrong ISO3 and unverified free verifier alias",()=>{
  for(const value of [
   {tool:"verify_risk_object",arguments:{risk_object:{}}},
   {tool:"settle",arguments:{}},
   {tool:"country_risk",arguments:{country_iso3:"invalid"}},
   {tool:"country_risk",arguments:{country_iso3:"IND"},payment:true},
   {tool:"country_risk",arguments:"IND"},
   {},
  ])expect(planOfficialGeomacroToolCall(value)).toBeNull();
 });
 it("delegates exact canonical URI + payment header once, never settles/signs itself",async()=>{
  const handler=vi.fn(async({request}:{request:Request})=>{
   expect(new URL(request.url).pathname).toBe("/api/v1/intelligence/query");
   expect(request.method).toBe("POST");
   expect(request.headers.get("payment-signature")).toBe("synthetic-untrusted-payment-signature");
   expect(request.headers.get("authorization")).toBeNull();
   expect(request.headers.get("cookie")).toBeNull();
   const body=await request.json();
   expect(body.subjects).toEqual([{type:"country",country_iso3:"IND"}]);
   expect(body.topics).toContain("macro_risk");
   expect(body.question).toContain("IND");
   return Response.json({ok:false,chargeable:false,
    error:{code:"INSUFFICIENT_COVERAGE"},execution_authorized:false},{status:422});
  });
  const api=officialGeomacroAgentHandlers(handler);
  const response=await api.POST({request:req({
   tool:"country_risk",arguments:{country_iso3:"IND",domains:["macro"]},
  },{"payment-signature":"synthetic-untrusted-payment-signature",
    "authorization":"Bearer dontforward",cookie:"session=dontforward"})});
  expect(handler).toHaveBeenCalledOnce();
  expect(response.status).toBe(422);
  expect((await response.json()).error.code).toBe("INSUFFICIENT_COVERAGE");
 });
 it("passes existing canonical 402 payment challenge through unchanged rather than creating its own",async()=>{
  const h=vi.fn(async()=>new Response('{"payment_required":true}',{
   status:402,headers:{"PAYMENT-REQUIRED":"base64-existing-canonical-challenge"}}));
  const r=await officialGeomacroAgentHandlers(h).POST({request:req({
   tool:"country_risk",arguments:{country_iso3:"DEU"},
  })});
  expect(r.status).toBe(402);
  expect(r.headers.get("PAYMENT-REQUIRED")).toBe("base64-existing-canonical-challenge");
  expect(h).toHaveBeenCalledOnce();
 });
 it("fails closed before canonical handler on malformed or oversized POST and unknown GET",async()=>{
  const h=vi.fn(async()=>Response.json({ok:true}));
  const api=officialGeomacroAgentHandlers(h);
  for(const [request,status] of [
   [req({tool:"country_risk",arguments:{country_iso3:"INVALID"}}),400],
   [new Request(url,{method:"POST",headers:{"content-type":"text/plain"},body:"a"}),415],
   [new Request(url+"?view=openapi",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}),415],
   [new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:"{"}),400],
   [new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tool:"country_risk",arguments:{country_iso3:"IND"},padding:"x".repeat(20000)})}),413],
  ] as const){
   const response=await api.POST({request});
   expect(response.status).toBe(status);
  }
  expect(h).not.toHaveBeenCalled();
  expect((await api.GET({request:new Request(url)})).status).toBe(200);
  const o=await api.GET({request:new Request(url+"?view=openapi")});
  expect(o.status).toBe(200);
  expect((await o.json()).openapi).toBe("3.1.0");
  expect((await api.GET({request:new Request(url+"?view=secret")})).status).toBe(400);
  expect((await api.GET({request:new Request(url+"?view=openapi&view=openapi")})).status).toBe(400);
  expect((await api.OPTIONS()).status).toBe(204);
 });
 it("sets central security POST to payment fail-closed; no testnet local shortcut",()=>{
  expect(classifyCentralSecurityRoute(OFFICIAL_AGENT_PATH,"POST")).toBe("payment");
  expect(classifyCentralSecurityRoute(OFFICIAL_AGENT_PATH,"GET")).toBe("public_api");
  expect(classifyCentralSecurityRoute(OFFICIAL_AGENT_PATH,"OPTIONS")).toBe("public_api");
  expect(isCoinbaseTestnetLocalSecurityFallbackAllowed(OFFICIAL_AGENT_PATH,"payment")).toBe(false);
  const code=readFileSync("src/lib/official-geomacro-agent.server.ts","utf8");
  expect(code).toContain("return canonicalPost({request:canonical})");
  for(const forbidden of ["settleCoinbaseX402(","createB2Client(","getAppSupabase(","groqClassifyJson(","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64"])
   expect(code).not.toContain(forbidden);
  expect(JSON.parse(readFileSync("config/commercial-route-disposition.json","utf8")).routes[OFFICIAL_AGENT_PATH].status)
    .toBe("CONTROLLED_PRELAUNCH");
 });
});
