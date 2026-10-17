#!/usr/bin/env node
/**
 * P0 ORIGINAL-BYTE READ-ONLY INVESTIGATION, NEVER commercial event intake.
 *
 * Two verified separate 2026-10-16/17 original leads, NOT two independent
 * same-event corroborators. Each actual first-party HTML response is SHA-256
 * hashed from its network body, source-native publication clock is parsed
 * using the existing official original-page clock contract. Sources and raw
 * article bytes stay in memory; CI may only print a sanitized receipt.
 *
 * Absolutely NO private keys, licence approval, B2/D1 write, GRO, x402, or
 * promotion of a headline/first-discovered day into a native publication time.
 */
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {verifiedPublisherPageDate}
 from "../../scripts/lib/official-original-article-date.mjs";

const MAX_BYTES=256_000;
const TIMEOUT_MS=10_000;
const HASH=/^[a-f0-9]{64}$/u;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const leads=Object.freeze([
 Object.freeze({
   id:"wbg-20261016-metals-minerals-compacts",
   issuer:"world_bank_group",
   country_iso3:"IND",
   category:"rare_earth",
   claim:"2026-10-16-eight-country-metals-minerals-compacts",
   url:"https://www.worldbank.org/en/news/press-release/2026/10/16/metals-minerals-country-compacts-launch",
   official_host:"www.worldbank.org",
   rights:"NO_ARTICLE_SPECIFIC_NO_ATTRIBUTION_PERMISSION",
 }),
 Object.freeze({
   id:"ebrd-20261017-mdb-minerals-framework",
   issuer:"european_bank_reconstruction_development",
   country_iso3:null,
   category:"rare_earth",
   claim:"2026-10-17-mdb-collaboration-framework",
   url:"https://www.ebrd.com/home/news-and-events/news/2026/mdb-collaboration-framework-citical-minerals-to-manufacturing-va.html",
   official_host:"www.ebrd.com",
   rights:"EXPLICIT_COMMERCIAL_MATERIAL_USE_PERMISSION_REQUIRED",
 }),
]);
const reject=()=>{throw Error("FIRST_EVENT_PROBE_INPUT_INVALID")};
export function firstEventOfficialLeads(){return leads;}
export function assertNotSameIndependentEvent(rows=leads){
 if(!Array.isArray(rows)||rows.length!==2||
    rows[0].claim===rows[1].claim||
    rows[0].issuer===rows[1].issuer||rows[0].category!=="rare_earth"||
    rows[1].category!=="rare_earth")reject();
 return true;
}
export async function probeOneOfficialOriginal(row,{
 fetchImpl=fetch,now=new Date(),
}={}){
 if(!leads.includes(row)||!Number.isFinite(now?.getTime())||
   typeof fetchImpl!=="function")reject();
 const expected=new URL(row.url);
 if(expected.protocol!=="https:"||expected.hostname!==row.official_host||
    expected.port||expected.username||expected.password||expected.search||
    expected.hash||!expected.pathname.endsWith(".html")&&
      !expected.pathname.endsWith("/metals-minerals-country-compacts-launch"))reject();
 const base={id:row.id,issuer:row.issuer,
    category:row.category,
    source_claim_sha256:sha(Buffer.from(row.claim)),
    independently_authored_same_event:false,
    rights_status:row.rights,
    no_attribution_commercial_permission_verified:false,
    independent_facts_attestation_verified:false,
    independent_rights_attestation_verified:false,
    signed_gro_verified:false,
    public_hot_published:false,
    d1_writes:0,b2_writes:0,supabase_writes:0,payments:0};
 let res;
 try {
  res=await fetchImpl(row.url,{
    method:"GET",redirect:"manual",cache:"no-store",
    headers:{Accept:"text/html","User-Agent":"Geomacro-Private-Evidence-ReadOnly/1.0"},
    signal:AbortSignal.timeout(TIMEOUT_MS),
  });
 }catch{return {...base,status:"ORIGINAL_TRANSPORT_UNVERIFIED",
    exact_html_sha256:null,source_native_publication_at:null};}
 if(res?.status!==200||res.redirected===true||
    (res.url && res.url!==row.url)||
    !/^text\/html(?:;|$)/iu.test(res.headers?.get("content-type")??""))
   return {...base,status:"ORIGINAL_HTTP_OR_IDENTITY_UNVERIFIED",
    exact_html_sha256:null,source_native_publication_at:null};
 const length=res.headers?.get("content-length");
 if(length!==null&&(!/^\d{1,7}$/u.test(length)||Number(length)>MAX_BYTES))
   return {...base,status:"ORIGINAL_BYTES_UNVERIFIED",
    exact_html_sha256:null,source_native_publication_at:null};
 const reader=res.body?.getReader();
 if(!reader)return {...base,status:"ORIGINAL_BYTES_UNVERIFIED",
   exact_html_sha256:null,source_native_publication_at:null};
 let count=0;const chunks=[];
 try{
  while(true){
   const next=await reader.read();
   if(next.done)break;
   count+=next.value.byteLength;
   if(count>MAX_BYTES){await reader.cancel();return {
     ...base,status:"ORIGINAL_BYTES_OVERSIZE",
     exact_html_sha256:null,source_native_publication_at:null};
   }
   chunks.push(Buffer.from(next.value));
  }
 }catch{return {...base,status:"ORIGINAL_BYTES_UNVERIFIED",
   exact_html_sha256:null,source_native_publication_at:null};}
 finally{reader.releaseLock()}
 if(count<80)return {...base,status:"ORIGINAL_BYTES_UNVERIFIED",
   exact_html_sha256:null,source_native_publication_at:null};
 const bytes=Buffer.concat(chunks);
 const exact_html_sha256=sha(bytes);
 if(!HASH.test(exact_html_sha256))reject();
 let html;
 try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
 catch{return {...base,status:"ORIGINAL_ENCODING_UNVERIFIED",
     exact_html_sha256,source_native_publication_at:null};}
 const official=verifiedPublisherPageDate(html,now);
 // A date-only page or a site update timestamp can NEVER substitute for an
 // exact source-native article clock. Honest partial SHA is still useful.
 const source_native_publication_at=official??null;
 return {...base,
   status:official?"ORIGINAL_HTML_AND_NATIVE_CLOCK_OBSERVED_REVIEW_REQUIRED":
     "ORIGINAL_HTML_HASHED_NATIVE_CLOCK_UNVERIFIED",
   exact_html_sha256,bytes_observed:bytes.byteLength,
   source_native_publication_at,
 };
}
export async function auditFirstMineralsLeads(options={}){
 assertNotSameIndependentEvent();
 const results=[];
 for(const row of leads)results.push(await probeOneOfficialOriginal(row,options));
 // Crucial: these are two DIFFERENT events; no external signature or legal
 // permission may turn them into a 2-original SAME-EVENT commercial GRO.
 return {
  schema:"geomacro.first-event-official-byte-readonly-audit.v1",
  status:"TWO_DISTINCT_EVENT_LEADS_NOT_SAME_EVENT_NOT_COMMERCIAL",
  category:"rare_earth",
  original_leads_checked:2,
  original_html_exact_sha_observed_count:results.filter(r=>HASH.test(r.exact_html_sha256??"")).length,
  same_event_independent_original_count:0,
  article_specific_commercial_rights_approved:0,
  legitimate_facts_signatures_created:0,
  legitimate_rights_signatures_created:0,
  licensed_signed_commercial_gro:false,
  b2_publication_verified:false,d1_current_hot_verified:false,
  payments:0,supabase_writes:0,
  results,
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{console.log(JSON.stringify(await auditFirstMineralsLeads()));}
 catch{console.error("FIRST_EVENT_PROBE_FAILED_CLOSED");process.exitCode=2;}
}
