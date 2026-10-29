import {CANONICAL_195_VERSION} from "../src/lib/canonical-country-registry-195";
import {buildCanonical195x3CoverageMatrix} from "../src/lib/canonical-195-country-coverage-matrix";
import {verifyAutomatedFindsSnapshot} from "../src/lib/automated-finds-contract";
import {loadRiskObjectVerificationKeysFromEnv} from "../src/lib/risk-object-signing.server";
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/";
async function boundedPublicJson(path:string,max=300_000){
  const response=await fetch(ROOT+path,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10_000)});
  if(!response.ok||Number(response.headers.get("content-length")??0)>max)throw Error("COUNTRY_RUNTIME_PUBLIC_READ_UNAVAILABLE");
  const raw=await response.text();if(raw.length>max)throw Error("COUNTRY_RUNTIME_READ_TOO_LARGE");return JSON.parse(raw);
}
export async function auditSupabaseFreeCountryRuntime(){
  const [runtime,finds]=await Promise.all([boundedPublicJson("source-runtime",48000),boundedPublicJson("automated-finds")]);
  if(runtime.ok!==true||runtime.schema!=="geomacro.supabase-free-source-runtime-public.v1"||runtime.supabase_requests!==0||
    runtime.chargeable!==false||!Array.isArray(runtime.contexts)||runtime.contexts.length!==3||
    finds.ok!==true||finds.schema!=="geomacro.automated-finds-feed.v1")throw Error("COUNTRY_RUNTIME_PROOF_INVALID");
  await verifyAutomatedFindsSnapshot({schema:"geomacro.automated-finds-snapshot.v1",batches:finds.batches},loadRiskObjectVerificationKeysFromEnv());
  // Registry routing is static; don't claim a per-country first-party source
  // adapter exists merely because a global publisher endpoint responds.
  // Actual adapter/relevance proof is populated only by bounded per-cell probes.
  const matrix=buildCanonical195x3CoverageMatrix();
  return {schema:"geomacro.supabase-free-country-runtime-audit.v1",checked_at:new Date().toISOString(),
    country_registry_version:CANONICAL_195_VERSION,country_count:195,category_count:3,routing_cell_count:585,
    audit_state:"GLOBAL_RUNTIME_READ_VERIFIED",audit_ok:true,
    source_runtime:runtime,automated_finds_categories:finds.batches.map((e:any)=>({category:e.payload.category,
      signed_batch_generated_at:e.payload.generated_at,
      current_24h_count:e.payload.signals.filter((s:any)=>Date.parse(s.published_at)>=Date.now()-86_400_000).length})),
    country_current_evidence_not_inferred_from_global_feeds:true,current_signed_country_delivery_verified_count:0,
    paid_country_readiness_assessed:false,independent_reviewed_products_recovered:false,
    boundaries:{supabase_requests:0,b2_requests:0,payments:0,raw_source_urls_emitted:false,raw_source_material_emitted:false,
      execution_authorized:false},country_category_matrix:matrix};
}
/**
 * Always retain the canonical 195 × 3 diagnostic matrix when the global
 * upstream Worker is unavailable. This is NOT a successful audit and does
 * NOT fill a single country with imaginary source, original or paid evidence.
 * The sanitized cause is deliberately coarse to avoid leaking internals.
 */
export function blockedGlobalCountryReadinessReceipt(checkedAt=new Date()){
  if(!(checkedAt instanceof Date)||!Number.isFinite(checkedAt.getTime()))
    throw Error("COUNTRY_RUNTIME_BLOCKED_RECEIPT_CLOCK_INVALID");
  const matrix=buildCanonical195x3CoverageMatrix();
  return {
    schema:"geomacro.supabase-free-country-runtime-audit.v1",
    checked_at:checkedAt.toISOString(),
    audit_state:"SOURCE_RUNTIME_UNAVAILABLE",
    audit_ok:false,
    canonical_country_count:195,category_count:3,routing_cell_count:585,
    country_registry_version:CANONICAL_195_VERSION,
    source_runtime:null,automated_finds_categories:[],
    country_current_evidence_not_inferred_from_global_feeds:true,
    current_signed_country_delivery_verified_count:0,
    paid_country_readiness_assessed:false,
    independent_reviewed_products_recovered:false,
    blocked_scope:"GLOBAL_SOURCE_READ_NOT_PER_COUNTRY_NEGATIVE_PROOF",
    boundaries:{supabase_requests:0,b2_requests:0,payments:0,
      raw_source_urls_emitted:false,raw_source_material_emitted:false,
      execution_authorized:false},
    country_category_matrix:matrix,
  };
}

if(import.meta.main){
  try{
    const report=await auditSupabaseFreeCountryRuntime();
    await Bun.write("/tmp/global-country-runtime.json",JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify({schema:report.schema,countries:195,routing_cells:585,source_lanes:report.source_runtime.status,
      automated_finds_categories:report.automated_finds_categories,current_signed_country_delivery_verified_count:0,
      paid_country_readiness_assessed:false,supabase_requests:0,payments:0}));
  }catch{
    // Fail the job and leave a complete private diagnostic receipt for the
    // next scheduled retry. Missing upstream reads cannot make a green run.
    const blocked=blockedGlobalCountryReadinessReceipt();
    await Bun.write("/tmp/global-country-runtime.json",
      JSON.stringify(blocked,null,2)+"\n");
    console.error("SUPABASE_FREE_COUNTRY_RUNTIME_AUDIT_UNAVAILABLE");
    process.exitCode=2;
  }
}
