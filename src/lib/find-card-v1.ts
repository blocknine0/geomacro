import {hasConcreteNewsFacts,newsEventFacts} from "./news-event-facts";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import type {StatelessIntelligenceSignal,StatelessCategory} from "./stateless-intelligence-model";

/**
 * Public derived-only card. Not a GRO or commercial same-event verdict.
 * No raw article, upstream title, publisher identity, URL, score or licence
 * fields may ever be copied into this schema.
 */
export type FindCardV1={
  schema:"geomacro.find.v1";id:string;domain:StatelessCategory;
  published_at:string;date_precision:"exact"|"day";
  action_class?:string;headline:string;what_changed:string;
  facts:Array<{kind:"actor"|"action"|"indicator"|"period"|"value"|"prior"|"change"|
    "currency_pair"|"mineral"|"stage"|"quantity"|"amount"|"jurisdiction"|
    "counterparty"|"effective_date"|"deadline"|"instrument"|"licence_regime";
    label:string;value:string;unit?:string}>;
  why_it_matters:string;
  watch_next:{kind:"next_release"|"effective_date"|"deadline"|"comment_period"|
    "follow_up_check"|"not_captured";text:string;date?:string|null};
  ladder:"ANNOUNCED"|"CORROBORATED"|"OBSERVED";
  evidence_directness:"DIRECT"|"INDIRECT"|"NONE";
  subjects:{countries:string[];corridors:string[];commodities:string[];instruments:string[]};
  freshness:"realtime"|"near_realtime"|"daily"|"weekly"|"monthly"|"quarterly"|"annual";
  detail_state:"FULL"|"LIMITED";extraction_confidence:number;severity?:null;
};
const domainNames=["geopolitics","macro","rare_earth"] as const;
const kinds=["actor","action","indicator","period","value","prior","change",
 "currency_pair","mineral","stage","quantity","amount","jurisdiction",
 "counterparty","effective_date","deadline","instrument","licence_regime"];
const watchKinds=["next_release","effective_date","deadline","comment_period","follow_up_check","not_captured"];
const freshnessNames=["realtime","near_realtime","daily","weekly","monthly","quarterly","annual"];
const fields=["schema","id","domain","published_at","date_precision","action_class",
 "headline","what_changed","facts","why_it_matters","watch_next","ladder",
 "evidence_directness","subjects","freshness","detail_state","extraction_confidence","severity"];
const required=fields.filter(x=>!["action_class","severity"].includes(x));
const isObject=(x:unknown):x is Record<string,unknown> =>
 !!x&&typeof x==="object"&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,allowed:readonly string[],needed:readonly string[]) =>
 Object.keys(x).every(k=>allowed.includes(k))&&needed.every(k=>Object.hasOwn(x,k));
const inSet=(x:unknown,allowed:readonly string[])=>typeof x==="string"&&allowed.includes(x);
const prose=(x:unknown,max:number)=>typeof x==="string"&&x.length<=max&&
 !/[<>]/u.test(x)&&!/(?:https?:\/\/|www\.)/iu.test(x);
const validDay=(text:string):boolean=>{
 if(!/^\d{4}-\d\d-\d\d$/u.test(text))return false;
 const date=new Date(text+"T00:00:00.000Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text;
};
const instant=(x:unknown)=>typeof x==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/u.test(x)&&
 validDay(x.slice(0,10))&&Number.isFinite(Date.parse(x));
export function isFindCardV1(input:unknown):input is FindCardV1{
 if(!isObject(input)||!exact(input,fields,required)||
    input.schema!=="geomacro.find.v1"||!inSet(input.domain,domainNames)||
    typeof input.id!=="string"||input.id.length<8||
    !instant(input.published_at)||!inSet(input.date_precision,["exact","day"])||
    (input.date_precision==="day"&&!/T00:00:00(?:\.000)?Z$/u.test(String(input.published_at)))||
    ("action_class" in input&&!(typeof input.action_class==="string"&&/^[a-z_]+$/u.test(input.action_class)))||
    !prose(input.headline,120)||!prose(input.what_changed,280)||
    !prose(input.why_it_matters,260)||
    !inSet(input.ladder,["ANNOUNCED","CORROBORATED","OBSERVED"])||
    !inSet(input.evidence_directness,["DIRECT","INDIRECT","NONE"])||
    (input.ladder!=="ANNOUNCED"&&input.evidence_directness==="NONE")||
    !inSet(input.freshness,freshnessNames)||
    !inSet(input.detail_state,["FULL","LIMITED"])||
    typeof input.extraction_confidence!=="number"||
    !Number.isFinite(input.extraction_confidence)||
    input.extraction_confidence<0||input.extraction_confidence>1||
    (input.detail_state==="LIMITED"&&input.extraction_confidence>0.5)||
    ("severity" in input&&input.severity!==null)||
    !Array.isArray(input.facts)||input.facts.length>8||
    (input.detail_state==="LIMITED"&&input.facts.length>3)
 )return false;
 for(const fact of input.facts){
  if(!isObject(fact)||!exact(fact,["kind","label","value","unit"],["kind","label","value"])||
     !inSet(fact.kind,kinds)||!prose(fact.label,32)||!prose(fact.value,80)||
     ("unit" in fact&&!prose(fact.unit,16)))return false;
 }
 if(input.detail_state==="FULL"){
  const needed=input.domain==="macro"?"indicator":input.domain==="rare_earth"?"mineral":"actor";
  if(!input.facts.some(f=>f.kind===needed))return false;
 }
 const next=input.watch_next;
 if(!isObject(next)||!exact(next,["kind","text","date"],["kind","text"])||
    !inSet(next.kind,watchKinds)||!prose(next.text,160)||
    ("date" in next&&next.date!==null&&
      !(typeof next.date==="string"&&validDay(next.date))))return false;
 const subjects=input.subjects;
 if(!isObject(subjects)||!exact(subjects,["countries","corridors","commodities","instruments"],
   ["countries","corridors","commodities","instruments"]))return false;
 for(const [name,re,max] of [
    ["countries",/^[A-Z]{3}$/u,3],["corridors",/^[a-z0-9_]+$/u,120],
    ["commodities",/^[a-z0-9_]+$/u,120],["instruments",/^.{0,24}$/u,24],
  ] as const){
   const values=subjects[name];
   if(!Array.isArray(values)||values.some(v=>typeof v!=="string"||v.length>max||!re.test(v)))
     return false;
 }
 return true;
}
export function assertFindCardV1(input:unknown):asserts input is FindCardV1{
 if(!isFindCardV1(input))throw Error("GEOMACRO_FIND_CARD_V1_INVALID");
}
const meaning:Record<StatelessCategory,string>={
 geopolitics:"Geopolitical policy releases can change country and corridor operating assumptions; practical effects still require separate confirmation.",
 macro:"Macroeconomic releases can inform funding, FX and cross-border exposures; a directional impact is not established.",
 rare_earth:"Critical-mineral announcements can affect supply-chain planning; production or price effects are not yet established.",
};
export function findCardFromObservedRelease(
 s:StatelessIntelligenceSignal, now=Date.now(),
):FindCardV1|null{
 // Existing public derived-journal proof gates: original date without added wait (or
 // next-day 12:00 for day-only), no copied source title or URL.
 // A required-credit source cannot become an attribution-free Find Card.
 if(s.status!=="official_release_observed_unscored"||
    !verifyDerivedStory(s,now)||!hasConcreteNewsFacts(s)||s.sources_credited.length>0||
    !Number.isFinite(now))return null;
 const originalDate=s.date_precision==="day"
   ?s.published_at+"T00:00:00.000Z":s.published_at;
 const at=Date.parse(originalDate);
 if(!Number.isFinite(at)||at>now)return null;
 const age=now-at;
 const freshness:FindCardV1["freshness"]=
   s.date_precision==="day"?"daily":
   age<=2*60*60_000?"near_realtime":
   age<=86400_000?"daily":age<=7*86400_000?"weekly":"monthly";
 const event=newsEventFacts("",s.what_changed);
 if(!event)return null;
 const headline=event.headline.length<=120?event.headline:
   event.headline.slice(0,116).replace(/\s+\S*$/u,"")+"…";
 const card:FindCardV1={
   schema:"geomacro.find.v1",id:s.id,domain:s.category,
   published_at:originalDate,date_precision:s.date_precision,
   action_class:"official_release",
   headline,what_changed:s.what_changed.slice(0,280),
   facts:[],why_it_matters:meaning[s.category],
   watch_next:{kind:"follow_up_check",
     text:"Check later official releases for confirmed details; no specific deadline was verified."},
   ladder:"ANNOUNCED",evidence_directness:"INDIRECT",
   subjects:{countries:[],corridors:[],commodities:[],instruments:[]},
   freshness,detail_state:"LIMITED",extraction_confidence:0,severity:null,
 };
 return isFindCardV1(card)?card:null;
}
