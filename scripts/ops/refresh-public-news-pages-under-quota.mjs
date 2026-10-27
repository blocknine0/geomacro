#!/usr/bin/env node
/**
 * Owner-only public-page refresh. Reuses existing protected backstop schedule,
 * no new cron/source fetch/D1 news write/B2/paid services.
 */
import {createHmac} from "node:crypto";
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const STATES=new Set(["MATERIALIZED_COMMIT_VERIFIED","MATERIALIZED_ALREADY_CURRENT"]);
export async function refreshBoundedPublicNewsPages({fetchImpl=fetch,env=process.env}={}){
 const secret=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 if(secret.length<32)throw Error("PUBLIC_PAGE_REFRESH_OWNER_TOKEN_MISSING");
 const token=createHmac("sha256",secret).update("geomacro-control-plane-v1").digest("hex");
 // On main push the old Worker may still be serving while the protected
 // deploy applies migrations. Do not classify a pre-deploy 404 as storage
 // outage or accidentally call a different deployed Worker source revision.
 const expected=String(env.GITHUB_SHA??"").trim();
 if(!/^[a-f0-9]{40}$/.test(expected))
  throw Error("PUBLIC_PAGE_REFRESH_DEPLOY_SHA_REQUIRED");
 const health=await fetchImpl(ORIGIN+"/health",{
  method:"GET",cache:"no-store",redirect:"error",
  headers:{"Cache-Control":"no-cache"},
  signal:AbortSignal.timeout(10_000),
 });
 if(!health.ok)return Object.freeze({
  schema:"geomacro.public-page-refresh-owner-proof.v1",
  verified_current_revision:false,state:"DEPLOY_PENDING",
  expected_deploy_verified:false,source_fetches:0,source_news_writes:0,
  b2_requests:0,signed_products_created:0
 });
 const meta=await health.json().catch(()=>null);
 if(meta?.deployed_source_sha!==expected)return Object.freeze({
  schema:"geomacro.public-page-refresh-owner-proof.v1",
  verified_current_revision:false,state:"DEPLOY_PENDING",
  expected_deploy_verified:false,source_fetches:0,source_news_writes:0,
  b2_requests:0,signed_products_created:0
 });
 const response=await fetchImpl(ORIGIN+"/v1/internal/public-news-page-refresh",{
  method:"PUT",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,"Cache-Control":"no-cache"},
  signal:AbortSignal.timeout(12_000),
 });
 if(response.status!==200)throw Error(
  [409,429,500,502,503,504].includes(response.status)?
  "PUBLIC_PAGE_REFRESH_HTTP_"+response.status:"PUBLIC_PAGE_REFRESH_HTTP_OTHER");
 if(Number(response.headers.get("content-length")??"0")>2048)
  throw Error("PUBLIC_PAGE_REFRESH_OVERSIZE");
 const raw=await response.text();
 if(raw.length>2048)throw Error("PUBLIC_PAGE_REFRESH_OVERSIZE");
 let v;try{v=JSON.parse(raw)}catch{throw Error("PUBLIC_PAGE_REFRESH_INVALID_JSON")}
 if(v?.ok!==true||v.schema!=="geomacro.public-derived-materialization-refresh.v1"||
    !STATES.has(v.state)||v.pages!==3||
    v.publisher_sources_polled!==0||v.publisher_events_inserted!==0||
    v.b2_requests!==0||v.signed_products_created!==0||
    !Number.isSafeInteger(v.read_queries)||v.read_queries<1||v.read_queries>3||
    !(v.canonical_count===null||Number.isSafeInteger(v.canonical_count)&&
      v.canonical_count>=0&&v.canonical_count<=600))
  throw Error("PUBLIC_PAGE_REFRESH_CONTRACT_INVALID");
 return Object.freeze({schema:"geomacro.public-page-refresh-owner-proof.v1",
  verified_current_revision:true,state:v.state,
  page_count:3,source_fetches:0,source_news_writes:0,b2_requests:0,
  signed_products_created:0,read_queries:v.read_queries,
  canonical_source_rows:v.canonical_count,
  d1_provider_daily_quota_guarantee:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await refreshBoundedPublicNewsPages();
  if(receipt.state==="DEPLOY_PENDING")
    console.log("::notice::PUBLIC_PAGE_REFRESH_DEPLOY_PENDING_NOT_ACTIVATED");
  if(process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT,
      "refresh_active="+String(receipt.verified_current_revision===true)+"\n");
  console.log(JSON.stringify(receipt));
 }
 catch(e){console.error("::error::"+(typeof e?.message==="string"&&
   /^PUBLIC_PAGE_REFRESH_[A-Z0-9_]+$/.test(e.message)?
   e.message:"PUBLIC_PAGE_REFRESH_TRANSPORT_OR_UNCLASSIFIED"));process.exitCode=2;}
}
