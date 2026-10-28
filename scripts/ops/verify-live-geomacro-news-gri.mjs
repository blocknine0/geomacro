#!/usr/bin/env node
/** Production acceptance for GeoMacro-issued HMAC news-severity GRI only.
 * No raw source, review or private key printed; no writes, no paid requests.
 */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/geomacro-certified-news-severity-gri";
const expected="geomacro-news-severity-v1.1.0";
const fail=()=>{console.error("GEOMACRO_CERTIFIED_NEWS_GRI_LIVE_ACCEPTANCE_FAILED");process.exitCode=2};
try{
 const env=process.env;
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !env.CONTROL_PLANE_TOKEN||env.CONTROL_PLANE_TOKEN.length<32)
  throw Error("NO_PROTECTED_CANONICAL_ISSUER");
 const url=env.CONTROL_PLANE_URL?
  new URL("/v1/public/geomacro-certified-news-severity-gri",env.CONTROL_PLANE_URL).href:endpoint;
 if(new URL(url).hostname!=="geomacro-control-plane.daspallab202391.workers.dev")
  throw Error("UNEXPECTED_ISSUER_ORIGIN");
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch(url,{method:"GET",cache:"no-store",redirect:"error",
   headers:{Accept:"application/json","Cache-Control":"no-cache"},
   signal:AbortSignal.timeout(12_000)});
  if(response.status===200)break;
  if(response.body)try{await response.body.cancel()}catch{}
 }
 if(!response||response.status!==200||response.redirected||
    response.headers.get("x-geomacro-certification")!=="geomacro-self-certified-news-severity-v1")
  throw Error("PUBLIC_CERTIFIED_GRI_ORIGIN_UNAVAILABLE");
 const raw=await response.text();
 if(raw.length>250_000)throw Error("PUBLIC_CERTIFIED_GRI_TOO_LARGE");
 const data=JSON.parse(raw);
 const {certification,...payload}=data;
 if(data.schema!=="geomacro.self-certified-news-severity-gri.v1"||
    data.issuer!=="GeoMacro"||
    data.independent_third_party_certified!==false||
    data.source_event_facts_independently_verified!==false||
    data.data?.parentMethodologyVersion!==expected||
    data.data?.proofScope!=="geomacro-news-severity"||
    data.data?.verificationStatus!=="verified"||
    data.data?.indices?.length!==3||
    certification?.issuer!=="GeoMacro"||certification.scheme!=="HMAC-SHA256"||
    certification.independent_external_audit!==false)
  throw Error("PUBLIC_CERTIFIED_GRI_SCOPE_INVALID");
 const signed=JSON.stringify(payload);
 const hash=createHash("sha256").update(signed).digest("hex");
 const sig=createHmac("sha256",env.CONTROL_PLANE_TOKEN).update(
  "GEOMACRO/SELF-CERTIFIED/NEWS-SEVERITY-GRI/v1\\n"+signed).digest("hex");
 if(certification.signed_payload_sha256!==hash||
    typeof certification.signature_hex!=="string"||
    !/^[0-9a-f]{64}$/.test(certification.signature_hex)||
    !timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(certification.signature_hex,"hex")))
  throw Error("PUBLIC_CERTIFIED_GRI_HMAC_MISMATCH");
 const domains=new Set(["geopolitics","macro","critical_minerals"]);
 for(const index of data.data.indices){
  if(!domains.delete(index.key)||
    !(index.status==="unavailable"&&index.score===null||
      index.status==="available"&&typeof index.score==="number"&&
      Number.isFinite(index.score)&&index.score>=0&&index.score<=100)||
    !index.sourceMix||
    !Number.isSafeInteger(index.sourceMix.public_news)||
    !Number.isSafeInteger(index.sourceMix.osint)||
    index.sourceMix.osint_event_facts_verified!==false||
    index.sourceMix.public_news<0||index.sourceMix.osint<0||
    index.sourceMix.public_news+index.sourceMix.osint!==index.eventCount)
   throw Error("PUBLIC_CERTIFIED_GRI_SEVERITY_INVALID");
 }
 if(domains.size)throw Error("PUBLIC_CERTIFIED_GRI_CATEGORY_MISSING");
 console.log(JSON.stringify({
  schema:"geomacro.news-severity-gri-live-acceptance.v1",
  status:"GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_VERIFIED",
  issuer:"GeoMacro",methodology_version:expected,
  three_categories_present:true,issuer_hmac_verified:true,
  eligible_categories:data.data.indices.filter(x=>x.status==="available").length,
  public_news_contributions:data.data.indices.reduce((n,x)=>n+x.sourceMix.public_news,0),
  unverified_osint_contributions:data.data.indices.reduce((n,x)=>n+x.sourceMix.osint,0),
  osint_independent_event_verification_claimed:false,
  independent_external_review_claimed:false,
  source_event_fact_verification_claimed:false,
  original_news_data_logged:false,payment_executed:false,
  b2_requests:0,d1_writes:0,
 }));
}catch{fail()}
