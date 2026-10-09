// #1827: outside-in B2/D1 public health diagnosis. Strictly read-only, no
// Supabase credentials, B2 SDK calls, x402 payment or raw data output.
// This is diagnostic evidence, NOT a health-gate bypass or publication.
import { writeFileSync, mkdirSync } from "node:fs";

const SITE_URL = "https://geomacro.live";
const D1_URL = "https://geomacro-control-plane.daspallab202391.workers.dev";
const PRODUCTS = Object.freeze(["intelligence", "global-risk", "risk-indices"]);
const SAFE_ERRORS = new Set([
  "HOT_SNAPSHOT_UNAVAILABLE","HOT_SNAPSHOT_STALE_OR_INVALID",
  "HOT_SNAPSHOT_HASH_MISMATCH","HOT_SNAPSHOT_INVALID",
  "HOT_SNAPSHOT_GLOBAL_RISK_CURRENT_PROOF_INVALID",
  "D1_UNAVAILABLE","D1_BINDING_MISSING","D1_SCHEMA_NOT_READY",
  "HOT_SNAPSHOT_NOT_FOUND","CONTROL_PLANE_FAILURE",
  "INTELLIGENCE_OVERLAY_STALE_OR_INVALID",
]);
const SAFE_PROOF_MODES = new Set([
  "direct-b2-readback","independent-gri-proof-over-b2-baseline",
]);
function safeTime(value, now) {
  if (typeof value !== "string" || value.length > 40) return null;
  const ms=Date.parse(value);
  if (!Number.isFinite(ms) || ms > now + 5*60_000 || now-ms > 366*86400_000) return null;
  return new Date(ms).toISOString();
}
function ageMinutes(timestamp,now) {
  return timestamp === null ? null : Math.max(0,Math.floor((now-Date.parse(timestamp))/60_000));
}
async function onlyPublicJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method:"GET",
      headers: { Accept:"application/json", "Cache-Control":"no-cache" },
      redirect:"error",
      signal:AbortSignal.timeout(12_000),
    });
  } catch {
    return {http_status:0,body:null,transport_error:true};
  }
  if (!Number.isInteger(response?.status)) {
    return {http_status:0,body:null,transport_error:true};
  }
  let parsed=null;
  try {
    const raw=await response.text();
    if (raw.length <= 2_000_000) {
      const candidate=JSON.parse(raw);
      if (candidate && typeof candidate==="object" && !Array.isArray(candidate)) parsed=candidate;
    }
  } catch { /* preserve HTTP status without leaking payload */ }
  return {http_status:response.status,body:parsed,transport_error:false};
}
function siteView(result,now) {
  const p=result.body?.public_production;
  const hot=p?.hot_snapshot_serving;
  const hotKeys=["intelligence","global_risk","risk_indices"];
  return {
    http_status:result.http_status,
    ok:result.body?.ok===true,
    deep_checked:p?.deep_checked===true,
    b2_configured:p?.b2_runtime_configured===true,
    intelligence_ready:p?.intelligence_ready===true,
    global_risk_ready:p?.global_risk_ready===true,
    risk_indices_ready:p?.risk_indices_ready===true,
    supabase_required_for_serving:p?.supabase_required_for_serving===false,
    hot_snapshot_proofs: Object.fromEntries(hotKeys.map(k=>[k,
      hot?.[k]?.ok===true && hot?.[k]?.serving_store==="cloudflare-d1"])),
    snapshot_source_times: Object.fromEntries(hotKeys.map(k=>[k,
      safeTime(hot?.[k]?.source_as_of,now)])),
    public_serving_claim_verified:
      p?.serving_authority==="backblaze-b2-durable-truth-cloudflare-d1-verified-hot",
  };
}
function snapshotView(result,now) {
  const b=result.body ?? {};
  const sourceAsOf=safeTime(b.source_as_of,now);
  const expiresAt=safeTime(b.expires_at,now);
  const ok=result.http_status===200 && b.ok===true &&
    sourceAsOf!==null && expiresAt!==null &&
    Date.parse(expiresAt)>now &&
    SAFE_PROOF_MODES.has(String(b.verification_mode??"")) &&
    b.serving_store==="cloudflare-d1" &&
    b.archive_store===undefined; // never assume private archive metadata
  return {
    http_status:result.http_status,
    ok,
    diagnostic_only:true,
    error:SAFE_ERRORS.has(b.error)?b.error:null,
    source_as_of:sourceAsOf,
    age_minutes:ageMinutes(sourceAsOf,now),
    expires_at:expiresAt,
    expired:expiresAt!==null && Date.parse(expiresAt)<=now,
    verification_mode:SAFE_PROOF_MODES.has(b.verification_mode)?b.verification_mode:null,
  };
}
export async function diagnosePublicHotServing({
  fetchImpl=fetch, nowMs=Date.now(),
}={}) {
  if (!Number.isFinite(nowMs)) throw new Error("DIAGNOSTIC_TIME_INVALID");
  // Each read is GET to an allowlisted public endpoint. Never request B2
  // archival bytes or private D1 account status and never mutate state.
  const urls=[
    SITE_URL+"/api/health?deep=1",
    D1_URL+"/health",
    ...PRODUCTS.map(p=>D1_URL+"/v1/public/hot-snapshot/"+p),
  ];
  const results=await Promise.all(urls.map(url=>onlyPublicJson(url,fetchImpl)));
  const site=siteView(results[0],nowMs);
  const d1={
    http_status:results[1].http_status,
    ok:results[1].body?.ok===true &&
      results[1].body?.store==="d1" &&
      Number(results[1].body?.schema_version)>=5,
    schema_version:Number.isInteger(Number(results[1].body?.schema_version))
      ?Number(results[1].body.schema_version):null,
  };
  const products=Object.fromEntries(PRODUCTS.map((p,i)=>[
    p,snapshotView(results[i+2],nowMs),
  ]));
  const failing=PRODUCTS.filter(p=>!products[p].ok);
  const siteHealthy=site.http_status===200 && site.ok && site.deep_checked &&
    site.b2_configured && site.intelligence_ready &&
    site.global_risk_ready && site.risk_indices_ready &&
    site.supabase_required_for_serving && site.public_serving_claim_verified &&
    Object.values(site.hot_snapshot_proofs).every(Boolean);
  const rootCodes=[];
  if (!d1.ok) rootCodes.push("D1_CONTROL_PLANE_UNAVAILABLE");
  if (failing.length) rootCodes.push("D1_PUBLIC_HOT_SNAPSHOT_UNAVAILABLE");
  if (site.http_status===503) rootCodes.push("PUBLIC_DEEP_HEALTH_503");
  if (site.http_status===0) rootCodes.push("PUBLIC_SITE_TRANSPORT_UNAVAILABLE");
  if (!site.b2_configured) rootCodes.push("PUBLIC_B2_RUNTIME_UNCONFIGURED_OR_UNOBSERVED");
  if (site.ok && !siteHealthy) rootCodes.push("PUBLIC_HEALTH_CONTRACT_INCOMPLETE");
  if (!siteHealthy && !rootCodes.length) rootCodes.push("PUBLIC_SITE_HEALTH_NOT_ACCEPTED");
  return {
    schema:"geomacro.public-serving-readonly-diagnostic.v1",
    checked_at:new Date(nowMs).toISOString(),
    ok:siteHealthy && d1.ok && failing.length===0,
    site,d1,products,
    unavailable_products:failing,
    failure_codes:rootCodes,
    // Explicit negative proofs: nothing here can be used to clear paid readiness.
    b2_private_archive_reads:0,
    supabase_network_attempts:0,
    external_payment_performed:false,
    production_mutation_performed:false,
    commercial_eligibility_verified:false,
  };
}
if (process.argv[1]?.endsWith("/diagnose-public-hot-serving.mjs")) {
  const result=await diagnosePublicHotServing();
  mkdirSync("artifacts/public-serving",{recursive:true});
  writeFileSync("artifacts/public-serving/diagnostic.json",
    JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({
    schema:result.schema,ok:result.ok,
    site_status:result.site.http_status,d1_status:result.d1.http_status,
    d1_schema_version:result.d1.schema_version,
    public_domain_ready:{
      geopolitics:result.site.intelligence_ready,
      macro_fx:result.site.intelligence_ready,
      critical_minerals:result.site.intelligence_ready,
    },
    unavailable_products:result.unavailable_products,
    products:Object.fromEntries(Object.entries(result.products).map(([k,v])=>[
      k,{status:v.http_status,error:v.error,source_as_of:v.source_as_of,
        age_minutes:v.age_minutes,expired:v.expired},
    ])),
    failure_codes:result.failure_codes,
    external_payment_performed:false,
    commercial_eligibility_verified:false,
  }));
  if (!result.ok) process.exitCode=2;
}
