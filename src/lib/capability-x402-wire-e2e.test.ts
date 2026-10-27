import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
// @ts-expect-error Worker JavaScript runtime has no declarations; exercised through its real fetch contract.
import worker,{CommerceLedger} from "../../workers/commerce-ledger/src/index.mjs";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";
import {commerceFingerprint,commerceSha256} from "./agent-commerce-delivery.server";
import {computeGeomacroIntelligenceProductHash,GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA as SCHEMA} from "./geomacro-intelligence-contract";
import {prepareVerifiedCapabilityOffer,assertFrozenCapabilityCurrentForSettlement} from "./capability-x402-offer.server";
import {buildAgentQueryPlan} from "./agent-query-plan";
import {mainnetIntelligenceHandlers} from "./mainnet-intelligence-endpoint.server";
import {Route} from "../routes/api.x402.circle_.intelligence";
import {retainQualifiedStructuralEvidence} from "./agent-query-qualified-evidence.server";
import {GEOMACRO_STORE_REQUEST_EXAMPLES} from "./store-product-examples";
import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";

const mock=vi.hoisted(()=>({assemble:vi.fn(),availability:vi.fn(),coinbaseVerify:vi.fn(),coinbaseSettle:vi.fn(),circleVerify:vi.fn(),circleSettle:vi.fn()}));
const PAYEE="0x"+"1".repeat(40),ASSET="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",TX="0x"+"a".repeat(64);
const baseConfig={environment:"production",commercialEnvironment:"mainnet",network:"eip155:8453",networkName:"Base",chainId:"8453",asset:ASSET,payTo:PAYEE,priceUsdc:"0.05",amountAtomic:"50000",apiKeyId:"test-only",apiKeySecret:"test-only"};
vi.mock("./coinbase-x402.server",async original=>({...await original<typeof import("./coinbase-x402.server")>(),
  getCoinbaseX402Config:()=>baseConfig,verifyCoinbaseX402:(...args:unknown[])=>mock.coinbaseVerify(...args),
  settleCoinbaseX402:(...args:unknown[])=>mock.coinbaseSettle(...args),persistCoinbaseSettlementTelemetry:async()=>{},
}));
vi.mock("./circle-gateway-x402-production.server",async original=>({...await original<typeof import("./circle-gateway-x402-production.server")>(),
  getCircleGatewayProductionConfig:()=>({environment:"production",sellerAddress:PAYEE,priceUsdc:"0.05",networks:["eip155:8453"]}),
  getCircleGatewayProductionRequirement:async()=>({scheme:"exact",network:"eip155:8453",asset:ASSET,payTo:PAYEE,amount:"50000",maxTimeoutSeconds:60}),
  verifyCircleGatewayProduction:(...args:unknown[])=>mock.circleVerify(...args),settleCircleGatewayProduction:(...args:unknown[])=>mock.circleSettle(...args),
}));
vi.mock("./agent-query-response.server",()=>({assembleAgentQueryResponse:(...args:unknown[])=>mock.assemble(...args)}));
vi.mock("./agent-query-deliverability.server",async original=>({...await original<typeof import("./agent-query-deliverability.server")>(),checkAgentQueryDeliverability:(...args:unknown[])=>mock.availability(...args)}));
vi.mock("./public-demo-rate-limit.server",()=>({allowPublicDemoRequest:()=>true}));
vi.mock("./coinbase-x402-product-audit.server",()=>({upsertCoinbaseX402ProductAudit:async()=>{}}));
vi.mock("./coinbase-x402-usage-guard.server",()=>({reserveCoinbaseX402AgentUsage:async()=>({disposition:"RESERVED",enforced:false}),finalizeCoinbaseX402AgentUsage:async()=>{},releaseCoinbaseX402AgentUsage:async()=>{}}));
vi.mock("./commercial-ops.server",()=>({recordCommercialPaymentEvent:async()=>null,recordCommercialUsageEvent:async()=>null}));
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=> (options:unknown)=>options}));

const query={fulfillment_mode:"published_only",delivery_tier:"structural_baseline",subjects:[{type:"country",country_iso3:"USA"}],topics:["critical_minerals"],detail:"compact"};
const circlePost=(Route as unknown as {server:{handlers:{POST:typeof mainnetIntelligenceHandlers.POST}}}).server.handlers.POST;
const handlers={coinbase:mainnetIntelligenceHandlers.POST,circle:circlePost};
function availability(plan:any):AgentQueryDeliverability {
  const value:AgentQueryDeliverability={deliverable:true,code:"AVAILABLE",query_plan_hash:plan.query_plan_hash,checked_at:new Date().toISOString(),missing_modules:[],stale_modules:[],ineligible_source_ids:[],source_contracts:[{source_id:"PRIVATE_TEST_ONLY",commercial_usage_status:"DERIVED_ONLY",raw_redistribution_allowed:false,attribution_required:false,licence_name:null}],subjects:[{subject:plan.subjects[0],status:"AVAILABLE",available_modules:plan.required_modules,latest_evidence_at:"2025-12-31T23:59:59.000Z",required_source_ids:["PRIVATE_TEST_ONLY"],governed_fallback_modules:[]}]};
  if(plan.product)retainQualifiedStructuralEvidence(value,plan,plan.subjects.map((subject:any)=>({worldBank:{},context:{status:"AVAILABLE",subject,
    observations:plan.required_modules.flatMap((dimension:string)=>(subject.type==="country"?[subject.country_iso3]:[subject.origin_country_iso3,subject.destination_country_iso3]).map((country_iso3:string)=>({
      country_iso3,dimension,value_numeric:1,observed_at:"2026-10-17T12:00:00Z",normalized_hash:"a".repeat(64),provenance:{},
    }))),metadata:{composition_method:"ENDPOINT_COMPOSED_V0_1",route_modeling_status:"NOT_MODELED"}}})),new Date().toISOString());
  return value;
}
function prepared({plan,requestId,clientRequestId,priceUsdc}:any) {
  const core={schema_version:SCHEMA,product:"geomacro_adaptive_risk_intelligence_v1",request_id:requestId,client_request_id:clientRequestId,query_plan_hash:plan.query_plan_hash,subjects:plan.subjects,
    as_of:"2026-10-18T14:01:00.000Z",
    question_interpretation:{delivery_tier:"structural_baseline",...(plan.product?{product:plan.product}:{})},analysis:{type:"single_subject"},
    // ONLY synthetic governed module fixtures, never real article text or
    // a fabricated production certification. Buyer gate must reject [].
    structural:plan.subjects.map((subject:any)=>({
      subject, serving:{composition_method:"ENDPOINT_COMPOSED_V0_1",route_modeling_status:"NOT_MODELED"},intelligence:Object.fromEntries(plan.required_modules.map((module:string)=>[
        module,{observations:(subject.type==="country"?[subject.country_iso3]:[subject.origin_country_iso3,subject.destination_country_iso3]).map((country_iso3:string)=>({country_iso3,value_numeric:1,observed_at:"2025-12-31T23:59:59.000Z"})),coverage:[]}
      ])), evidence_summary:{observation_count:1,available_dimensions:plan.required_modules,
        latest_observed_at:"2025-12-31T23:59:59.000Z"}
    })),hot_topics:[],risk_gate:[],signed_risk_objects:[],gri_context:null,current_state:plan.product?plan.subjects.map((subject:any)=>({subject,structural:{observation_count:plan.required_modules.length,latest_observed_at:"2025-12-31T23:59:59.000Z"}})):[],
    change_intelligence:[{schema_version:"geomacro.change-intelligence.v1",delivery_boundary:"STRUCTURED_DERIVED_CHANGE_INTELLIGENCE_ONLY",raw_data_delivered:false,execution_authorized:false,refresh_hint:{strategy:"SOURCE_NATIVE_CADENCE_OR_STATE_CHANGE",recommended_not_before_seconds:900},state_version:"gstate_test"}],
    decision_intelligence:[{schema_version:"geomacro.decision-intelligence.v1",delivery_boundary:"DERIVED_DECISION_INTELLIGENCE_ONLY",raw_data_delivered:false,execution_authorized:false,cause:"Geomacro detects this because comparable annual estimates differ.",geomacro_detected:[],watch_next:[],decision:{execution_authorized:false}}],
    answer:{summary:"Synthetic test-only annual structured output; never production evidence."},methodology:{response_schema_version:SCHEMA,customer_facing_output:"decision_intelligence_v1",price_usdc:priceUsdc,signed_current_risk_object_included:false},limitations:{execution_authorized:false},execution_authorized:false};
  return {...core,delivered_product_hash:computeGeomacroIntelligenceProductHash(core)};
}
const stores=new Map<string,Map<string,any>>(),ledgers=new Map<string,any>();
const requests:{action:string;body:any}[]=[];
const TOKEN="unit-test-only-"+"t".repeat(32);
function ledger(name:string) {
  if(ledgers.has(name))return ledgers.get(name);
  const map=new Map();stores.set(name,map);
  const txn={get:async(k:string)=>structuredClone(map.get(k)),put:async(k:string,v:any)=>map.set(k,structuredClone(v)),delete:async(k:string)=>map.delete(k),list:async({prefix,limit}:any)=>new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit))};
  const value=new CommerceLedger({storage:{...txn,transaction:async(cb:any)=>cb(txn)}},{});ledgers.set(name,value);return value;
}
function call(rail:keyof typeof handlers,payment?:any,body:any=query) {
  return handlers[rail]({request:new Request("https://geomacro.live/api/v1/intelligence/query",{method:"POST",headers:{"content-type":"application/json",...(payment?{"payment-signature":Buffer.from(JSON.stringify(payment)).toString("base64")}: {})},body:JSON.stringify(body)})});
}
async function offer(rail:keyof typeof handlers,body:any=query) {
  const res=await call(rail,undefined,body);expect(res.status).toBe(402);
  const doc=JSON.parse(Buffer.from(res.headers.get("PAYMENT-REQUIRED")!,"base64").toString());
  const amount=body.product?resolveGeomacroCapabilityPrice(body.product.capability,body.product.variant).amount_atomic:"20000";
  expect(doc.accepts[0].amount).toBe(amount);
  const quote=doc.extensions.geomacro.info.capability_quote;
  return {quote,payment:{x402Version:2,accepted:doc.accepts[0],extensions:doc.extensions,payload:{signature:"0x"+"11".repeat(65),authorization:{from:"0x"+"2".repeat(40),to:PAYEE,value:amount,validAfter:"0",validBefore:"9999999999",nonce:"0x"+"00".repeat(32)}}}};
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-18T14:01:00Z"));vi.clearAllMocks();stores.clear();ledgers.clear();requests.length=0;
  vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_BACKEND","durable_object");vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_URL","https://test-ledger.invalid");vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN",TOKEN);vi.stubEnv("COINBASE_X402_ENVIRONMENT","production");
  mock.assemble.mockImplementation(prepared);mock.availability.mockImplementation(availability);
  mock.coinbaseVerify.mockResolvedValue({isValid:true,payer:"0x"+"2".repeat(40)});mock.coinbaseSettle.mockResolvedValue({success:true,transaction:TX,network:"eip155:8453"});
  mock.circleVerify.mockResolvedValue({valid:true,payer:"0x"+"2".repeat(40)});mock.circleSettle.mockResolvedValue({settlement_reference:TX,payer:"0x"+"2".repeat(40),network:"eip155:8453"});
  vi.stubGlobal("fetch",async(url:string,init:RequestInit)=>{
    if(!String(url).startsWith("https://test-ledger.invalid/"))throw Error("UNEXPECTED_EXTERNAL_NETWORK");
    const body=JSON.parse(String(init.body));requests.push({action:String(url).split("/").at(-1)!,body});
    expect(init.redirect).toBe("error");expect(init.cache).toBe("no-store");
    return worker.fetch(new Request(url,init),{LEDGER_SHARED_TOKEN:TOKEN,COMMERCE_LEDGER:{idFromName:(n:string)=>n,get:(n:string)=>({fetch:(url:string,init:RequestInit)=>ledger(n).fetch(new Request(url,init))})}});
  });
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

it("qualifies a synthetic structural response through the actual authenticated Worker protocol",async()=>{
  const plan=buildAgentQueryPlan(query);
  const value=await prepareVerifiedCapabilityOffer({plan,availability:availability(plan),clientRequestId:null,
    requestFingerprint:"a".repeat(64),rail:"coinbase_x402",network:"eip155:8453",asset:ASSET,recipient:PAYEE});
  expect(value.quote.prepared_answer_sha256).toBe(value.frozen.sha256);
});

it("a quote cannot extend a signed object's earlier expiry",()=>{
  const response={signed_risk_objects:[{object:{expires_at:"2026-10-18T14:02:00Z"}}]};
  expect(()=>assertFrozenCapabilityCurrentForSettlement(response,Date.parse("2026-10-18T14:01:59Z"))).not.toThrow();
  expect(()=>assertFrozenCapabilityCurrentForSettlement(response,Date.parse("2026-10-18T14:02:00Z"))).toThrow("CAPABILITY_SIGNED_PROOF_EXPIRED");
});

for(const rail of ["coinbase","circle"] as const)describe(`${rail}: actual handlers + Worker, synthetic source/provider fixtures, no funds`,()=>{
 it.each(["country_digest","corridor_digest","country_profile","corridor_profile"] as const)("delivers and replays exact %s Store bytes with one settlement",async id=>{
   const body=GEOMACRO_STORE_REQUEST_EXAMPLES[id],{quote,payment}=await offer(rail,body);
   expect(quote.capability).toBe(body.product.capability);
   expect(quote.variant).toBe(body.product.variant);
   const bytes=requests.find(x=>x.action==="capability-prequote-freeze")!.body.customerBytes;
   expect(commerceSha256(bytes)).toBe(quote.prepared_answer_sha256);
   const delivered=await call(rail,payment,body);expect(delivered.status).toBe(200);expect(delivered.headers.get("X-Geomacro-Brand")).toBe("Geomacro");expect(await delivered.text()).toBe(bytes);
   mock.availability.mockRejectedValue(Error("SOURCE_NOW_UNAVAILABLE"));
   const replay=await call(rail,payment,body);expect(replay.status).toBe(200);expect(replay.headers.get("X-Geomacro-Brand")).toBe("Geomacro");expect(await replay.text()).toBe(bytes);
   expect(rail==="coinbase"?mock.coinbaseSettle:mock.circleSettle).toHaveBeenCalledTimes(1);
 });
 it("does not freeze or quote a digest missing its advertised dimension coverage",async()=>{
  mock.assemble.mockImplementation((input:any)=>{
    const payload=prepared(input);
    for(const row of payload.structural)delete row.evidence_summary.available_dimensions;
    return {...payload,delivered_product_hash:computeGeomacroIntelligenceProductHash(payload)};
  });
  expect((await call(rail)).status).toBe(422);
  expect(requests.some(x=>x.action==="capability-prequote-freeze")).toBe(false);
  expect(mock.coinbaseVerify).not.toHaveBeenCalled();expect(mock.circleVerify).not.toHaveBeenCalled();
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
 });
 it("binds 402 to exact delivered bytes and replays after expiry without current source access or a second settlement",async()=>{
  const {quote,payment}=await offer(rail);
  expect(requests.filter(x=>x.action==="capability-prequote-readback")).toHaveLength(2);
  expect(mock.coinbaseVerify).not.toHaveBeenCalled();expect(mock.circleVerify).not.toHaveBeenCalled();
  const bytes=requests.find(x=>x.action==="capability-prequote-freeze")!.body.customerBytes;
  expect(commerceSha256(bytes)).toBe(quote.prepared_answer_sha256);expect(bytes).not.toContain("PRIVATE_TEST_ONLY");
  const res=await call(rail,payment);expect(res.status).toBe(200);expect(await res.text()).toBe(bytes);
  expect(res.headers.get("X-Geomacro-Delivery-SHA256")).toBe(quote.prepared_answer_sha256);expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  expect(mock.assemble).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));mock.availability.mockRejectedValue(Error("SOURCE_NOW_EXPIRED"));mock.assemble.mockRejectedValue(Error("MUST_NOT_REASSEMBLE"));
  const replay=await call(rail,payment);expect(replay.status).toBe(200);expect(await replay.text()).toBe(bytes);
  expect(rail==="coinbase"?mock.coinbaseSettle:mock.circleSettle).toHaveBeenCalledTimes(1);
 });
 it("never charges for empty, wrong-country, undated or missing priced structural modules",async()=>{
   const cases=[
     (r:any)=>({...r,structural:[]}),
     (r:any)=>({...r,structural:[{...r.structural[0],subject:{type:"country",country_iso3:"CAN"}}]}),
     (r:any)=>({...r,structural:[{...r.structural[0],intelligence:{}}]}),
     (r:any)=>({...r,structural:[{...r.structural[0],intelligence:{
       critical_minerals:{observations:[],coverage:[]}}}]}),
     (r:any)=>({...r,structural:[{...r.structural[0],evidence_summary:{
       ...r.structural[0].evidence_summary,latest_observed_at:null}}]}),
     (r:any)=>({...r,methodology:{...r.methodology,price_usdc:"0.01"}}),
   ];
   for(const corrupt of cases){
     stores.clear();ledgers.clear();requests.length=0;
     mock.assemble.mockImplementation((args:any)=>corrupt(prepared(args)));
     const response=await call(rail);
     expect(response.status).not.toBe(402);
     expect(response.status).toBeGreaterThanOrEqual(400);
     expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
     expect(requests.some(x=>x.action==="capability-prequote-freeze")).toBe(false);
     expect(mock.coinbaseSettle).not.toHaveBeenCalled();
     expect(mock.circleSettle).not.toHaveBeenCalled();
   }
 });
 it("rejects nested raw upstream material before creating any real x402 402 offer",async()=>{
  mock.assemble.mockImplementation((args:any)=>{
    const clean=prepared(args);
    return {...clean,analysis:{...clean.analysis,
      raw_html:"<article>synthetic upstream-only fixture</article>",
      upstream_payload:{raw_count:123}}};
  });
  const res=await call(rail);
  expect(res.status).toBe(422);
  expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
  expect(mock.coinbaseVerify).not.toHaveBeenCalled();
  expect(mock.circleVerify).not.toHaveBeenCalled();
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();
  expect(mock.circleSettle).not.toHaveBeenCalled();
  expect(requests.some(x=>x.action==="capability-prequote-freeze")).toBe(false);
 });
 it("rejects amount, frozen hash and request mutation without provider verification or settlement",async()=>{
  const {payment}=await offer(rail);
  for(const mutate of [(p:any)=>{p.accepted.amount="50000";},(p:any)=>{p.extensions.geomacro.info.capability_quote.prepared_answer_sha256="f".repeat(64);}]) {
    const bad=structuredClone(payment);mutate(bad);expect((await call(rail,bad)).status).toBeGreaterThanOrEqual(400);
  }
  expect((await call(rail,payment,{...query,client_request_id:"different-request"})).status).toBe(409);
  expect(mock.coinbaseVerify).not.toHaveBeenCalled();expect(mock.circleVerify).not.toHaveBeenCalled();expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
 });
 it("expiry at the final irreversible boundary releases without settlement",async()=>{
  const {payment}=await offer(rail);
  const verify=rail==="coinbase"?mock.coinbaseVerify:mock.circleVerify;
  verify.mockImplementation(async()=>{vi.setSystemTime(new Date("2026-10-18T14:06:00Z"));return {isValid:true,valid:true};});
  expect((await call(rail,payment)).status).toBe(409);
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
  expect(requests.some(x=>x.action==="release"&&x.body.failureCode==="CAPABILITY_QUOTE_EXPIRED_BEFORE_SETTLEMENT")).toBe(true);
 });
 it("does not settle a provider-rejected authorization",async()=>{
  const {payment}=await offer(rail);
  (rail==="coinbase"?mock.coinbaseVerify:mock.circleVerify).mockResolvedValue({isValid:false,valid:false});
  expect((await call(rail,payment)).status).toBe(402);
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
 });
 it("holds ambiguous settlement against automatic re-charge",async()=>{
  const {payment}=await offer(rail);const settle=rail==="coinbase"?mock.coinbaseSettle:mock.circleSettle;
  settle.mockRejectedValue(Error("TRANSPORT_UNKNOWN_AFTER_SETTLE"));
  expect((await call(rail,payment)).status).toBe(503);
  expect((await call(rail,payment)).status).toBe(503);expect(settle).toHaveBeenCalledTimes(1);
 });
 it("rejects a corrupt frozen answer and an independently corrupt delivered ledger record",async()=>{
  const {payment}=await offer(rail);
  for(const map of stores.values()) for(const [key,value] of map) if(key.startsWith("capability-prequote:")) {
    value.customerBytes+=" ";map.set(key,value);
  }
  expect((await call(rail,payment)).status).toBe(402);
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
  stores.clear();ledgers.clear();const fresh=await offer(rail);
  expect((await call(rail,fresh.payment)).status).toBe(200);
  for(const map of stores.values())for(const [key,value]of map)if(value.state==="delivered") {
    value.responsePayload.answer.summary="Changed after purchase";
    value.responseSha256=commerceFingerprint(value.responsePayload);map.set(key,value);
  }
  expect((await call(rail,fresh.payment)).status).toBe(409);
  expect(rail==="coinbase"?mock.coinbaseSettle:mock.circleSettle).toHaveBeenCalledTimes(1);
 });
 it("rejects revoked or missing final evidence after provider verification without settlement",async()=>{
  const {payment}=await offer(rail);
  const verify=rail==="coinbase"?mock.coinbaseVerify:mock.circleVerify;
  verify.mockImplementation(async()=>{mock.availability.mockImplementation((p:any)=>({...availability(p),deliverable:false,code:"STALE_REQUIRED_DATA"}));return {isValid:true,valid:true};});
  expect((await call(rail,payment)).status).toBeGreaterThanOrEqual(400);
  expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
 });
 it("does not quote missing evidence or a failed independent vault readback",async()=>{
  mock.availability.mockImplementation((plan:any)=>({...availability(plan),deliverable:false,code:"INSUFFICIENT_COVERAGE"}));
  expect((await call(rail)).status).toBe(422);expect(mock.assemble).not.toHaveBeenCalled();
  mock.availability.mockImplementation(availability);
  const priorFetch=globalThis.fetch;
  vi.stubGlobal("fetch",async(url:any,init:any)=>String(url).endsWith("readback")?Response.json({ok:true,customerBytes:"{}"}):priorFetch(url,init));
  expect((await call(rail)).status).toBe(422);expect(mock.coinbaseSettle).not.toHaveBeenCalled();expect(mock.circleSettle).not.toHaveBeenCalled();
 });
});
