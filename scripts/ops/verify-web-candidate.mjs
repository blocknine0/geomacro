// Bounded outside-in GETs only. Never equate candidate availability with launch.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PINNED_ASSETS} from './materialize-web-candidate-assets.mjs';
const base="https://geomacro-web-candidate.daspallab202391.workers.dev";
const expected=process.env.EXPECTED_CANONICAL_MAIN_SHA;
if(!/^[a-f0-9]{40}$/.test(expected??""))throw Error("CANDIDATE_EXPECTED_SHA_REQUIRED");
async function get(path) {
 const res=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(25000),
  headers:{Accept:"application/json","Cache-Control":"no-cache"}});
 if(res.headers.get("X-Geomacro-Candidate-Mode")!=="read-only-no-funds")
  throw Error("CANDIDATE_READ_ONLY_FENCE_NOT_VERIFIED");
 const json=await res.json();
 return {res,json};
}
const marker=await get("/.well-known/geomacro-build.json");
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
const live=await get("/api/health?deep=1&profile=live-structured");
const categories=["geopolitics","macro-fx","critical-minerals"];
if(live.res.status!==200||live.json.schema!=="geomacro.product-scoped-deep-health.v1"||
 live.json.ok!==true||live.json.x402_payment_authorized!==false||
 live.json.fresh_signed_snapshot_readiness_attested!==false||
 live.json.all_195_countries_fresh_news_verified!==false||
 !Number.isFinite(Date.parse(live.json.checked_at))||
 Date.now()-Date.parse(live.json.checked_at)>120000||
 Date.parse(live.json.checked_at)>Date.now()+5000||
 live.json.legacy_signed_intelligence_gri_risk_indices!=="NOT_EVALUATED_IN_THIS_PROFILE"||
 !categories.every(c=>live.json.categories?.[c]?.source_fetch_accepted===true))
 throw Error("CANDIDATE_THREE_CATEGORY_SOURCE_HEALTH_FAILED");
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
 commercial_launch_ready:false,payment_attempts:0}));
