import { COUNTRIES_195, type Country195 } from "./canonical-country-registry-195";
import { discoverOnDemandForPrivateQualification, verifyOnDemandOriginalArticlePages,
  inferOnDemandMineral, matchesRequestedTopic, type OnDemandCategory,
  type OnDemandMineral } from "./on-demand-global-discovery.server";
import { deriveStatelessSignals } from "./stateless-intelligence-model";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

/** Public free question-time original-source observations. No signing, rights
 * promotion, source redistribution, storage writes, or payment acceptance. */
export type AskOriginalPlan = Readonly<{
  country_iso3: string; country_name: string; categories: OnDemandCategory[];
  topics: string[]; mineral: OnDemandMineral | null; max_age_seconds: number;
}>;
const DOMAINS: ReadonlyArray<{domain:OnDemandCategory;pattern:RegExp}> = [
  {domain:"geopolitics",pattern:/\b(sanctions?|embargo|ceasefire|military|conflict|war|diplomac(?:y|tic)|geopolitic(?:s|al)?|election|foreign policy|border)\b/iu},
  {domain:"macro",pattern:/\b(inflation|cpi|gdp|central bank|monetary|interest rates?|macro(?:economic|economics|\/fx)?|foreign exchange|currency|sovereign debt|fiscal|fx)\b/iu},
  {domain:"rare_earth",pattern:/\b(critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mineral supply|mining)\b/iu},
];
const CURRENT = /\b(latest|new|news|today|now|current|recent|recently|updates?|developments?|announc(?:e|ed|ement)|what changed|what happened|this week|last \d+ (?:hours?|days?|weeks?)|past \d+ (?:hours?|days?|weeks?))\b/iu;
const NUMERIC = /\b(how much|how many|exact|percentage|percent|rate|value|price|figure|number|risk scores?|predict|forecast)\b|[%$₹€]/iu;
type CountrySpan=Readonly<{iso3:string;start:number;end:number}>;
function countrySpans(question:string,country:Country195):CountrySpan[]{
  const terms=[country.name,...country.aliases,country.iso3];
  if(country.iso3==="USA")terms.push("US");
  if(country.iso3==="GBR")terms.push("UK");
  const spans:CountrySpan[]=[];
  for(const term of terms){
    const strict=term.length<4||term===country.iso3;
    const needle=strict?term:term.toLocaleLowerCase();
    const haystack=strict?question:question.toLocaleLowerCase();
    let start=0;
    while(start<haystack.length){
      const at=haystack.indexOf(needle,start);
      if(at<0)break;
      const end=at+needle.length;
      const left=at>0?question[at-1]:"";
      const right=end<question.length?question[end]:"";
      if((!left||!/[\p{L}\p{N}]/u.test(left)) &&
         (!right||!/[\p{L}\p{N}]/u.test(right))){
        spans.push({iso3:country.iso3,start:at,end});
      }
      start=end;
    }
  }
  return spans;
}
function resolveCountry(question:string):Country195|null{
  const spans=COUNTRIES_195.flatMap(country=>countrySpans(question,country));
  // "South Sudan" must not incorrectly be treated as two countries simply
  // because "Sudan" is a contained substring. Disjoint mentions are ambiguous.
  const specific=spans.filter(row=>!spans.some(other=>
    other.iso3!==row.iso3 && other.start<=row.start &&
    other.end>=row.end && other.end-other.start>row.end-row.start));
  const ids=Array.from(new Set(specific.map(row=>row.iso3)));
  return ids.length===1?COUNTRIES_195.find(country=>country.iso3===ids[0])??null:null;
}
function ageSeconds(question:string):number {
  const m=/\b(?:last|past|within)\s+(\d{1,2})\s*(hours?|days?|weeks?)\b/iu.exec(question);
  if(m){
    const factor=m[2].toLowerCase().startsWith("hour")?3600:
      m[2].toLowerCase().startsWith("day")?86400:604800;
    return Math.max(3600,Math.min(31*86400,Number(m[1])*factor));
  }
  return /\b(this week|recent|recently)\b/iu.test(question)?7*86400:86400;
}
/** Fail on ambiguity, rather than guessing a country, source, mineral or
 * unsupported numeric value. Only fixed identifiers reach providers. */
export function planAskOriginalQuestion(question:string):AskOriginalPlan|null {
  if(!question || question.length>300 || !CURRENT.test(question) || NUMERIC.test(question))return null;
  const country=resolveCountry(question);
  if(!country)return null;
  const detected=DOMAINS.filter(row=>row.pattern.test(question)).map(row=>row.domain);
  const categories:OnDemandCategory[]=detected.length?detected:["geopolitics","macro","rare_earth"];
  const topics:string[]=[];
  if(categories.includes("geopolitics")){
    if(/\b(sanction|embargo|export controls?|trade restriction)/iu.test(question))topics.push("sanctions_restrictions");
    else if(/\b(conflict|war|ceasefire|military|security)\b/iu.test(question))topics.push("conflict_geopolitics");
    else topics.push("political_governance");
  }
  if(categories.includes("macro")){
    if(/\b(fx|currency|foreign exchange|exchange rate)\b/iu.test(question))topics.push("fx_external_risk");
    else if(/\b(sovereign debt|fiscal|budget)\b/iu.test(question))topics.push("sovereign_risk");
    else topics.push("macro_risk");
  }
  if(categories.includes("rare_earth"))topics.push("critical_minerals");
  let mineral:OnDemandMineral|null=null;
  if(categories.includes("rare_earth")){
    try{mineral=inferOnDemandMineral(question);}catch{return null;}
  }
  return {country_iso3:country.iso3,country_name:country.name,
    categories,topics,mineral,max_age_seconds:ageSeconds(question)};
}
export async function answerFromCurrentOriginals(
  question:string,
  options:{now?:Date;discover?:typeof discoverOnDemandForPrivateQualification;
    verifyPages?:typeof verifyOnDemandOriginalArticlePages}={},
):Promise<HybridAskAnswer|null>{
  const plan=planAskOriginalQuestion(question);
  if(!plan)return null;
  const now=options.now??new Date();
  const discover=options.discover??discoverOnDemandForPrivateQualification;
  const verifyPages=options.verifyPages??verifyOnDemandOriginalArticlePages;
  const privateResult=await discover({country_iso3:plan.country_iso3,
    categories:plan.categories,topics:plan.topics,mineral:plan.mineral,
    max_age_seconds:plan.max_age_seconds},{now});
  const candidates=privateResult.private_candidates.filter(item=>
    item.country_iso3===plan.country_iso3 &&
    plan.categories.includes(item.domain) &&
    matchesRequestedTopic(item.article_title,item.domain,plan.topics));
  if(!candidates.length)return null;
  const pages=await verifyPages(candidates,{now,maxAgeSeconds:plan.max_age_seconds});
  const eligible=pages.verified_candidates.filter(item=>
    item.country_iso3===plan.country_iso3 &&
    item.publisher_article_page_date_verified===true &&
    item.first_party_article_url_verified===true &&
    plan.categories.includes(item.domain) &&
    matchesRequestedTopic(item.article_title,item.domain,plan.topics) &&
    (plan.mineral===null ||
      (plan.mineral==="rare earth"
        ? /\brare[- ]earths?\b/iu.test(item.article_title)
        : item.article_title.toLocaleLowerCase().split(/[^a-z]+/u).includes(plan.mineral))));
  const signals=deriveStatelessSignals(eligible.map(item=>({
    title:item.article_title,articleUrl:item.article_url,
    publishedAt:item.page_original_published_at,sourceId:item.publisher_family,
    category:item.domain,credit:null,
  })),now.getTime()).filter(item=>{
    const at=Date.parse(item.published_at);
    return Number.isFinite(at) && at<=now.getTime()-15*60_000 &&
      at>=now.getTime()-plan.max_age_seconds*1000;
  }).slice(0,3);
  if(!signals.length)return null;
  const newest=signals.map(item=>item.published_at).sort().at(-1)!;
  return {
    summary:signals[0].what_changed,
    what_changed:signals.map(item=>item.what_changed).join(" "),
    why_it_matters:signals.map(item=>item.why_it_matters).join(" "),
    geomacro_view:"Country/topic-matched original article release dates verified. These are unscored observations, not independently confirmed effects, a numeric reading, a forecast or a signed risk object.",
    evidence:signals.map(item=>({eventId:"live:official:"+item.id,title:item.title,relevance:100})),
    insufficient_evidence:false,mean_relevance:null,low_confidence:true,gri:null,
    generatedAt:now.toISOString(),latest_original_published_at:newest,
    data_mode:"ephemeral_live",cache_status:"bypassed",source_identity_exposed:false,
    durable_live_storage_write:false,real_time_message:"Original dated official release; independent event corroboration absent.",
    intelligence_tier:"official_observation_unscored",
    signed_gro_generated:false,independent_same_event_verification:false,
  };
}
