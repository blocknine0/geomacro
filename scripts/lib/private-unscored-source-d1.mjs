/** Source metadata -> canonical, deduplicated, private D1 observation.
 * An absent LLM must never prevent original-source intake. This helper does
 * not score, certify copyright, corroborate or publish any paid intelligence.
 */
import {buildPhase2hPrivateRawRecords,postPhase2hPrivateRawRecords,
  postPhase2hCollisionIsolated} from "./phase2h-raw-original-records.mjs";

export const PRIVATE_SOURCE_D1_ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const HOURS_72=72*60*60*1000;
const CATEGORY_PREFIXES=Object.freeze([
  ["GEOPOLITICS","geopolitics"],
  ["MACRO","macro"],
  ["CRITICAL_MINERALS","rare_earth"],
  ["RARE_EARTH","rare_earth"],
]);
const TITLE_TOPICS=Object.freeze([
  ["rare_earth",/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|copper mine|tungsten|mineral processing|mineral export|mine production)\b/iu],
  ["macro",/\b(?:central bank|federal reserve|FOMC|interest rates?|inflation|GDP|exchange rates?|currency|monetary policy|bond yields?|trade deficit|employment figures|sovereign debt|recession)\b/iu],
  ["geopolitics",/\b(?:ceasefire|sanctions?|armed conflict|airstrikes?|military|border clashes?|coup|invasion|security council|peacekeeping|humanitarian crisis|displacement|missile strikes?|territorial dispute)\b/iu],
]);

/** Regex is an intake topic hint only, never a numerical risk classifier. */
export function privateTitleTopicHint(title) {
  if(typeof title!=="string")return null;
  for(const [category,pattern] of TITLE_TOPICS)
    if(pattern.test(title))return category;
  return null;
}

export function rssSourceCategory(payload) {
  const type=String(payload?.event_type??"").toUpperCase();
  for(const [prefix,category] of CATEGORY_PREFIXES)
    if(type.startsWith(prefix+"_"))return {category,basis:"publisher_source_event_type"};
  const hinted=privateTitleTopicHint(payload?.headline);
  return hinted?{category:hinted,basis:"title_regex_unscored"}:null;
}

export function nativeSourceClock(raw,now=new Date()) {
  if(typeof raw!=="string"||!(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
  const value=raw.trim();
  if(!/^20\d{2}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d))?$/u.test(value))
    return null;
  const published=Date.parse(value);
  if(!Number.isFinite(published)||published>now.getTime()||now.getTime()-published>HOURS_72)
    return null;
  if(value.length===10)return value;
  return new Date(published).toISOString();
}

function originalHttps(raw,hostRequired=null) {
  try{
    const u=new URL(String(raw??""));
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||u.href.length>=1800)return null;
    if(hostRequired && !(u.hostname===hostRequired||u.hostname.endsWith("."+hostRequired)))return null;
    if(/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/u.test(u.hostname))return null;
    return u.href;
  }catch{return null}
}

function safeHeadline(raw) {
  if(typeof raw!=="string")return null;
  const title=raw.replace(/\s+/gu," ").trim();
  return title.length>0&&title.length<=260&&!/[<>]/u.test(title)?title:null;
}

export function rssSpoolPrivateCandidates(payloads,now=new Date()) {
  if(!Array.isArray(payloads))throw Error("RSS_PRIVATE_D1_PAYLOADS_INVALID");
  const result=[],diagnostics={seen:payloads.length,accepted:0,invalid:0,regex_only:0};
  for(const row of payloads){
    const topic=rssSourceCategory(row),publishedAt=nativeSourceClock(row?.published_at,now);
    const title=safeHeadline(row?.headline);
    const articleUrl=originalHttps(row?.source_url);
    const sourceId=String(row?.source_id??"").trim();
    if(!topic||!publishedAt||!title||!articleUrl||!sourceId||
      sourceId.length>110){diagnostics.invalid++;continue;}
    if(topic.basis==="title_regex_unscored")diagnostics.regex_only++;
    result.push({category:topic.category,sourceId,title,articleUrl,publishedAt,credit:null});
  }
  diagnostics.accepted=result.length;
  return {candidates:result,diagnostics};
}

/** ReliefWeb is a report *catalogue*, not a rights grant for partner bodies.
 * Use the native original publication clock only, never catalogue ingestion
 * or last-modified time as a source publication surrogate.
 */
export function reliefwebPrivateCandidates(reports,now=new Date()) {
  if(!Array.isArray(reports))throw Error("RELIEFWEB_PRIVATE_D1_REPORTS_INVALID");
  const result=[],diagnostics={seen:reports.length,accepted:0,invalid:0};
  for(const row of reports){
    const field=row?.fields??{};
    const title=safeHeadline(field.title);
    const publishedAt=nativeSourceClock(field?.date?.original,now);
    const articleUrl=originalHttps(field.url_alias,"reliefweb.int")??
      originalHttps(field.url,"reliefweb.int");
    const id=String(row?.id??"").trim();
    if(!title||!publishedAt||!articleUrl||!id){diagnostics.invalid++;continue;}
    result.push({category:"geopolitics",sourceId:"reliefweb_v2_report_metadata",
      title,articleUrl,publishedAt,credit:null});
  }
  diagnostics.accepted=result.length;
  return {candidates:result,diagnostics};
}

export async function persistUnscoredSourceCandidatesD1(candidates,{
  now=new Date(),token=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN,
  fetchImpl=fetch,post=postPhase2hCollisionIsolated,
}={}) {
  const plan=buildPhase2hPrivateRawRecords(candidates,{now,derive:()=>[]});
  // Existing canonical collision isolator quarantines conflicting IDs
  // without withholding unrelated original observations from D1.
  const receipt=await (plan.records.length?post:postPhase2hPrivateRawRecords)({
    records:plan.records,controlPlaneRoot:PRIVATE_SOURCE_D1_ROOT,token,fetchImpl,
  });
  if(receipt.readback_verified!==true||
     receipt.per_original_readback_verified!==true||
     receipt.verified_originals+(receipt.rejected_conflicts??0)!==plan.records.length)
    throw Error("PRIVATE_SOURCE_D1_EXACT_READBACK_UNVERIFIED");
  return Object.freeze({
    schema:"geomacro.part2.source-private-d1-receipt.v1",
    proposed:plan.records.length,
    persisted:receipt.stored,unchanged:receipt.duplicate,
    rejected_invalid:plan.discarded_invalid,
    identity_conflicts_quarantined:plan.identity_conflicts_quarantined+
      (receipt.rejected_conflicts??0),
    category_counts:plan.counts,
    d1_exact_readback_verified:true,
    per_original_readback_verified:receipt.per_original_readback_verified===true,
    unscored:true,commercial_rights_verified:false,
    paid_eligible:false,source_body_stored:false,
  });
}
