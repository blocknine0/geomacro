// Bounded outside-in GETs only. Never equate candidate availability with launch.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PINNED_ASSETS} from './materialize-web-candidate-assets.mjs';
import {waitForCandidateMarker} from './web-candidate-propagation.mjs';
import {inspectWebCandidateThreeCategoryHealth} from "./web-candidate-three-category-health-gate.mjs";
const base="https://geomacro-web-candidate-isolated.daspallab202391.workers.dev";
const expected=process.env.EXPECTED_CANONICAL_MAIN_SHA;
if(!/^[a-f0-9]{40}$/.test(expected??""))throw Error("CANDIDATE_EXPECTED_SHA_REQUIRED");
async function get(path) {
 const res=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(25000),
  headers:{Accept:"application/json","Cache-Control":"no-cache"}});
 if(res.headers.get("X-Geomacro-Candidate-Mode")!=="read-only-no-funds"){
  // Only an initial 404 for the exact, unpublicized candidate marker may
  // be retried; no request is considered successful without this fence.
  if(path==="/.well-known/geomacro-build.json"&&res.status===404)
   return {res,json:null};
  throw Error("CANDIDATE_READ_ONLY_FENCE_NOT_VERIFIED");
 }
 const json=await res.json();
 return {res,json};
}
const marker=await waitForCandidateMarker(()=>get("/.well-known/geomacro-build.json"),
 expected,{allowInitial404:true});
if(marker.res.status!==200||marker.json.schema_version!=="geomacro.deployment-build.v1"||
 marker.json.canonical_main_sha!==expected||marker.json.production_activation_performed!==false||
 marker.json.candidate_mode!=="read-only-no-funds")throw Error("CANDIDATE_EXACT_SHA_MISMATCH");
for(const asset of PINNED_ASSETS){
 const metadata=JSON.parse(readFileSync(new URL('../../src/assets/'+asset.file+'.asset.json',import.meta.url),'utf8'));
 const res=await fetch(base+metadata.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(res.status!==200||res.headers.get('content-type')?.split(';')[0]!=='image/png'||res.headers.get('X-Geomacro-Candidate-Mode')!=='read-only-no-funds')throw Error('CANDIDATE_PUBLIC_IMAGE_UNAVAILABLE');
 const bytes=Buffer.from(await res.arrayBuffer());
 if(bytes.length!==metadata.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('CANDIDATE_PUBLIC_IMAGE_BYTES_MISMATCH');
}
// Exact-code machine integration acceptance is separate from signed-data
// health. Discovery must be free/read-only with a locked Coinbase rail; only
// POST can ever trigger a quote or payment, and this candidate denies POST.
const machine=await get("/api/v1/intelligence/query");
if(machine.res.status!==200 ||
 machine.json.ok!==true ||
 machine.json.product!=="geomacro_adaptive_risk_intelligence_v1" ||
 machine.json.configured!==false ||
 machine.json.payment_rail_status!=="CONTROLLED_PRELAUNCH_UNAVAILABLE" ||
 machine.json.environment!=="prelaunch" ||
 machine.json.network!==null ||
 machine.json.exact_price_usdc!==null ||
 machine.json.discovery_is_free!==true ||
 machine.json.discovery_proves_current_product!==false ||
 machine.json.no_funds_or_payment_claimed!==true ||
 machine.json.execution_authorized!==false ||
 machine.json.raw_data_delivered!==false ||
 machine.json.source_identity_delivered!==false ||
 machine.json.machine_next_steps?.schemas!=="/api/v1/agent?view=openapi" ||
 machine.json.machine_next_steps?.payable_request!=="/api/v1/intelligence/query" ||
 machine.json.machine_next_steps?.retry_paid_request_automatically!==false ||
 machine.res.headers.has("PAYMENT-REQUIRED") ||
 machine.res.headers.has("PAYMENT-RESPONSE"))
 throw Error("CANDIDATE_MACHINE_DISCOVERY_NO_FUNDS_CONTRACT_INVALID");
const live=await get("/api/health?deep=1&profile=live-structured");
const categories=["geopolitics","macro-fx","critical-minerals"];
const sourceHealth=inspectWebCandidateThreeCategoryHealth(live.res.status,live.json);
if(!sourceHealth.ready){
 // Only a fixed enum/counter diagnostic. Never log upstream source body,
 // original URL, publisher identity, article text or any secret.
 console.error(JSON.stringify(sourceHealth));
 throw Error("CANDIDATE_THREE_CATEGORY_SOURCE_HEALTH_FAILED");
}
const legacy=await get("/api/health?deep=1");
if(![200,503].includes(legacy.res.status)||legacy.json.ok!==(legacy.res.status===200)||
 legacy.json.public_production?.deep_checked!==true)
 throw Error("CANDIDATE_LEGACY_HEALTH_CONTRACT_INVALID");
for(const path of ["/","/intelligence"]){
 const page=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(20000)});
 if(page.status!==200||page.headers.get("X-Geomacro-Candidate-Mode")!=="read-only-no-funds"||
  !(page.headers.get("content-type")??"").includes("text/html"))
  throw Error("CANDIDATE_PUBLIC_PAGE_UNAVAILABLE");
 await page.body?.cancel();
}
console.log(JSON.stringify({schema:"geomacro.web-candidate-readback.v1",canonical_main_sha:expected,
 exact_sha_verified:true,source_categories_accepted:categories.length,
 public_pages_http_200:2,
 public_images_verified:PINNED_ASSETS.length,
 legacy_deep_health_status:legacy.res.status,legacy_signed_products_ready:legacy.json.ok===true,
 deployment_mode:"read-only-no-funds",production_domain_changed:false,
 machine_discovery_http_200:true,machine_payment_rail_locked:true,
 commercial_launch_ready:false,payment_attempts:0}));
