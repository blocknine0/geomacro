import {ZodError} from "zod";
import {
 CANONICAL_MAINNET_INTELLIGENCE_PATH,
 mainnetIntelligenceHandlers,
} from "./mainnet-intelligence-endpoint.server";
import {GEOMACRO_AGENT_TOOLS,geomacroAgentTool,
 geomacroAgentToolToCanonicalQuery} from "./geomacro-agent-tools";
import {AGENT_QUERY_SCHEMA_VERSION} from "./agent-query-plan";
import {GEOMACRO_CAPABILITY_PRICING_VERSION,
 capabilityPricingCatalog} from "./capability-pricing-catalog";
import {GEOMACRO_PAID_PRICING_PATH} from "./geomacro-paid-pricing-manifest.server";
import {GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION}
 from "./capability-structured-output-contract";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY}
 from "./geomacro-structured-commercial-license";
import {GEOMACRO_USDC_NETWORKS_PATH,GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH,
  publicGeomacroUsdcRailDiscovery} from "./geomacro-multichain-usdc.server";

/** A machine-friendly facade, not a new agent engine, payment system or
 * second authority for risk. Every non-verification tool resolves through
 * the EXACT canonical x402 POST implementation including its no-charge
 * deliverability, rights, signed-GRO and replay gates. */
export const OFFICIAL_AGENT_SCHEMA="geomacro.official-agent.v1" as const;
export const OFFICIAL_AGENT_PATH="/api/v1/agent" as const;
const MAX_BODY=16*1024;
const H={
 "Cache-Control":"no-store",
 "Content-Type":"application/json; charset=utf-8",
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type, PAYMENT-SIGNATURE, payment-signature",
 "Access-Control-Expose-Headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
};
const json=(data:unknown,status=200,headers:Record<string,string>={})=>
 Response.json(data,{status,headers:{...H,...headers}});
const endpoints={
 agent:"/api/v1/agent",canonical_intelligence:CANONICAL_MAINNET_INTELLIGENCE_PATH,
 geopolitics:"/api/v1/intelligence/geopolitics",
 macro_fx:"/api/v1/intelligence/macro-fx",
 critical_minerals:"/api/v1/intelligence/critical-minerals",
 availability:"/api/v1/intelligence/availability",
 free_finds:"/api/v1/finds",
 find_schema:"/schemas/v1/find-card.json",
 mcp:"/api/mcp",a2a:"/api/a2a",
 agent_card:"/.well-known/agent-card.json",
 usdc_networks:GEOMACRO_USDC_NETWORKS_PATH,
 usdc_price_preflight:GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH,
 locked_usdc_pricing:GEOMACRO_PAID_PRICING_PATH,
 priced_output_fields:"/api/intelligence/capabilities?view=outputs",
};
export function officialGeomacroAgentDiscovery(){
 return {
  schema:OFFICIAL_AGENT_SCHEMA,
  name:"Geomacro AI Agent",
  version:"v1",
  description:"Read-only, country and corridor intelligence across geopolitics, macro/FX and critical minerals; live paid delivery requires separately verified original evidence and rights.",
  canonical_engine:"geomacro.agent-query.v1",
  countries_routable:195,domains:["geopolitics","macro","rare_earth"],
  protocols:["HTTPS JSON","MCP","A2A","x402-v2"],
  endpoints,
  tools:GEOMACRO_AGENT_TOOLS.map(t=>({
   name:t.name,description:t.description,input_schema:t.inputSchema,
   access:t.paid?"CANONICAL_X402_VERIFIED_ONLY":"MCP_PUBLIC_PROOF_VERIFY",
   endpoint:t.paid?OFFICIAL_AGENT_PATH:endpoints.mcp,
   output_contract:t.paid?"geomacro.adaptive-intelligence-response.v1":"signed_risk_object_integrity_only",
  })),
  commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
  usdc_rails:publicGeomacroUsdcRailDiscovery(),
  pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
  pricing:capabilityPricingCatalog(),
  structured_output_contract_version:GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION,
  per_variant_output_fields_endpoint:endpoints.priced_output_fields,
  discovery_does_not_prove_delivery:true,
  current_paid_availability:"REQUIRES_PER_REQUEST_LIVE_NO_FUNDS_PREFLIGHT",
  buyer_integration:{
   discover:"GET /api/v1/agent?view=openapi",
   prices:"GET /api/v1/pricing",
   baseline_only_discovery:"GET /api/v1/intelligence/availability",
   baseline_only_preflight:"POST /api/v1/intelligence/availability",
   baseline_preflight_scope:"structural_baseline_only",
   payable_resource:"POST /api/v1/intelligence/query",
   free_explorer:"GET /api/v1/finds",
   safe_order:["discover","prices","baseline_only_discovery","payable_resource"],
   preflight_does_not_charge:true,
   no_automatic_payment_retry:true,
   use_server_verified_freshness_only:true,
   no_live_delivery_guarantee:true,
   canonical_quote_requires_separate_request_specific_evidence_and_rights:true,
  },
  all_routed_country_category_cells_commercially_verified:false,
  source_names_disclosed:false,raw_data_delivered:false,
  payment_authorized_by_discovery:false,
  execution_authorized:false,
  autonomous_money_movement:false,
 } as const;
}
const problem=(code:string,status:number)=>json({
 ok:false,schema:"geomacro.official-agent-error.v1",error:{code},
 chargeable:false,execution_authorized:false,
},status);
export function officialGeomacroAgentOpenApi(){
 const op=(summary:string,method:"post"|"get",security:unknown[]=[])=>({
  summary,operationId:summary.replace(/[^a-z0-9]+/gi,"").slice(0,70),
  ...(method==="post"?{requestBody:{required:true,content:{
   "application/json":{schema:{type:"object"}}}}}:{}),
  security,
  responses:{
   "200":{description:"Only when underlying independently verified contract permits it; 200 is not implied by discovery."},
   "400":{description:"Invalid or unsupported query"},
   "402":{description:"Only after canonical deliverability and payment preflight, not a blanket price offer"},
   "422":{description:"Not eligible or insufficient original evidence/rights"},
   "429":{description:"Rate limited; honor Retry-After if present and back off without auto-paying"},
   "503":{description:"Unavailable or unverified data runtime; no paid delivery"},
  },
 });
 return {
  openapi:"3.1.0",
  info:{title:"Geomacro Official API and AI Agent v1",version:"1.0.0-prelaunch",
   description:"One canonical intelligence engine; free-derived Finds and machine discovery are not commercially signed GROs. All payable operations remain fail-closed and priced by the approved canonical capability catalog."},
  servers:[{url:"https://geomacro.live"}],
  paths:{
   [OFFICIAL_AGENT_PATH]:{
    get:{summary:"Official Geomacro agent tool and capability discovery",
     operationId:"discoverOfficialGeomacroAgent",
     responses:{"200":{description:"Public discovery only; never implies paid readiness."}}},
    post:{...op("Call a Geomacro tool using canonical x402 evidence gates","post"),
     requestBody:{required:true,content:{"application/json":{
      schema:{
       type:"object",additionalProperties:false,required:["tool","arguments"],
       properties:{
        tool:{type:"string",enum:GEOMACRO_AGENT_TOOLS.filter(t=>t.paid).map(t=>t.name)},
        arguments:{type:"object"},
       },
       // Match tool and arguments together: generic object schemas cause
       // generated clients to send wrong envelopes that cannot be charged.
       oneOf:GEOMACRO_AGENT_TOOLS.filter(t=>t.paid).map(t=>({
        properties:{tool:{const:t.name},arguments:t.inputSchema},
        required:["tool","arguments"],
       })),
      },
      examples:Object.fromEntries(GEOMACRO_AGENT_TOOLS.filter(t=>t.paid).map(t=>[
       t.name,{summary:t.description,value:{tool:t.name,arguments:t.example}},
      ])),
     }}},
   },
   [endpoints.canonical_intelligence]:{post:op("Query canonical Geomacro paid intelligence","post")},
   [endpoints.geopolitics]:{post:op("Query geopolitics scoped intelligence","post")},
   [endpoints.macro_fx]:{post:op("Query macro FX scoped intelligence","post")},
   [endpoints.critical_minerals]:{post:op("Query critical minerals scoped intelligence","post")},
   [endpoints.availability]:{post:op("Check no funds Geomacro query availability","post")},
   ["/api/intelligence/capabilities"]:{get:{
    summary:"Discover exact approved per-variant structured fields via view=outputs or terms via view=license; never a payable offer",
    operationId:"discoverGeomacroPaidStructuredOutputFields",
    parameters:[{in:"query",name:"view",schema:{type:"string",enum:["outputs","license"]}}],
    responses:{"200":{description:"Fourteen approved per-variant structured deliverables with source-free boundaries"}},
   }},
   [GEOMACRO_PAID_PRICING_PATH]:{get:{
    summary:"Approved exact per-call USDC prices for API and AI agent on Base Arc Polygon, never a payment offer",
    operationId:"getGeomacroFounderLockedPricing",
    responses:{"200":{description:"All approved capability/variant USDC amounts, raw data excluded, payment still gated"}},
   }},
   [GEOMACRO_USDC_NETWORKS_PATH]:{get:{
    summary:"Discover Base Arc Polygon native USDC settlement candidates (not an active pay offer)",
    operationId:"discoverGeomacroUsdcNetworks",
    responses:{"200":{description:"Three networks; actual merchant payment remains gated"}},
   }},
   [GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH]:{post:{
    summary:"Preview founder-locked USDC capability amount on selected network WITHOUT requiring or collecting funds",
    operationId:"preflightGeomacroUsdcPrice",
    requestBody:{required:true,content:{"application/json":{schema:{
      type:"object",additionalProperties:false,
      required:["capability","variant","network"],
      properties:{capability:{type:"string"},variant:{type:"string"},
        network:{type:"string",enum:["base","arc","polygon"]}},
    }}}},
    responses:{"200":{description:"Non-payable catalog estimate only"},
      "400":{description:"Invalid rail or pricing tier, no charge"}},
   }},
   [endpoints.free_finds]:{get:{
    summary:"Get 15 minute delayed public no attribution Find Cards",
    operationId:"listGeomacroFindCards",
    parameters:[{name:"domain",in:"query",required:false,
     schema:{type:"string",enum:["geopolitics","macro","rare_earth"]}}],
    responses:{"200":{description:"Derived only, ANNOUNCED/LIMITED may be returned; no GRO entitlement."},
     "503":{description:"Publisher journal unavailable"}}}},
  },
  "x-geomacro":{
   pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
   pricing:capabilityPricingCatalog(),
   locked_pricing_endpoint:GEOMACRO_PAID_PRICING_PATH,
   agent_discovery:OFFICIAL_AGENT_PATH,agent_card:endpoints.agent_card,
   mcp:endpoints.mcp,a2a:endpoints.a2a,
   usdc_networks:GEOMACRO_USDC_NETWORKS_PATH,
   usdc_quote_preflight:GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH,
   evidence_and_rights_required:true,
   execution_authorized:false,payment_authorized_by_discovery:false,
  },
 } as const;
}
const isRecord=(x:unknown):x is Record<string,unknown>=>!!x&&
 typeof x==="object"&&!Array.isArray(x);
/** Validate agent envelope without losing the original canonical query's
 * signed price/plan binding. Only named, already-existing paid MCP tools. */
export function planOfficialGeomacroToolCall(raw:unknown){
 if(!isRecord(raw)||Object.keys(raw).length!==2||
    !Object.hasOwn(raw,"tool")||!Object.hasOwn(raw,"arguments")||
    typeof raw.tool!=="string"||!isRecord(raw.arguments))
   return null;
 const tool=geomacroAgentTool(raw.tool);
 // Public risk-object verification is already the existing MCP path; do not
 // create a second key lifecycle verifier or accidentally charge for it.
 if(!tool||!tool.paid||tool.name==="verify_risk_object")return null;
 try{
  return {tool:tool.name,query:geomacroAgentToolToCanonicalQuery(tool.name,raw.arguments)};
 }catch(e){
  if(e instanceof ZodError)return null;
  return null;
 }
}
export function officialGeomacroAgentHandlers(
 canonicalPost:typeof mainnetIntelligenceHandlers.POST=mainnetIntelligenceHandlers.POST,
){
 return {
  OPTIONS:async()=>new Response(null,{status:204,headers:H}),
  GET:async({request}:{request:Request})=>{
   const p=new URL(request.url).searchParams;
   if(p.size>1||[...p.keys()].some(k=>k!=="view")||
      p.getAll("view").length>1||
      (p.size===1&&p.get("view")!=="openapi"))
     return problem("AGENT_DISCOVERY_QUERY_INVALID",400);
   return p.get("view")==="openapi"
    ?json(officialGeomacroAgentOpenApi())
    :json(officialGeomacroAgentDiscovery());
  },
  POST:async({request}:{request:Request})=>{
   const qs=new URL(request.url).searchParams;
   if(qs.size||!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type")??""))
    return problem("AGENT_REQUEST_FORMAT_INVALID",415);
   const n=request.headers.get("content-length");
   if(n!==null&&(!/^\d+$/u.test(n)||Number(n)>MAX_BODY))
    return problem("AGENT_REQUEST_TOO_LARGE",413);
   const bytes=await request.text();
   if(new TextEncoder().encode(bytes).byteLength>MAX_BODY)
    return problem("AGENT_REQUEST_TOO_LARGE",413);
   let raw:unknown;
   try{raw=JSON.parse(bytes);}catch{return problem("AGENT_JSON_INVALID",400);}
   const mapped=planOfficialGeomacroToolCall(raw);
   if(!mapped)return problem("AGENT_TOOL_UNSUPPORTED_OR_INVALID",400);
   // Exact canonical request resource and canonical body; x402 402 challenge,
   // payment replay, evidence/rights, B2/D1, rate and pricing gates are
   // entirely owned by mainnetIntelligenceHandlers.POST.
   const headers=new Headers({"content-type":"application/json"});
   const payment=request.headers.get("payment-signature");
   if(payment)headers.set("payment-signature",payment);
   // Preserve only the edge-provided client network identity used by the
   // original canonical rate limits; never forward arbitrary bearer/cookies.
   const clientIp=request.headers.get("cf-connecting-ip");
   if(clientIp)headers.set("cf-connecting-ip",clientIp);
   const canonical=new Request(
    new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH,request.url),{
     method:"POST",headers,body:JSON.stringify(mapped.query),
   });
   return canonicalPost({request:canonical});
  },
 };
}
