/**
 * One bounded, deterministic factual JSON projection for pasted and
 * already-derived news across all three Geomacro categories.
 * Source license classification is never a commercial permission grant.
 * No raw article, source headline, URLs or verbatim sentences in the output.
 */
export const REUSABLE_NEWS_JSON_SCHEMA="geomacro.reusable-news-json.v1" as const;
const CATEGORY_ALIASES:Record<string,"geopolitics"|"macro"|"rare_earth">={
  geopolitics:"geopolitics",macro:"macro","macro-fx":"macro",
  rare_earth:"rare_earth","critical-minerals":"rare_earth",
};
const RIGHTS=new Set(["commercial","noncommercial","public_domain","unknown"]);
const EVENT_RULES=[
  ["sanctions",/\b(sanctions?|sanctioned|embargo|asset freeze)\b/iu],
  ["export_restriction",/\b(export ban|export controls?|export restriction|export licence)\b/iu],
  ["interest_rate_change",/\b(interest rate|policy rate|benchmark rate|rate cut|rate hike|federal funds)\b/iu],
  ["inflation",/\b(inflation|consumer price index|consumer prices|cpi)\b/iu],
  ["trade_policy",/\b(tariffs?|trade agreement|trade deal|import duties)\b/iu],
  ["mineral_supply",/\b(lithium|cobalt|nickel|graphite|rare earth|critical mineral|copper|gallium|germanium)\b/iu],
  ["security",/\b(ceasefire|conflict|airstrike|border dispute|missile|armed forces)\b/iu],
  ["monetary_policy",/\b(central bank|monetary policy|bond purchases?)\b/iu],
  ["investment",/\b(investment|factory|refinery|processing plant|production facility)\b/iu],
] as const;
const ACTIONS=[
  ["announce",/\b(announce[ds]?|unveil(?:ed|s)?|publish(?:ed|es)?)\b/iu],
  ["approve",/\b(approve[ds]?|adopt(?:ed|s)?|ratif(?:y|ied))\b/iu],
  ["increase",/\b(increase[ds]?|rais(?:e[ds]?|ing)|hike[ds]?|grow(?:th)?)\b/iu],
  ["decrease",/\b(decrease[ds]?|reduc(?:e[ds]?|tion)|lower(?:ed|s)?|cut|cuts|fell|declin(?:e[ds]?|ing))\b/iu],
  ["restrict",/\b(restrict(?:ed|s|ion)?|ban(?:ned|s)?|sanction(?:ed|s)?)\b/iu],
  ["launch",/\b(launch(?:ed|es)?|open(?:ed|s)?|begin(?:s|ning)?|start(?:ed|s)?)\b/iu],
  ["sign",/\b(sign(?:ed|s)?|agre(?:e[ds]?|ement))\b/iu],
] as const;
const ACTORS=[
  ["Federal Reserve",/\b(Federal Reserve|Fed Board|FOMC)\b/iu],
  ["European Central Bank",/\b(ECB|European Central Bank)\b/iu],
  ["Bank of England",/\bBank of England\b/iu],
  ["World Bank",/\bWorld Bank\b/iu],
  ["International Monetary Fund",/\b(IMF|International Monetary Fund)\b/iu],
  ["United Nations",/\b(UN Security Council|United Nations)\b/iu],
  ["USGS",/\b(USGS|U\.S\. Geological Survey)\b/iu],
  ["Statistics Canada",/\bStatistics Canada\b/iu],
  ["Natural Resources Canada",/\b(Natural Resources Canada|NRCan)\b/iu],
] as const;
type Category="geopolitics"|"macro"|"rare_earth";
type License="commercial"|"noncommercial"|"public_domain"|"unknown";
type NewsInput={category:string;text:string;source_name?:string;
  source_url?:string;published_at?:string;country_iso3?:string;
  license?:string;headline?:string};
const FIELD_ALLOW=new Set(["category","text","source_name","source_url",
  "published_at","country_iso3","license","headline"]);
function inputError():never{throw Error("NEWS_JSON_INPUT_INVALID")}
function validUtc(s:string){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(s))return false;
  const ms=Date.parse(s);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===s.slice(0,19);
}
function normalizedText(s:string){return s.normalize("NFKC").replace(/\s+/gu," ").trim()}
// Most scripts retain a 25-character factual minimum; compact CJK headlines
// can express complete news facts in fewer code points. This changes only the
// text admission threshold, never rights, scoring or verification status.
function substantiveNewsText(s:string):boolean{
 const text=normalizedText(s);
 if(text.length>=25)return true;
 return text.length>=14&&
   (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)??[]).length>=12;
}
function eventFingerprint(s:string){
  // Stable noncryptographic deduplication hint only, never a content proof.
  let a=2166136261,b=2166136261;
  for(let i=0;i<s.length;i++){
    a=Math.imul(a^s.charCodeAt(i),16777619);
    b=Math.imul(b^s.charCodeAt(s.length-i-1),16777619);
  }
  return (a>>>0).toString(16).padStart(8,"0")+(b>>>0).toString(16).padStart(8,"0");
}
const METRIC_PATTERN=/(?:[$€£]\s?)?\b\d{1,9}(?:,\d{3})*(?:\.\d{1,4})?\s?(?:%|percent|percentage points?|basis points?|bps|billion|million|trillion|tonnes?|tons?|barrels?|USD|EUR|GBP)(?=$|[\s,.;:!?])|[$€£]\s?\d{1,9}(?:,\d{3})*(?:\.\d{1,4})?/giu;
function extractMetrics(source:string){
  const found:{value:string;unit:string;scale:string|null}[]=[];
  const seen=new Set<string>();
  for(const match of source.matchAll(METRIC_PATTERN)){
    const span=match[0].replace(/\s+/gu," ").trim();
    const unit=span.startsWith("$")?"USD":span.startsWith("€")?"EUR":
      span.startsWith("£")?"GBP":((span.match(/(?:%|percent|percentage points?|basis points?|bps|billion|million|trillion|tonnes?|tons?|barrels?|USD|EUR|GBP)$/iu)||[])[0]||"").toLowerCase();
    const value=(span.replace(/[$€£,%]/gu,"").replace(/(?:percent|percentage points?|basis points?|bps|billion|million|trillion|tonnes?|tons?|barrels?|USD|EUR|GBP)$/iu,"").replace(/,/gu,"").trim());
    if(!/^\d{1,9}(?:\.\d{1,4})?$/u.test(value))continue;
    const scale=(span.match(/\b(billion|million|trillion)\b/iu)||[])[0]?.toLowerCase()??null;
    const key=value+"|"+unit+"|"+scale;
    if(!seen.has(key)){found.push({value,unit,scale});seen.add(key)}
    if(found.length===15)break;
  }
  return found;
}
export type ReusableNewsInput=NewsInput;
export function normalizeReusableNewsJson(input:unknown){
  if(!input||typeof input!=="object"||Array.isArray(input))inputError();
  const d=input as Record<string,unknown>;
  if(Object.keys(d).some(k=>!FIELD_ALLOW.has(k))||
    typeof d.category!=="string"||!CATEGORY_ALIASES[d.category]||
    typeof d.text!=="string"||!substantiveNewsText(d.text)||d.text.length>12000||
    (d.headline!==undefined&&(typeof d.headline!=="string"||d.headline.length>240))||
    (d.source_name!==undefined&&(typeof d.source_name!=="string"||d.source_name.length>120))||
    (d.source_url!==undefined&&typeof d.source_url!=="string")||
    (d.country_iso3!==undefined&&(typeof d.country_iso3!=="string"||!/^[A-Z]{3}$/u.test(d.country_iso3)))||
    (d.published_at!==undefined&&(typeof d.published_at!=="string"||!validUtc(d.published_at)))||
    (d.license!==undefined&&(typeof d.license!=="string"||!RIGHTS.has(d.license))))
    inputError();
  if(d.source_url){
    try{
      const u=new URL(d.source_url as string);
      if(u.protocol!=="https:"||u.username||u.password||u.hash||u.hostname==="localhost"||
        !u.hostname.includes(".")||u.hostname.endsWith(".local"))inputError();
    }catch{inputError()}
  }
  const category=CATEGORY_ALIASES[d.category as string] as Category;
  const license=(d.license??"unknown") as License;
  const prose=normalizedText((d.headline?d.headline+" ":"")+(d.text as string));
  const eventTypes=EVENT_RULES.filter(([,re])=>re.test(prose)).map(([tag])=>tag);
  const actions=ACTIONS.filter(([,re])=>re.test(prose)).map(([tag])=>tag);
  const entities=ACTORS.filter(([,re])=>re.test(prose)).map(([tag])=>tag);
  const sourceName=d.source_name?normalizedText(d.source_name as string):null;
  const metrics=extractMetrics(prose);
  const hasData=eventTypes.length>0||actions.length>0||metrics.length>0;
  const id=eventFingerprint([category,sourceName??"",d.published_at??"",
    d.country_iso3??"",d.source_url??"",license,prose].join("|"));
  return {
    schema:REUSABLE_NEWS_JSON_SCHEMA,
    id:"news-"+id,
    id_is_cryptographic_proof:false,
    category,
    country_iso3:d.country_iso3??null,
    source:{publisher_name:sourceName,original_url:d.source_url??null,
      original_published_at:d.published_at??null},
    facts:{
      event_types:eventTypes,
      action_terms:actions,
      named_organizations:entities,
      numeric_mentions:metrics,
      fact_extraction_status:hasData?"MACHINE_EXTRACTED_UNVERIFIED":"INSUFFICIENT_MACHINE_EXTRACTABLE_FACTS",
    },
    usage_rights:{
      declared_source_license:license,
      declaration_is_verified:false,
      article_specific_permission_verified:false,
      commercial_reuse_authorized:false,
      attribution_and_scope_review_required:true,
      factual_analysis_only:true,
    },
    verification:{original_page_verified:false,independent_event_verified:false,
      facts_reviewed:false,source_licence_verified:false},
    delivery:{raw_article_included:false,raw_headline_included:false,
      downstream_paid_product_authorized:false,signing_authorized:false,
      user_submission_persisted:false},
  } as const;
}
export function normalizeReusableNewsBatch(input:unknown){
  if(!Array.isArray(input)||input.length<1||input.length>100)inputError();
  const seen=new Set<string>();
  const items=[];
  for(const row of input){
    const n=normalizeReusableNewsJson(row);
    if(seen.has(n.id))continue;
    seen.add(n.id);items.push(n);
  }
  return {ok:true,schema:"geomacro.reusable-news-json-batch.v1",count:items.length,
    items,commercial_product_ready:false,raw_article_delivered:false};
}
