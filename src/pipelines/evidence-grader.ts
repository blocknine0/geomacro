import {createHash} from "node:crypto";
import {COUNTRIES_195} from "../lib/canonical-country-registry-195";

/**
 * Private, deterministic evidence GRADING, not an alternative paid signer.
 * Existing Phase2H records contain feed metadata only; title numerals are
 * provisional claims, not independently checked quantitative observations.
 * Only D1 rows whose governed B2 two-GET + D1 acknowledgement already
 * succeeded can enter this compiler. This module makes no provider calls.
 */
const SHA=/^[a-f0-9]{64}$/u;
const DATE=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u;
const DAY=86_400_000;
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export const EVIDENCE_GRADE_THRESHOLD=0.85 as const;
export const EVIDENCE_DRAFT_TTL_HOURS=72 as const;
export type GradedCategory="geopolitics"|"macro"|"rare_earth";
export type Phase2hArchivedRow=Readonly<{
 record_id:string;category:string;raw_sha256:string;
 raw_json:string;b2_object_sha256:string|null;b2_archived_at:string|null;
 original_published_at:string;first_ingested_at:string;
}>;
export type EvidenceGrade=Readonly<{
 schema:"geomacro.phase2h.evidence-grade.v1";
 record_id:string;country_iso3:string|null;domain_category:GradedCategory|null;
 source_url:string|null;published_utc:string|null;
 archive_id:string|null;source_content_sha256:string|null;
 what_happened:string|null;why_it_matters:string|null;
 quantified_metrics:readonly string[];
 primary_source_attributed:boolean;
 confidence_score:number;
 grounding_status:"EVIDENCE_GROUNDED"|"FREE_PUBLIC_NEWS";
 archive_ack_verified:boolean;
 original_article_verified:boolean;
 independent_same_event_verified:boolean;
 item_commercial_rights_verified:boolean;
 commercial_delivery_authorized:false;
 paid_quote_authorized:false;
 failure_codes:readonly string[];
}>;

function countryFromOriginalTitle(title:string):string|null{
 if(typeof title!=="string"||title.length>260)return null;
 const found=new Set<string>();
 for(const country of COUNTRIES_195){
  // Never infer event location from the publisher hostname. Short country
  // names such as Chad, Peru or Oman must be whole title tokens.
  for(const word of [country.name,...country.aliases]){
   if(word.length<4)continue;
   const safe=word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
   if(new RegExp("(^|[^\\p{L}\\p{N}])"+safe+"(?=$|[^\\p{L}\\p{N}])","iu").test(title)){
    found.add(country.iso3);break;
   }
  }
 }
 return found.size===1?[...found][0]:null;
}
function validIssuerUrl(v:unknown):v is string {
 if(typeof v!=="string"||v.length>1800)return false;
 try{
  const x=new URL(v);
  return x.protocol==="https:"&&!x.username&&!x.password&&!x.port&&
   !x.hash&&x.hostname.includes(".")&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/u.test(x.hostname);
 }catch{return false}
}
function quantitativeCandidates(text:string):string[]{
 // Units are required: years, article IDs and ordinary numerals never pass.
 const pattern=/\b(?:\d{1,3}(?:,\d{3})+|\d{1,10})(?:\.\d{1,4})?\s*(?:%|percent(?:age points?)?|basis points?|bps|USD|USDC|dollars?|million|billion|trillion|metric tonnes?|metric tons?|barrels?(?: per day)?|bpd|tons?|tonnes?|gigawatts?|megawatts?)\b|(?:\d+(?:\.\d+)?)%/giu;
 const matches=[...text.matchAll(pattern)].map(x=>x[0].trim());
 return [...new Set(matches)].slice(0,8);
}
function safePart(value:unknown,max=1200):string|null {
 return typeof value==="string"&&value.trim()&&value.length<=max&&
  !/[<>]/u.test(value)&&!/(?:https?:\/\/)/iu.test(value)?value.trim():null;
}
export function gradeArchivedPhase2hEvidence(input:Phase2hArchivedRow,now=new Date()):EvidenceGrade {
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("EVIDENCE_GRADER_INVALID_CLOCK");
 const fails:string[]=[];
 const fail=(code:string)=>{if(!fails.includes(code))fails.push(code);};
 const category=["geopolitics","macro","rare_earth"].includes(input?.category)
   ?input.category as GradedCategory:null;
 if(!category)fail("CATEGORY_INVALID");
 let record:Record<string,any>|null=null;
 try{
  if(typeof input.raw_json==="string"&&input.raw_json.length<=12000)
   record=JSON.parse(input.raw_json);
 }catch{}
 if(!record||record.schema!=="geomacro.phase2h.private-raw-observation.v1")
  fail("RAW_SCHEMA_UNVERIFIED");
 const original=record?.original??null,analysis=record?.analysis??null;
 const direct=original?.original_url;
 if(!validIssuerUrl(direct))fail("ORIGINAL_SOURCE_URL_UNVERIFIED");
 const date=original?.original_published_at;
 const published=typeof date==="string"&&DATE.test(date)&&
  Number.isFinite(Date.parse(date))&&new Date(date).toISOString()===date&&
  Date.parse(date)<=now.getTime()+60_000&&now.getTime()-Date.parse(date)<=72*DAY/24
   ?date:null;
 if(!published)fail("NATIVE_EXACT_UTC_72H_UNVERIFIED");
 const country=countryFromOriginalTitle(original?.original_title);
 if(!country)fail("COUNTRY_EVENT_ATTRIBUTION_UNVERIFIED");
 const rowHash=record&&record.raw_sha256===input.raw_sha256&&
  SHA.test(input.record_id)&&SHA.test(input.raw_sha256)&&
  record.record_id===input.record_id&&record.category===input.category&&
  record.commercial_rights_verified===false&&
  record.commercial_delivery_authorized===false&&
  hash(JSON.stringify({
   schema:record.schema,record_id:record.record_id,category:record.category,
   original:record.original,analysis:record.analysis,
   commercial_rights_verified:false,commercial_delivery_authorized:false,
  }))===input.raw_sha256;
 if(!rowHash)fail("IMMUTABLE_RAW_SHA_MISMATCH");
 if(record?.original?.original_published_at!==input.original_published_at)
  fail("D1_ORIGINAL_CLOCK_MISMATCH");
 const archive=SHA.test(input.b2_object_sha256??"")&&
  typeof input.b2_archived_at==="string"&&DATE.test(input.b2_archived_at)&&
  Number.isFinite(Date.parse(input.b2_archived_at))&&
  Date.parse(input.b2_archived_at)<=now.getTime()+60_000&&rowHash===true;
 if(!archive)fail("B2_D1_ARCHIVE_ACK_UNVERIFIED");
 const page=analysis?.evidence_and_confidence?.original_article_page_verified===true;
 const sameEvent=analysis?.evidence_and_confidence?.independent_event_verified===true;
 const rights=record?.commercial_rights_verified===true&&
  analysis?.evidence_and_confidence?.commercial_rights_verified===true;
 const what=safePart(analysis?.what_happened?.text);
 const why=safePart(analysis?.why_it_matters?.text);
 if(!what)fail("WHAT_UNGROUNDED");
 if(!why)fail("WHY_UNGROUNDED");
 // The original feed headline is source evidence, but not proof that its
 // claims or numbers are correct. Only verified page content is counted.
 const metrics=quantitativeCandidates([
  typeof original?.original_title==="string"?original.original_title:"",
  typeof original?.original_content==="string"?original.original_content:"",
 ].join(" "));
 if(metrics.length===0)fail("QUANTITATIVE_EVIDENCE_MISSING");
 if(!page)fail("ORIGINAL_PAGE_NOT_VERIFIED");
 if(!sameEvent)fail("INDEPENDENT_SAME_EVENT_NOT_VERIFIED");
 if(!rights)fail("ITEM_RIGHTS_NOT_VERIFIED");
 const score=Number((
  (validIssuerUrl(direct)?0.1:0)+
  (published?0.1:0)+(country?0.1:0)+(rowHash?0.1:0)+
  (archive?0.1:0)+(what?0.1:0)+(why?0.1:0)+
  (metrics.length?0.1:0)+(page?0.1:0)+(sameEvent?0.1:0)
 ).toFixed(2));
 // 0.85 threshold is a CONTENT grading rule, never source licensing or a
 // signature. In particular an unverified news headline is capped at 0.80.
 const grounded=score>=EVIDENCE_GRADE_THRESHOLD&&
  !!published&&!!country&&!!archive&&!!what&&!!why&&
  metrics.length>0&&page&&sameEvent;
 return Object.freeze({
  schema:"geomacro.phase2h.evidence-grade.v1",
  record_id:input?.record_id??"",
  country_iso3:country,domain_category:category,
  source_url:validIssuerUrl(direct)?direct:null,published_utc:published,
  archive_id:archive?input.b2_object_sha256:null,
  source_content_sha256:rowHash?input.raw_sha256:null,
  what_happened:what,why_it_matters:why,
  quantified_metrics:Object.freeze(metrics),
  primary_source_attributed:validIssuerUrl(direct),
  confidence_score:score,
  grounding_status:grounded?"EVIDENCE_GROUNDED":"FREE_PUBLIC_NEWS",
  archive_ack_verified:archive,original_article_verified:page,
  independent_same_event_verified:sameEvent,item_commercial_rights_verified:rights,
  commercial_delivery_authorized:false,paid_quote_authorized:false,
  failure_codes:Object.freeze(fails),
 });
}
