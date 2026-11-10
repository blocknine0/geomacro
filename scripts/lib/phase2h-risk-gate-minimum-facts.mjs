/**
 * Risk Gate MINIMAL long-term derived facts. Original source body, headline,
 * publisher description, full GRO/analysis and raw JSON are NEVER serialized.
 * Only the canonical source URL necessary for provenance is retained.
 *
 * All short what/why phrases are already GeoMacro-authored derivatives;
 * exact source-title/description copies are dropped. No claim of verified
 * corroboration, signed GRO, paid eligibility, or certified scores.
 */
import {createHash} from "node:crypto";
import {riskCountryFromOriginalTitle}
 from "../../workers/control-plane/src/phase2h-risk-country-index.mjs";
export const COMPACT_RISK_FACTS_SCHEMA="geomacro.risk-gate.minimum-derived-facts.v2";
const CATS=["geopolitics","macro","rare_earth"];
const MARKETS=["rates_and_bonds","fx_and_payments",
 "trade_and_logistics","mineral_supply_chain"];
const SHA=/^[a-f0-9]{64}$/u;
const B64=/^[A-Za-z0-9_-]{43}$/u;
const DATE=/^20\d\d-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{3})?Z)?$/u;
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const die=x=>{throw Error("PHASE2H_RISK_MINIMUM_"+x)};
const h64=x=>createHash("sha256").update(x).digest("base64url");
const hexTo64=x=>Buffer.from(x,"hex").toString("base64url");
const isoDate=x=>typeof x==="string"&&DATE.test(x)&&
 Number.isFinite(Date.parse(x))&&
 new Date(Date.parse(x)).toISOString().slice(0,10)===x.slice(0,10);
const urlOk=x=>{
 try{
  const u=new URL(x);
  return u.protocol==="https:"&&!u.username&&!u.password&&
   !u.hash&&!u.port&&u.hostname.includes(".")&&
   x===u.href&&x.length<=1800;
 }catch{return false}
};
const normalize=x=>x.normalize("NFKC").toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu," ").trim();
function shortDerived(x,headline,description,max){
 if(typeof x!=="string")return "";
 let t=x.normalize("NFKC").replace(/\s+/gu," ").trim();
 if(t.length<16)return "";
 // A verbatim or contained original headline/description must never be
 // mirrored into long-term storage even when nested in an analysis field.
 const lower=normalize(t);
 for(const raw of [headline,description]){
  if(typeof raw!=="string"||raw.length<18)continue;
  const phrase=normalize(raw);
  if(phrase.length>=18&&lower.includes(phrase))return "";
 }
 if(t.length>max){
  const boundary=t.lastIndexOf(" ",max);
  t=t.slice(0,boundary>=Math.floor(max*.65)?boundary:max);
 }
 if(t.includes("https://")||t.includes("http://")||/[<>]/u.test(t))
  return "";
 return t;
}
export const MINIMUM_FACT_COLUMNS=Object.freeze([
 "record_sha256_b64url","original_raw_sha256_b64url",
 "category_enum","country_iso3","original_published_at","ingested_at",
 "canonical_evidence_url","publisher_id_sha256_b64url",
 "source_content_sha256_b64url",
 "derived_what_max220","derived_why_max180","derived_watch_topic_max96",
 "market_channels_mask","same_event_candidate_sha256_b64url",
 "observation_only_flags","watch_trigger_enum"
]);
export const MINIMUM_FACT_CONTENT_FORBIDDEN=Object.freeze([
 "original_title","original_content","source_credit","original_description",
 "full_article_html","raw_json","original","analysis",
 "price_direction","price_change","article_body","headline"
]);
export function minimumFactId(row){
 if(!Array.isArray(row)||!B64.test(row[0]??""))die("FACT_ID_INVALID");
 return Buffer.from(row[0],"base64url").toString("hex");
}
export function minimumFactClock(row){
 if(!Array.isArray(row)||!ISO.test(row[5]??""))die("FACT_CLOCK_INVALID");
 return row[5];
}
export function packMinimumRiskFact(r){
 const orig=r?.original,analysis=r?.analysis;
 if(!SHA.test(r?.record_id??"")||!SHA.test(r?.raw_sha256??"")||
    !CATS.includes(r.category)||!orig||!analysis||
    !isoDate(orig.original_published_at)||!ISO.test(r.ingested_at??"")||
    !urlOk(orig.original_url)||
    typeof orig.original_source_id!=="string"||
    orig.original_source_id.length<2||orig.original_source_id.length>110||
    typeof orig.original_title!=="string"||
    orig.original_title.length<10||orig.original_title.length>260||
    r.commercial_rights_verified!==false||
    r.commercial_delivery_authorized!==false)
  die("CANONICAL_ORIGINAL_INVALID");
 const ev=analysis.evidence_and_confidence??{};
 const sourceHash=ev.source_content_identity_sha256;
 if(!SHA.test(sourceHash??"")||
    ev.commercial_rights_verified!==false||
    ev.paid_eligible!==false)die("PROVENANCE_INTEGRITY_UNVERIFIED");
 const chans=analysis.market_relevance?.potential_watch_channels??[];
 if(!Array.isArray(chans)||chans.length>4||
    chans.some(c=>!MARKETS.includes(c)))die("UNKNOWN_MARKET_CHANNEL");
 const what=shortDerived(analysis.what_happened?.text,
  orig.original_title,orig.original_content,220);
 const why=shortDerived(analysis.why_it_matters?.text,
  orig.original_title,orig.original_content,180);
 const topic=shortDerived(analysis.what_to_watch?.event_topic,
  orig.original_title,orig.original_content,96);
 const country=riskCountryFromOriginalTitle(orig.original_title);
 const mask=[...new Set(chans)].reduce((sum,c)=>sum|(1<<MARKETS.indexOf(c)),0);
 const hint=what?h64(r.category+"|"+country+"|"+normalize(what)):"";
 // Candidate grouping hint is NOT a same-event corroboration certificate.
 // Bit 0 = presence of observed, derived event sentence; all other
 // verification bits must be produced from separate independent proof.
 const flags=what?1:0;
 return Object.freeze([
  hexTo64(r.record_id),hexTo64(r.raw_sha256),
  CATS.indexOf(r.category),country,orig.original_published_at,r.ingested_at,
  orig.original_url,h64(orig.original_source_id),hexTo64(sourceHash),
  what,why,topic,mask,hint,flags,
  analysis.what_to_watch?.trigger===
   "NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION"?1:0
 ]);
}
export function checkMinimumRiskFact(row){
 if(!Array.isArray(row)||row.length!==MINIMUM_FACT_COLUMNS.length||
    !B64.test(row[0])||!B64.test(row[1])||
    !Number.isInteger(row[2])||row[2]<0||row[2]>2||
    typeof row[3]!=="string"||!/^[A-Z]{3}$/u.test(row[3])||
    !isoDate(row[4])||!ISO.test(row[5])||!urlOk(row[6])||
    !B64.test(row[7])||!B64.test(row[8])||
    typeof row[9]!=="string"||row[9].length>220||
    typeof row[10]!=="string"||row[10].length>180||
    typeof row[11]!=="string"||row[11].length>96||
    !Number.isInteger(row[12])||row[12]<0||row[12]>15||
    !(row[13]===""||B64.test(row[13]))||
    !(row[14]===0||row[14]===1)||
    !(row[15]===0||row[15]===1))
   die("COMPACT_FACT_INVALID");
 const textual=[row[9],row[10],row[11]];
 if(textual.some(x=>x.includes("https://")||/[<>]/u.test(x)))
  die("UNSAFE_DERIVED_TEXT");
 if(row[9]===""&&row[13]!=="")die("UNSUPPORTED_EVENT_HINT");
 if(row[9]!==""&&row[13]==="")die("MISSING_EVENT_HINT");
 return true;
}
export function minimumRiskFactsFromOriginals(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>25)
  die("BOUNDED_CANONICAL_SOURCE_REQUIRED");
 const facts=rows.map(packMinimumRiskFact);
 if(!facts.every(checkMinimumRiskFact)||
    new Set(facts.map(x=>x[0])).size!==facts.length)
  die("DUPLICATE_OR_UNVERIFIED_FACT");
 return facts;
}
