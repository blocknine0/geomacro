#!/usr/bin/env node
/** Read-only follow-up: two ORIGINAL publishers reporting Kazakhstan's
 * actual 2026-10-16 World Bank metals/minerals compact.
 *
 * The official Kazakhstan government homepage is an INDEX, not an original.
 * Only follow a same-origin, title-matched official /en/news/ ARTICLE link.
 * Both precise article HTML bytes are SHA256-hashed. Do not treat a
 * matching topic, shared partnership, quoted interview, or same date as
 * independent semantic verification. Separate legal approval remains blocked:
 * Kazakhstan's footer is CC BY 4.0 (attribution required).
 */
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {verifiedPublisherPageDate}
 from "../lib/official-original-article-date.mjs";
import {firstEventOfficialLeads,probeOneOfficialOriginal}
 from "./audit-first-real-minerals-evidence.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const ORIGIN="https://primeminister.kz";
const NEWS="/en/news/";
const HOME=ORIGIN+"/en";
const MAX=700_000;
const reject=()=>{throw Error("KAZAKHSTAN_OFFICIAL_FIRST_EVENT_PROBE_INVALID")};
const deny=(code,wb)=>({
 schema:"geomacro.kazakhstan-compact-two-issuer-private-probe.v1",
 status:code,commercial_eligible:false,
 rights_rejected_reason:"KZ_CC_BY_4_ATTRIBUTION_AND_WBG_NO_ATTRIBUTION_NOT_CLEARED",
 same_event_semantic_review_verified:false,
 independent_authored_review_verified:false,
 signed_facts_authority_verified:false,
 signed_rights_authority_verified:false,
 verified_country_category_commercial_event_count:0,
 b2_requests:0,d1_writes:0,supabase_writes:0,payments:0,
 world_bank:wb,kazakhstan_government:null,
});
async function retrievePinned(url,fetchImpl){
 let response;
 try{response=await fetchImpl(url,{
   method:"GET",redirect:"manual",cache:"no-store",
   headers:{Accept:"text/html","User-Agent":"Geomacro-Private-Kazakhstan-Original-ReadOnly/1.0"},
   signal:AbortSignal.timeout(10_000),
 });}catch{return null}
 if(response?.status!==200||response.redirected===true||
    response.url&&response.url!==url||
    !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type")??""))
   return null;
 const length=response.headers.get("content-length");
 if(length!==null&&(!/^\d{1,8}$/u.test(length)||Number(length)>MAX))return null;
 const reader=response.body?.getReader();
 if(!reader)return null;
 const chunks=[];let count=0;
 try{
  while(true){
   const next=await reader.read();
   if(next.done)break;
   count+=next.value.byteLength;
   if(count>MAX){await reader.cancel();return null}
   chunks.push(Buffer.from(next.value));
  }
 }catch{return null}finally{reader.releaseLock()}
 if(count<80)return null;
 const bytes=Buffer.concat(chunks);
 let html;
 try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
 catch{return null}
 return {html,byte_sha256:sha(bytes),byte_length:count};
}
export function discoverKazakhstanOfficialArticle(home){
 if(typeof home!=="string"||home.length>MAX)return null;
 const all=home.matchAll(/<a\b([^>]{0,1200})>([\s\S]{0,3600}?)<\/a>/giu);
 let seen=0;
 for(const match of all){
  if(++seen>1800)break;
  const label=match[2].replace(/<[^>]*>/gu," ").replace(/&(?:apos|#39);/giu,"'").replace(/\s+/gu," ").toLowerCase();
  if(!label.includes("kazakhstan joins world bank")||
     !label.includes("metals and minerals"))continue;
  const attr=/(?:^|\s)href\s*=\s*(["'])([^"'<>]{1,380})\1/iu.exec(match[1]);
  if(!attr)continue;
  let parsed;
  try{parsed=new URL(attr[2],ORIGIN)}catch{continue}
  if(parsed.protocol!=="https:"||parsed.hostname!=="primeminister.kz"||
     parsed.port||parsed.username||parsed.password||parsed.search||parsed.hash||
     !new RegExp("^"+NEWS+"[a-z0-9-]{10,230}$","u").test(parsed.pathname))
    continue;
  return parsed.href;
 }
 return null;
}
export async function auditKazakhstanWorldBankSameEvent({
 fetchImpl=fetch,now=new Date(),
}={}){
 if(typeof fetchImpl!=="function"||!Number.isFinite(now?.getTime()))reject();
 const wb=await probeOneOfficialOriginal(firstEventOfficialLeads()[0],{fetchImpl,now});
 if(!wb.exact_html_sha256)return deny("WORLD_BANK_ORIGINAL_BYTE_READBACK_MISSING",wb);
 const listing=await retrievePinned(HOME,fetchImpl);
 if(!listing)return deny("KAZAKHSTAN_GOVERNMENT_INDEX_UNAVAILABLE",wb);
 const article=discoverKazakhstanOfficialArticle(listing.html);
 if(!article)return deny("KAZAKHSTAN_GOVERNMENT_ORIGINAL_ARTICLE_LINK_UNVERIFIED",wb);
 const original=await retrievePinned(article,fetchImpl);
 if(!original)return deny("KAZAKHSTAN_GOVERNMENT_ORIGINAL_BYTES_UNVERIFIED",wb);
 const text=original.html.toLowerCase();
 // The terms occur in the same original publisher article, but do NOT
 // establish independent semantic comparison or legal reuse rights.
 if(!text.includes("world bank")||
    !text.includes("kazakhstan")||
    !text.includes("minerals")||
    !text.includes("compact"))
   return deny("KAZAKHSTAN_GOVERNMENT_SAME_TOPIC_UNVERIFIED",wb);
 const published=verifiedPublisherPageDate(original.html,now);
 return {
   schema:"geomacro.kazakhstan-compact-two-issuer-private-probe.v1",
   status:"TWO_OFFICIAL_ORIGINAL_LEADS_TOPIC_MATCH_RIGHTS_UNVERIFIED",
   country_iso3:"KAZ",category:"rare_earth",
   world_bank:wb,
   kazakhstan_government:{
     issuer:"kazakhstan_prime_minister_government",
     exact_html_sha256:original.byte_sha256,
     bytes_observed:original.byte_length,
     source_native_publication_at:published??null,
     precise_native_publication_clock_verified:published!==null,
     source_identity_url_sha256:sha(Buffer.from(article)),
     // Do not show original URL or article text in test logs.
   },
   source_websites_independent_issuers_candidate:true,
   same_event_semantic_review_verified:false,
   independent_authored_review_verified:false,
   article_specific_no_attribution_commercial_rights_verified:false,
   rights_rejected_reason:"KZ_CC_BY_4_ATTRIBUTION_AND_WBG_NO_ATTRIBUTION_NOT_CLEARED",
   licensed_signed_commercial_gro:false,
   verified_country_category_commercial_event_count:0,
   no_public_raw_source:true,
   b2_requests:0,d1_writes:0,supabase_writes:0,payments:0,
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{console.log(JSON.stringify(await auditKazakhstanWorldBankSameEvent()));}
 catch{console.error("KAZAKHSTAN_OFFICIAL_FIRST_EVENT_PROBE_FAILED_CLOSED");process.exitCode=2}
}
