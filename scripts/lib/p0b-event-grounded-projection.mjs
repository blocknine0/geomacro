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
  if(/\b(?:correspondent banking|swift|sovereign asset freeze|fx repatriation|capital controls?|exchange cyberattack|clearinghouse|payment rail cyberattack|election|central bank independence|windfall tax|nationali[sz]ation|fdi block|cfius|war.risk insurance|vlcc|freight index|baltic dry)\b/iu.test(object))
   return "can affect settlement access, market infrastructure, policy continuity or delivered trade costs; verified implementation and market response remain separate questions";
  if(/\b(?:sanctions?|secondary sanctions?|exports?|tariffs?|bans?|embargoes?|export controls?|dual.use|arms exports?|trade restrictions?|borders?|customs)\b/iu.test(object))
   return "could change compliance and cross-border trade conditions if implemented; actual enforcement and shipment outcomes require separate evidence";
  if(/\b(?:ceasefire|peace|security|conflict|attack|military|naval blockade|border mobilization|coup|martial law|regime instability|sabotage|subsea cable|pipeline|grid|strike|airspace|shipping closure|evacuat|humanitarian|refugee)\b/iu.test(object))
   return "makes subsequent on-the-ground compliance, access or security updates relevant; a stated action does not independently confirm the eventual outcome";
  if(/\b(?:treaty|foreign|diplomac|agreement|visa|negotiat|minister|international)\b/iu.test(object))
   return "creates a diplomatic or policy development to track; implementation and cross-border consequences are not demonstrated by the announcement";
 }else if(category==="macro"){
  if(/\b(?:rate|monetary|inflation|cpi|consumer price|central bank|interest|quantitative easing|quantitative tightening|\bqe\b|\bqt\b|omo|repo|reverse.repo|standing facilit|fx reserves?|sovereign wealth fund|cet1|tier.1|lcr|nsfr|nii|nim|npl|deposit flight|deposit outflow|stress test|basel iii|basel iv|sofr|euribor|tonar|shibor|mibor|hibor|basis swap|bank cds|interbank|yield curve|2s10s|term premium|sovereign cds|bond auction|bid.to.cover|auction tail|ppi|pce|nfp|payroll|retail sales|breakeven)\b/iu.test(object))
   return "makes the stated policy or price development relevant to financing and currency expectations; no traded-market direction is independently confirmed";
  if(/\b(?:gdp|pmi|employment|retail|wages|unemployment|industrial|production|trade|exports?|imports?|currency|fx|debt|yield|banking|financial|capital controls?|repatriation freeze|sovereign default|restructuring|imf bailout|credit downgrade|tariffs?|customs retaliation|swift|payment rail|oil|lng|grain|liquidity|stock exchange|equity index|vix|move index|implied vol|risk reversal|circuit breaker|short.selling ban|ndf|fpi|fii|etf flow|capital outflow|margin call|liquidation cascade|stablecoin|crypto liquidity)\b/iu.test(object))
   return "provides a specific economic or financing development to assess against verified data; a release alone does not establish any asset-price reaction";
 }else if(category==="rare_earth"){
  if(/\b(?:lithium|cobalt|nickel|graphite|gallium|germanium|antimony|tungsten|manganese|vanadium|titanium|uranium|potash|phosphate|ndpr|dysprosium|terbium|rare.earth|critical mineral|minerals?|copper|export ban|export quota|royalty hike|nationali[sz]ation|mine strike|smelter outage|stockpil|refin|recycl|mining|processing|battery|ev|semiconductor|magnet|supply|lme|comex|cme|shfe|ine|dce|sgx|mcx|lbma|warehouse stock|cancelled warrant|backwardation|contango|curve spread|treatment charge|tc.rc|smelter utilization|polysilicon|gold|silver|pgm|platinum|palladium|iron ore|aluminum|tin|zinc|crude|refined products|lng|offtake|exim|dfi|project finance|physical premium)\b/iu.test(object))
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
/** A first-party OG/JSON-LD excerpt can identify an actor/action when a
 * noun-phrase feed title cannot. This is still only a source-grounded PRIVATE
 * research draft, not corroboration, licensing or an independently verified
 * incident. Two actual title tokens must occur in the excerpt.
 */
export function p0bMetadataEvent(title,description,category){
 if(typeof title!=="string"||typeof description!=="string"||
    title.length<18||title.length>260||description.length<45||
    description.length>360||unsafe(title)||unsafe(description)||
    conditional(title))return null;
 const titleTerms=new Set((title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)??[]));
 const descriptionTerms=new Set(description.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)??[]);
 if([...titleTerms].filter(word=>descriptionTerms.has(word)).length<2)return null;
 const first=tidy(description.split(/(?:[.!?]\s+|[.!?]$)/u)[0]??"");
 if(first.length<18||first.length>260)return null;
 const action=p0bHeadlineEvent(first,category);
 if(!action)return null;
 const why="The "+action.actor+" development is relevant: "+action.why;
 if(why.length>1200)return null;
 return Object.freeze({...action,why});
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
