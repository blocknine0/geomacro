import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

/**
 * Only display explicit actor/action words already derived from an original
 * publisher title. Source host, publisher-family and country mentions do NOT
 * establish the actor who acted. Legacy generic 72h D1 records remain usable,
 * but an unidentified actor must be clearly labelled as unknown.
 *
 * No request, upstream article title, hostname, source ID, score or payment.
 */
const GENERIC=/(?:\ban official publisher\b|\bofficial publisher issues\b|\bofficial publisher released\b)/iu;
const PROSE_BAD=/[<>]|https?:\/\/|www\./iu;
const clean=(s:string,max:number)=>typeof s==="string"&&!PROSE_BAD.test(s)?
  s.replace(/\s*[\u2013\u2014]\s*/gu,"; ").replace(/\s+/gu," ").trim().slice(0,max):"";
function topic(s:StatelessIntelligenceSignal){
 const x=clean(s.topic,76);
 return x&&/^[\p{L}\p{N}][\p{L}\p{N} .,/'()-]{0,75}$/u.test(x)?x:"the observed release";
}
const ACTION=/(?:announced|approved|authorized|authorised|urged|warned|called for|appealed for|introduced|launched|cut|raised|lowered|increased|reduced|reported|imposed|proposed|signed|rejected|denied|supported|supports|opened|published|issued|unveiled|released|releases|maintained|maintains|kept|holds|held|left|leaves|forecast|forecasts|projected|projects|revised|revises|estimated|estimates|recorded|records|sets)/iu;
const QUALIFIED=/^((?:UN(?:ited Nations)?(?: Secretary-General| agencies| experts)?|WHO|UNICEF|UNHCR|WFP|IMF|World Bank|Federal Reserve|European Central Bank|Bank of England|European Commission|European Union|Security Council|[A-Z][\p{L}.'-]*(?:\s+(?:of|the|and|for|[A-Z][\p{L}.'-]*)){0,5}))\s+/u;
const NON_ACTORS=new Set(["Official","New","Trade","Interest","Mineral","Policy","Risk","Source","Publication","An","GDP","Inflation","Prices","Consumer","Economic","Employment"]);
export function intelligenceActorHeadline(s:StatelessIntelligenceSignal){
 const title=clean(s.title.replace(/^Geomacro finds\s+/iu,""),160);
 const change=clean(s.what_changed,650);
 const m=title.match(QUALIFIED);
 if(m&&title&&!GENERIC.test(title)&&!GENERIC.test(change)&&
   !NON_ACTORS.has(m[1].trim())&&
   ACTION.test(title.slice(m[0].length))&&
   change.toLocaleLowerCase().startsWith(m[1].trim().toLocaleLowerCase()+" "))
   return title;
 return "Actor not verified: "+topic(s);
}
export function intelligenceActorChange(s:StatelessIntelligenceSignal){
 const change=clean(s.what_changed,650);
 if(change&&!GENERIC.test(change))return change;
 return "The original-dated publication concerns "+topic(s)+
   ". The available verified evidence does not establish who performed a specific action. No outcome is inferred.";
}
export function intelligenceActorIsKnown(s:StatelessIntelligenceSignal){
 return !/^Actor not verified:/u.test(intelligenceActorHeadline(s));
}
