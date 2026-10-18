// Bounded outside-in GETs only. Never equate candidate availability with launch.
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
const live=await get("/api/health?deep=1&profile=live-structured");
const categories=["geopolitics","macro-fx","critical-minerals"];
if(live.res.status!==200||live.json.schema!=="geomacro.product-scoped-deep-health.v1"||
 live.json.ok!==true||live.json.x402_payment_authorized!==false||
 live.json.fresh_signed_snapshot_readiness_attested!==false||
 live.json.legacy_signed_intelligence_gri_risk_indices!=="NOT_EVALUATED_IN_THIS_PROFILE"||
 !categories.every(c=>live.json.categories?.[c]?.source_fetch_accepted===true))
 throw Error("CANDIDATE_THREE_CATEGORY_SOURCE_HEALTH_FAILED");
const legacy=await get("/api/health?deep=1");
if(![200,503].includes(legacy.res.status)||legacy.json.ok!==(legacy.res.status===200)||
 legacy.json.public_production?.deep_checked!==true)
 throw Error("CANDIDATE_LEGACY_HEALTH_CONTRACT_INVALID");
console.log(JSON.stringify({schema:"geomacro.web-candidate-readback.v1",canonical_main_sha:expected,
 exact_sha_verified:true,source_categories_accepted:categories.length,
 legacy_deep_health_status:legacy.res.status,legacy_signed_products_ready:legacy.json.ok===true,
 deployment_mode:"read-only-no-funds",production_domain_changed:false,
 commercial_launch_ready:false,payment_attempts:0}));
