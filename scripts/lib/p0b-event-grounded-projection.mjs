/** P0-B read-time event-specific research, grounded solely in original publisher
 * title / lawfully available metadata. Never mutates immutable D1/B2 originals.
 * No AI claims, publisher-page verification, instrument prices or paid rights.
 */
import {p0aAuditOriginal} from "./p0a-evidence-quality.mjs";

const EVENTS=[
 ["announces?|announced","announced"],["proposes?|proposed","proposed"],
 ["launches?|launched","launched"],["approves?|approved","approved"],
 ["signs?|signed","signed"],["adopts?|adopted","adopted"],
 ["extends?|extended","extended"],["imposes?|imposed","imposed"],
 ["restricts?|restricted","restricted"],["suspends?|suspended","suspended"],
 ["reopens?|reopened","reopened"],["opens?|opened","opened"],
 ["funds?|funded","funded"],["awards?|awarded","awarded"],
 ["invests?|invested","invested"],["expands?|expanded","expanded"],
 ["cuts?|cut","cut"],["raises?|raised","raised"],["holds?|held","held"],
 ["reduces?|reduced","reduced"],["increases?|increased","increased"],
 ["warns?|warned","warned about"],["reports?|reported","reported"],
 ["publishes?|published","published"],["forecasts?|forecast","forecast"],
 ["meets?|met","met"],["begins?|began","began"],
];
const actionRules=EVENTS.map(([s,past])=>({
 re:new RegExp("^(.{2,95}?)\\s+("+s+")\\s+(.{7,190})$","iu"),past
}));
const unsafe=s=>/[<>]|https?:\/\/|www\.|[\r\n]|\b(?:ignore previous|system prompt|api keys?|disregard instructions)\b/iu.test(s);
const conditional=s=>/\b(?:if|could|might|may|rumou?r|alleged|unconfirmed|claims?|denies|denied|false|fact.check)\b/iu.test(s);
const tidy=s=>String(s).replace(/\s+/gu," ").replace(/[.?!]+$/gu,"").trim();
const mechanism=(category,object)=>{
 if(category==="geopolitics"){
  if(/\b(?:sanctions?|exports?|tariffs?|bans?|embargoes?|trade restrictions?|borders?)\b/iu.test(object))
   return "could change compliance and cross-border trade conditions if implemented; actual enforcement and shipment outcomes require separate evidence";
  if(/\b(?:ceasefire|peace|security|conflict|attack|military|evacuat|humanitarian|refugee)\b/iu.test(object))
   return "makes subsequent on-the-ground compliance, access or security updates relevant; a stated action does not independently confirm the eventual outcome";
  if(/\b(?:treaty|foreign|diplomac|agreement|visa|negotiat|minister|international)\b/iu.test(object))
   return "creates a diplomatic or policy development to track; implementation and cross-border consequences are not demonstrated by the announcement";
 }else if(category==="macro"){
  if(/\b(?:rate|monetary|inflation|cpi|consumer price|central bank|interest)\b/iu.test(object))
   return "makes the stated policy or price development relevant to financing and currency expectations; no traded-market direction is independently confirmed";
  if(/\b(?:gdp|employment|retail|wages|unemployment|industrial|production|trade|exports?|imports?|currency|fx|debt|yield|banking|financial)\b/iu.test(object))
   return "provides a specific economic or financing development to assess against verified data; a release alone does not establish any asset-price reaction";
 }else if(category==="rare_earth"){
  if(/\b(?:lithium|cobalt|nickel|graphite|gallium|germanium|rare.earth|critical mineral|minerals?|copper|tungsten|refin|recycl|mining|processing|battery|magnet|supply)\b/iu.test(object))
   return "creates a mineral-supply or industrial-input milestone to monitor; an announcement is not proof of delivered output, operating capacity or a price move";
 }
 return null;
};
export function p0bHeadlineEvent(title,category){
 if(typeof title!=="string"||title.length<18||title.length>260||unsafe(title)||
  conditional(title)||!/^[\p{Lu}\p{N}]/u.test(title))return null;
 const clean=tidy(title).replace(/^(?:Breaking|Update):\s+/iu,"");
 // Public-government release titles often describe a *speech act* as a
 // noun ("Minister's call with...") rather than actor + finite verb.
 // Such wording can support the fact that a call/statement occurred, but
 // NEVER prove that an agreement, sanction or outcome took effect.
 const noDaySuffix=clean.replace(/:\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}$/u,"");
 if(category==="geopolitics"){
  const call=/^(.{5,95}?)(?:['’]s)?\s+call with (.{5,130})$/iu.exec(noDaySuffix);
  const statement=/^(.{5,95}?)(?:['’]s)?\s+statement (?:on|about|regarding) (.{5,130})$/iu.exec(noDaySuffix);
  const speech=call??statement;
  if(speech){
   const actor=tidy(speech[1]),object=tidy(speech[2]);
   if(!unsafe(actor)&&!unsafe(object)&&!conditional(actor)&&
      !conditional(object)&&actor.length>=5&&object.length>=5){
    const what=call?actor+" held a call with "+object+".":
     actor+" issued a statement about "+object+".";
    const why=call?"The reported call with "+object+
     " is a diplomatic engagement to monitor; any resulting agreement or policy change remains unverified.":
     "The reported statement about "+object+
     " establishes a declared diplomatic position, not proof of implemented action or market consequences.";
    if(what.length<=1200&&why.length<=1200)
     return Object.freeze({what,why,actor,object});
   }
  }
 }
 for(const {re,past} of actionRules){
  const match=re.exec(clean);
  if(!match)continue;
  const actor=tidy(match[1]),object=tidy(match[3]);
  if(actor.length>95||object.length<7||object.length>175||
   /[,;:!?]/u.test(actor)||unsafe(object)||conditional(object)||
   /^(?:this|these|the report|an official|the source|a publication)$/iu.test(actor))continue;
  const rule=mechanism(category,object);
  if(!rule)continue;
  const what=actor+" "+past+" "+object+".";
  const why="The reported "+object+" "+rule+".";
  if(what.length>1200||why.length>1200)return null;
  return Object.freeze({what,why,actor,object});
 }
 return null;
}
export function p0bProjectEvidenceBounded(item){
 if(!item?.analysis||!item?.original||!item.record_id)return null;
 const originalAudit=p0aAuditOriginal(item);
 if(originalAudit.status==="PASS")return Object.freeze(item.analysis);
 const event=p0bHeadlineEvent(item.original.original_title,item.category);
 if(!event)return null;
 const candidate={...item.analysis,
   what_happened:{...item.analysis.what_happened,text:event.what},
   why_it_matters:{...item.analysis.why_it_matters,text:event.why,
     independently_verified:false}};
 // Never overwrite an original or turn a new private projection into paid proof.
 const after=p0aAuditOriginal({...item,analysis:candidate});
 return after.status==="PASS"?Object.freeze(candidate):null;
}
