import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {diagnoseFailedX402MainHealth} from "../../scripts/ops/verify-failed-health-x402-no-funds.mjs";

const health={ok:false,production_data_runtime_configured:true,public_production:{
 hot_snapshot_serving:{intelligence:{ok:false},global_risk:{ok:false},risk_indices:{ok:false}},
},x402:{state:"controlled_prelaunch"}};
const discovery={status:"prelaunch",productionFundsAuthorized:false,resources:[]};
const denied={ok:false,chargeable:false,payment_required_now:false,
 execution_authorized:false,availability:{code:"STALE_REQUIRED_DATA",deliverable:false},
 source_url:"https://private.invalid/UNSAFE",raw_article:"NEVER_OUTPUT_RAW_NEWS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,
 headers:{"content-type":"application/json"}});
function fixture({
 h=health,d=discovery,a=denied,status=422,
}: {h?:unknown,d?:unknown,a?:unknown,status?:number}={}){
 const seen:{url:string,method:string,body?:BodyInit|null}[]=[];
 const fetchImpl=vi.fn(async(url:string,init:RequestInit)=>{
  seen.push({url,method:init.method??"GET",body:init.body});
  expect(init.redirect).toBe("error");
  expect(init.headers).not.toHaveProperty("Authorization");
  expect(init.headers).not.toHaveProperty("PAYMENT-SIGNATURE");
  if(url==="https://geomacro.live/api/health?deep=1")return reply(h,503);
  if(url==="https://geomacro.live/.well-known/x402.json")return reply(d);
  if(url==="https://geomacro.live/api/x402/risk/availability")return reply(a,status);
  throw Error("ONLY_FIXED_PUBLIC_ENDPOINTS");
 });
 return {fetchImpl,seen};
}
describe("#1827 independent x402 negative production health proof",()=>{
 it("produces a safe RED receipt on public stale data and strict no-charge denial",async()=>{
  const {fetchImpl,seen}=fixture();
  const receipt=await diagnoseFailedX402MainHealth({fetchImpl,
   nowMs:Date.parse("2026-10-10T10:06:00Z")});
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(seen.map(x=>x.url).sort()).toEqual([
   "https://geomacro.live/.well-known/x402.json",
   "https://geomacro.live/api/health?deep=1",
   "https://geomacro.live/api/x402/risk/availability",
  ]);
  const post=seen.find(x=>x.method==="POST");
  expect(post?.url).toBe("https://geomacro.live/api/x402/risk/availability");
  expect(JSON.parse(String(post?.body))).toMatchObject({
   topics:["risk_object"],subjects:[{type:"country",country_iso3:"USA"}],
   evidence:"required",
  });
  expect(receipt).toMatchObject({
   health_http_status:503,availability_http_status:422,
   discovery_prelaunch_no_resources:true,
   availability_safe_no_charge:true,
   negative_safety_boundary_verified:true,
   availability_denial_code:"STALE_REQUIRED_DATA",
   all_current_hot_products_verified:false,independent_commercial_acceptance:false,
   live_x402_prod_earning_authorized:false,real_funds_touched:false,
   external_payment_executed:false,source_urls_returned:false,
   raw_news_or_source_exposed:false,b2_requests:0,d1_writes:0,model_calls:0,
  });
  expect(JSON.stringify(receipt)).not.toMatch(/NEVER_OUTPUT_RAW_NEWS|private.invalid/);
 });
 it("never treats mainnet, 402, execution or paid resources as proven safe",async()=>{
  for(const arg of [
   {a:{...denied,payment_required_now:true}},
   {a:{...denied,execution_authorized:true}},
   {a:{...denied,availability:{code:"AVAILABLE",deliverable:true}},status:200},
   {a:denied,status:402},
   {d:{...discovery,productionFundsAuthorized:true}},
   {d:{...discovery,resources:[{path:"/paid"}]}},
   {h:{...health,ok:true}},
  ]){
   const {fetchImpl}=fixture(arg);
   const receipt=await diagnoseFailedX402MainHealth({fetchImpl});
   expect(receipt.negative_safety_boundary_verified).toBe(false);
   expect(receipt.independent_commercial_acceptance).toBe(false);
  }
 });
 it("fails closed when all upstream responses are malformed",async()=>{
  const fetchImpl=vi.fn(async()=>new Response("<script>SECRET DO NOT LOG</script>",{
   status:503,headers:{"content-type":"text/html"},
  }));
  const receipt=await diagnoseFailedX402MainHealth({fetchImpl});
  expect(receipt.negative_safety_boundary_verified).toBe(false);
  expect(JSON.stringify(receipt)).not.toContain("SECRET DO NOT LOG");
 });
 it("does not re-enable settled x402 or bypass production website health",()=>{
  const workflow=readFileSync(".github/workflows/live-x402-prelaunch-availability.yml","utf8");
  const code=readFileSync("scripts/ops/verify-failed-health-x402-no-funds.mjs","utf8");
  expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
  expect(workflow).toContain("failed-health-no-funds:");
  expect(workflow).toContain("github.event.workflow_run.conclusion != 'success'");
  expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
  expect(workflow).toContain("ref: $"+ "{{ github.event.workflow_run.head_sha }}");
  expect(workflow).toContain("node scripts/ops/verify-failed-health-x402-no-funds.mjs");
  expect(code).toContain("process.exitCode=3");
  expect(code).not.toContain("B2_APPLICATION_KEY");
  expect(code).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(code).not.toContain("payment_signature");
 });
});
