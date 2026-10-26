import {hasConcreteNewsFacts} from "./news-event-facts";
import {isFindCardV1,type FindCardV1} from "./find-card-v1";

/**
 * Free homepage selection ONLY: original-dated, derived/public Find Cards.
 * There is no commercial same-event review, GRO severity, B2 paid hot read
 * or customer payment in this module. All inputs must have passed the D1
 * journal's source-clock and non-attribution boundary first.
 */
export const HOME_FINDS_DOMAINS=["geopolitics","macro","rare_earth"] as const;
const DAY=24*60*60_000;
const MAX_HISTORY=30*DAY;
const PUBLICATION_DELAY_MS=0;
const DAY_ONLY_EMBARGO=36*60*60_000;
export type HomeFindWinner={card:FindCardV1;isCurrent:boolean;originalAt:string};
export function eligibleHomeFindCards(cards:readonly unknown[],now=Date.now()):FindCardV1[]{
  if(!Array.isArray(cards)||!Number.isFinite(now))return [];
  const deduped=new Set<string>();
  return cards.filter((card):card is FindCardV1=>{
    if(!isFindCardV1(card)||!hasConcreteNewsFacts({title:card.headline,what_changed:card.what_changed})||deduped.has(card.id))return false;
    const published=Date.parse(card.published_at);
    const delay=card.date_precision==="day"?DAY_ONLY_EMBARGO:PUBLICATION_DELAY_MS;
    if(!Number.isFinite(published)||published+delay>now||
       now-published>MAX_HISTORY)return false;
    deduped.add(card.id);
    return true;
  });
}
export function selectHomepageFreeFind(cards:readonly unknown[],now=Date.now()):HomeFindWinner|null{
  const available=eligibleHomeFindCards(cards,now);
  if(available.length===0)return null;
  const quality=(v:FindCardV1)=>(
    (v.detail_state==="FULL"?4:0)+
    (v.evidence_directness==="DIRECT"?2:0)+
    v.extraction_confidence
  );
  available.sort((a,b)=>{
    const aDate=Date.parse(a.published_at),bDate=Date.parse(b.published_at);
    const aCurrent=aDate>=now-DAY,bCurrent=bDate>=now-DAY;
    return Number(bCurrent)-Number(aCurrent) ||
      quality(b)-quality(a) || bDate-aDate || a.id.localeCompare(b.id);
  });
  const card=available[0];
  return {card,isCurrent:Date.parse(card.published_at)>=now-DAY,originalAt:card.published_at};
}
export function homeFindsPulse(cards:readonly unknown[],now=Date.now()){
  const qualified=eligibleHomeFindCards(cards,now);
  return HOME_FINDS_DOMAINS.map(key=>{
    const matching=qualified.filter(x=>x.domain===key);
    const fresh=matching.some(x=>Date.parse(x.published_at)>=now-DAY);
    return {key,state:fresh?"recent_original":matching.length?"dated_original":"unavailable"} as const;
  });
}
/** Keep a bounded, original-dated winner when a healthy poll returns no new
 * qualifying story. A refresh can never extend its source-native 30-day age. */
export function mergeHomepageFindCards(previous:readonly unknown[],next:readonly unknown[],now=Date.now()){
 const available=eligibleHomeFindCards([...next,...previous],now);
 const best=selectHomepageFreeFind(available,now)?.card;
 const latest=available.sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)||a.id.localeCompare(b.id)).slice(0,100);
 if(best&&!latest.some(card=>card.id===best.id))latest[latest.length-1]=best;
 return latest;
}
/** Require the exact public no-funds D1-backed API contract; reject
 * unexpected billed/reviewed/scored documents before displaying them.
 */
export function parseHomepageFindsFeed(input:unknown,now=Date.now()):FindCardV1[]{
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("HOME_FINDS_FEED_INVALID");
  const obj=input as Record<string,unknown>;
  if(obj.ok!==true||obj.schema!=="geomacro.find-card-feed.v1"||
     obj.version!=="v1"||obj.chargeable!==false||obj.scored!==false||
     obj.independent_same_event_verified!==false||
     obj.source_metadata_returned!==false||
     (obj.original_release_delay_minutes!==0&&obj.original_release_delay_minutes!==15)||
     !Array.isArray(obj.cards)||obj.cards.length>100||
     JSON.stringify(obj).length>250_000||
     obj.cards.some(card=>!isFindCardV1(card)))
    throw Error("HOME_FINDS_FEED_INVALID");
  return eligibleHomeFindCards(obj.cards,now);
}


/**
 * Presentation-only guard for older D1 Find Card v1 payloads created before
 * the actor-first copy policy. The first-party observed release and its clock
 * are unchanged; a publisher is NOT automatically the event actor.
 * Do not turn an unattributed release into a named organization or outcome.
 */
const LEGACY_UNKNOWN_ACTOR=/\b(?:an official publisher|official publisher issues|official publisher released)\b/iu;
const ACTORLESS_TOPIC:Record<FindCardV1["domain"],string>={
  geopolitics:"geopolitical development",
  macro:"macroeconomic release",
  rare_earth:"critical-minerals release",
};
export function publicHomeFindCopy(card:FindCardV1):{headline:string;what_changed:string}{
  const genericHeadline=LEGACY_UNKNOWN_ACTOR.test(card.headline);
  const genericChange=LEGACY_UNKNOWN_ACTOR.test(card.what_changed);
  if(!genericHeadline&&!genericChange)return {
    headline:card.headline,what_changed:card.what_changed,
  };
  const topic=ACTORLESS_TOPIC[card.domain];
  return {
    headline:genericHeadline?"Actor not verified: "+topic:card.headline,
    what_changed:genericChange
      ?"An original-dated "+topic+" was observed. The available evidence does not establish who performed a specific action or its real-world outcome."
      :card.what_changed,
  };
}
