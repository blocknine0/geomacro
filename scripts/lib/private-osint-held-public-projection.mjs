import {createHash} from "node:crypto";
import {validateReusableSourceNewsItem} from "../../workers/control-plane/src/reusable-source-news.mjs";
import {projectSourceNeutralOsintSignal} from "./derived-news-readback-policy.mjs";

const MAX_PUBLIC_ROWS=475;
const TOPIC_BY_CATEGORY=Object.freeze({
 geopolitics:Object.freeze([
  [/sanction|embargo|trade restriction/u,"sanctions and trade restrictions"],
  [/conflict|security|diplomacy|military|border/u,"geopolitical security"],
 ]),
 macro:Object.freeze([
  [/monetary|interest rate|central bank/u,"monetary policy"],
  [/inflation|consumer price|cpi/u,"inflation and prices"],
  [/currency|exchange rate|fx|foreign exchange/u,"FX and external balances"],
  [/statistics|economic indicator|gdp|employment/u,"official economic statistics"],
 ]),
 rare_earth:Object.freeze([
  [/rare earth|lithium|cobalt|nickel|graphite|gallium|germanium|copper/u,"critical-mineral inputs"],
  [/mineral|mining|refining|processing|supply chain/u,"rare-earth supply"],
 ]),
});

function topicFor(item){
 const text=[...item.facts.event_types,...item.facts.action_terms].join(" ").toLowerCase();
 return TOPIC_BY_CATEGORY[item.category].find(([pattern])=>pattern.test(text))?.[1]??null;
}

/** Turn an already-normalized private OSINT record into the same source-neutral
 * unverified card the Website Intelligence client understands. Never include
 * raw titles, URLs, source identities, actor names, or extracted free text. */
export function projectHeldPrivateOsintItem(item,now=Date.now()){
 if(!Number.isFinite(now))throw Error("PRIVATE_OSINT_PUBLIC_PROJECTION_CLOCK_INVALID");
 validateReusableSourceNewsItem(item,now);
 if(!item.country_iso3)return null;
 const topic=topicFor(item);if(!topic)return null;
 const action=[...item.facts.action_terms,...item.facts.event_types].join(" ");
 const event_direction=/ban|restrict|suspend|halt|disrupt|sanction|attack|close|delay|shortfall/iu.test(action)?"tightening":
  /cut|declin|fall/iu.test(action)?"falling":
  /open|resume|restore|lift|ease|expand|increase|approve|advance|raise/iu.test(action)?"easing":"uncertain";
 const event_action=/disrupt|shortfall|outage|closure|halt/iu.test(action)?"Reported Supply or Operations Disruption":
  /restrict|ban|sanction|embargo/iu.test(action)?"Reported Exposure to Supply Constraints":
  /warn|urge|appeal/iu.test(action)?"Policy Warning or Appeal":
  /approve|authorize|adopt/iu.test(action)?"Approval or Authorization":
  /cut|lower|reduce/iu.test(action)?"Reported Reduction":
  /raise|increase|hike/iu.test(action)?"Reported Increase":"Reported Update";
 const id=item.category+"-"+createHash("sha256").update(item.id).digest("hex").slice(0,8);
 return projectSourceNeutralOsintSignal({
  id,category:item.category,topic,geography:null,country_iso3:item.country_iso3,
  corridor:null,event_direction,event_action,
  development_type:"unverified OSINT feed observation",
  published_at:item.source.original_published_at,date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status:"osint_feed_observed_unverified",same_event_corrob_verified:false,
  severity:null,
 });
}

/** Bounded, newest-first, three-category fair candidate set for the static
 * public archive. The sidecar contains derived cards only, never private items. */
export function buildHeldPrivateOsintProjection(items,now=Date.now(),limit=MAX_PUBLIC_ROWS){
 if(!Array.isArray(items)||items.length>768||!Number.isFinite(now)||
    !Number.isSafeInteger(limit)||limit<1||limit>MAX_PUBLIC_ROWS)
  throw Error("PRIVATE_OSINT_PUBLIC_PROJECTION_INPUT_INVALID");
 const byId=new Map();
 for(const item of items){
  let signal;
  try{signal=projectHeldPrivateOsintItem(item,now)}catch{continue}
  if(signal&&!byId.has(signal.id))byId.set(signal.id,signal);
 }
 const groups=new Map(["geopolitics","macro","rare_earth"].map(category=>[
  category,[...byId.values()].filter(signal=>signal.category===category)
   .sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id)),
 ]));
 const signals=[];
 for(let offset=0;signals.length<limit;offset++){
  let added=false;
  for(const category of groups.keys()){
   const signal=groups.get(category)[offset];
   if(signal&&signals.length<limit){signals.push(signal);added=true}
  }
  if(!added)break;
 }
 return Object.freeze({schema:"geomacro.permanent-derived-news-candidates.v1",signals,
  source_neutral:true,raw_source_text_included:false,source_urls_included:false,
  private_items_included:false,scored:false,chargeable:false,paid_eligible:false});
}
