/**
 * One in-memory identity index per completed protected source sweep.
 * A source is fetched/parsed by the existing private collector ONCE; its
 * category callbacks here are consolidated before any D1 admission.
 * This is NOT a durable backlog, publisher verification or right to resell.
 */
import {phase2iSourceOnlyCategoryRelevant} from "./phase2i-osint-country-fair-raw-staging.mjs";
const CATEGORIES=["geopolitics","macro","rare_earth"];
export function createPhase2iSingleSweepOriginalIndex({pinnedCategories,topics}={}){
 if(!(pinnedCategories instanceof Map)||CATEGORIES.some(c=>!(topics?.[c] instanceof RegExp)))
  throw Error("PHASE2I_SINGLE_SWEEP_CONFIG_INVALID");
 const originals=new Map(),conflicted=new Set();
 let callbackCount=0,offtopic=0,invalid=0,repeated=0,crossCategory=0,quarantined=0;
 const observe=raw=>{
  callbackCount++;
  if(!phase2iSourceOnlyCategoryRelevant(raw,pinnedCategories,topics)){
   offtopic++;return;
  }
  if(typeof raw.article_url!=="string"||typeof raw.published_at!=="string"){
   invalid++;return;
  }
  let source,article;
  try{source=new URL(raw.source_url);article=new URL(raw.article_url);}
  catch{invalid++;return}
  if(source.protocol!=="https:"||source.username||source.password||source.port||
     article.protocol!=="https:"||article.username||article.password||article.port||
     article.hash||article.username||article.password||article.href.length>1800||
     source.hostname.length>110||!source.hostname.includes(".")||
     !article.hostname.includes(".")){
   invalid++;return;
  }
  // Stable original permalink and native publication instant (not query or
  // category) identify a single publisher item in the collected sweep.
  const key=JSON.stringify([article.href,raw.published_at]);
  if(conflicted.has(key)){repeated++;return}
  const previous=originals.get(key);
  if(previous){
   // A reused immutable permalink/clock claiming different original titles
   // is ambiguous: quarantine all its category projections, never overwrite.
   if(previous.title!==raw.title){
    originals.delete(key);conflicted.add(key);quarantined++;return;
   }
   // Two exact same original links/clocks may arrive from two independent
   // feeds. Preserve the native original (existing contract) but DISABLE the
   // issuer hint unless the same pinned source and hint agree.
   if(previous.sourceUrl!==raw.source_url||
      previous.issuerContextCountryIso3!==(raw.issuer_context_country_iso3??null)){
    previous.sourceUrl=null;
    previous.issuerContextCountryIso3=null;
   }
   if(previous.categories.has(raw.category))repeated++;
   else{previous.categories.add(raw.category);crossCategory++;}
   return;
  }
  originals.set(key,{articleUrl:article.href,publishedAt:raw.published_at,
   sourceId:source.hostname,sourceUrl:raw.source_url,
   issuerContextCountryIso3:raw.issuer_context_country_iso3??null,
   title:raw.title,categories:new Set([raw.category])});
 };
 const finish=()=>{
  const candidates=[];
  for(const original of originals.values())
   for(const category of CATEGORIES)if(original.categories.has(category))
    candidates.push({category,articleUrl:original.articleUrl,
     publishedAt:original.publishedAt,title:original.title,
     sourceId:original.sourceId,sourceUrl:original.sourceUrl,
     issuerContextCountryIso3:original.issuerContextCountryIso3,credit:null});
  return Object.freeze({
   candidates,
   summary:Object.freeze({
    original_callback_observations:callbackCount,
    unique_original_article_identities:originals.size,
    category_scoped_record_candidates:candidates.length,
    repeated_exact_original_category_callbacks_dropped:repeated,
    distinct_originals_relevant_to_multiple_categories:[...originals.values()]
      .filter(x=>x.categories.size>1).length,
    additional_relevant_category_projections:crossCategory,
    contradictory_immutable_originals_quarantined:quarantined,
    off_category_callbacks_filtered:offtopic,invalid_original_callbacks:invalid,
    single_source_sweep:true,no_extra_publisher_requests:true,
    durable_backlog_confirmed:false,
   }),
  });
 };
 return Object.freeze({observe,finish});
}
