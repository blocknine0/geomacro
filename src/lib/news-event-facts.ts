/** Bounded fact recomposition from a first-party title/lead, never a topic summary.
 * No model, extra fetch, inferred event actor, price, score or outcome.
 */
export type NewsEventFacts={headline:string;change:string};
const ACTIONS:readonly [string,string][]=[
 ['announces?|announced','announced'],['launches?|launched','launched'],
 ['approves?|approved','approved'],['signs?|signed','signed'],['agrees? to|agreed to','agreed to'],
 ['urges?|urged','urged'],['calls? for|called for','called for'],
 ['warns? (?:that|of|about)|warned (?:that|of|about)','warned about'],
 ['condemns?|condemned','condemned'],['pledges?|pledged','pledged'],
 ['commits? to|committed to','committed to'],['backs?|backed','supported'],
 ['offers?|offered','offered'],['imposes?|imposed','imposed'],
 ['cuts?|cut','cut'],['raises?|raised','raised'],['increases?|increased','increased'],
 ['reduces?|reduced','reduced'],['reports?|reported','reported'],
 ['forecasts?|forecasted','forecast'],['projects|projected','projected'],['expects?|expected','expected'],
 ['reveals?|revealed','reported'],['finds|found','found'],['confirms?|confirmed','confirmed'],['delivers?|delivered','delivered'],
 ['meets?|met','met'],['visits?|visited','visited'],['welcomes?|welcomed','welcomed'],
 ['rejects?|rejected','rejected'],['denies|denied','denied'],
 ['extends?|extended','extended'],['expands?|expanded','expanded'],
 ['invests?|invested','invested'],['funds?|funded','funded'],['awards?|awarded','awarded'],
 ['opens?|opened','opened'],['starts?|started','started'],['begins?|began','began'],
 ['resumes?|resumed','resumed'],['holds?|held','held'],
 ['publishes?|published','published'],['considers?|considered','considered'],
 ['debates?|debated','debated'],['adopts?|adopted','adopted'],
 ['ends?|ended','ended'],['suspends?|suspended','suspended'],['halts?|halted','halted'],
 ['says?|said','said'],['tells?|told','told'],
];
const ACTION_RULES=ACTIONS.map(([pattern,past])=>({pattern:new RegExp('^(.{2,100}?)\\s+('+pattern+')\\s+(.{4,190})$','iu'),past}));
const ALIASES:Record<string,string>={UK:'United Kingdom',US:'United States',UN:'United Nations',
 ECB:'European Central Bank',EIA:'US Energy Information Administration',ONS:'Office for National Statistics'};
const unsafe=(s:string)=>/[<>]|https?:\/\/|www\.|\b(?:ignore (?:all |previous )?instructions|system prompt|api key)\b/iu.test(s);
const clean=(s:string)=>s.replace(/\s*[\u2013\u2014]\s*/gu,', ').replace(/\s+/gu,' ').trim();
function actorName(s:string){
 const name=s.replace(/^the /iu,'').trim();
 if(name.length<2||name.length>100||/[?:;“”‘’"!]/u.test(name)||
  /\b(?:could|might|may|will|would|must|should|not|never|if|unless)\b/iu.test(name)||
  /^(?:It|They|We|I|You|This|That|These|Those|There|Several|Many|Some|An? official|A release|The release|A statement|Officials?|Experts?|Government|Minister)$/iu.test(name))return null;
 const proper=/^[\p{Lu}][\p{L}\p{M}.'’()\d-]*(?:\s+(?:of|the|and|for|to|on|in|at|government|authorities|police|military|experts|scientists|project|parliament|[\p{Lu}][\p{L}\p{M}.'’()\d-]*)){0,13}$/u;
 if(!proper.test(name))return null;
 return ALIASES[name]??name;
}
function result(actor:string,verb:string,object:string):NewsEventFacts|null {
 const tail=object.trim().replace(/[.!]+$/u,'').replace(/^a mixed picture for /iu,'differing outcomes for ');
 if(tail.length<4||tail.length>190||unsafe(tail)||/^(?:it|this|that|them)$/iu.test(tail))return null;
 const clause=actor+' '+verb+' '+tail;
 if(clause.length>210)return null;
 // Colon makes the headline a recomposed fact even if the native verb is past.
 return {headline:actor+': '+verb+' '+tail,change:clause+'.'};
}
const statsAgency=(sourceId:string)=>sourceId.startsWith('statcan_')?'Statistics Canada':
 sourceId.startsWith('bls_')?'US Bureau of Labor Statistics':
 /^(?:ons_|uk_ons)/u.test(sourceId)?'Office for National Statistics':
 sourceId.startsWith('ecb_')?'European Central Bank':
 sourceId.startsWith('boj_')?'Bank of Japan':
 sourceId.startsWith('boc_')?'Bank of Canada':null;
const METRIC=/\b(?:consumer price|producer price|CPI|GDP|gross domestic product|employment|unemployment|earnings|wages|retail sales|trade balance|exports|imports|inflation|exchange rate|interest rate)\b/iu;
export function newsEventFacts(title:string,description='',sourceId=''):NewsEventFacts|null {
 if(typeof title!=='string'||title.length>500||unsafe(title)||
  typeof description!=='string'||description.length>1500||unsafe(description))return null;
 const texts=[title,...description.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u).slice(0,3)];
 const agency=statsAgency(sourceId);
 for(const raw of texts){
  let text=clean(raw).replace(/[.!]+$/u,'');
  if(text.length<15||text.length>500)continue;
  // A place/topic prefix is not itself the actor. Keep the named actor that follows.
  const colon=/^([^:]{2,45}):\s+(.+)$/u.exec(text);
  if(colon){
   if(/\b(?:proposal|proposed|draft|scenario|hypothetical|if|forecast|outlook|fact.?check|false|misleading|rumou?r|claim)\b/iu.test(colon[1]))continue;
   text=colon[2];
  }
  text=text.replace(/^(?:On (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|Today|Yesterday),\s+/u,'');
  if(agency&&METRIC.test(text)){
   const metric=/^(?:The )?(.{4,85}?)\s+(rose|fell|grew|increased|decreased|declined|was|were|remained)\s+(.{3,160})$/iu.exec(text);
   if(metric&&METRIC.test(metric[1])&&/\d/u.test(metric[3])&&
     !/\b(?:could|might|may|will|would|forecast|expected)\b/iu.test(text)){
    const fact=metric[1]+' '+metric[2].toLowerCase()+' '+metric[3];
    if(fact.length<175)return {headline:agency+': '+fact,change:agency+' reported that '+fact+'.'};
   }
  }
  const passive=/^(.{5,160}?)\s+(?:(?:was|were|is|are)\s+)?(approved|funded|announced|signed|opened|launched|extended|adopted|suspended)\s+by\s+(.{2,100})$/iu.exec(text);
  if(passive&&!/\b(?:not|never|could|might|may|will|would|to be|failed)\b/iu.test(passive[1])){
   const actor=actorName(passive[3]);
   if(actor){const value=result(actor,passive[2].toLowerCase(),passive[1].replace(/\s+(?:was|were|is|are)$/iu,''));if(value)return value;}
  }
  // Explicit trailing attribution: retain a warning/request as that speech act.
  const trailing=/^(.{8,180}?),\s*(says?|said|warns?|warned|urges?|urged)\s+(.{2,100}?)(?:\s+(?:at|in|on)\s+.{2,100})?$/iu.exec(text);
  if(trailing){
   const actor=actorName(trailing[3]);
   if(actor){const verb=/warn/iu.test(trailing[2])?'warned that':/urg/iu.test(trailing[2])?'urged':'said that';
    const value=result(actor,verb,trailing[1]);if(value)return value;}
  }
  for(const {pattern,past} of ACTION_RULES){
   const found=pattern.exec(text);
   if(!found)continue;
   const actor=actorName(found[1]);if(!actor)continue;
   if(/^(?:reveals?|shows?|says?|finds?|warns?|announces?|indicates?|suggests?|urges?|is|are|was|were)\b/iu.test(found[3]))continue;
   // Do not change a warning's "that" into "about" or discard its object.
   const verb=/^warn/iu.test(found[2])?'warned '+found[2].split(/\s/u).at(-1):past;
   const value=result(actor,verb,found[3]);if(value)return value;
  }
 }
 // A country-attributed statement is an explicit publication action; its
 // subject is retained without pretending that a requested outcome occurred.
 const statement=/^(?:(.{8,130}):\s*)?(UK|United Kingdom|US|United States) statement (at|to|on) (.{5,120})$/iu.exec(clean(title));
 if(statement){
  const actor=ALIASES[statement[2]]??statement[2];
  const subject=statement[1]??statement[4];
  if(actor.length+subject.length<175&&!/\b(?:could|might|may|would|hypothetical)\b/iu.test(subject))
   return {headline:actor+' issued a statement '+(statement[1]?'concerning '+subject:statement[3]+' '+statement[4]),
    change:actor+' issued a statement '+statement[3]+' '+statement[4]+(statement[1]?' concerning '+statement[1]:'')+'.'};
 }
 // A named statistical issue is a specific publication action, not a made-up value.
 if(agency&&METRIC.test(title)){
  const metric=/consumer price|\bCPI\b/iu.test(title)?'consumer-price figures':
   /producer price/iu.test(title)?'producer-price figures':
   /GDP|gross domestic product/iu.test(title)?'GDP estimates':
   /employment|unemployment/iu.test(title)?'employment figures':
   /earnings|wages/iu.test(title)?'earnings figures':
   /retail sales/iu.test(title)?'retail-sales figures':
   /trade balance|exports|imports/iu.test(title)?'international-trade figures':null;
  const period=/\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}|20\d{2}\s+Q[1-4]|Q[1-4]\s+20\d{2})\b/iu.exec(title)?.[0];
  if(metric&&period)return {headline:agency+' published '+metric+' for '+period,
   change:agency+' published '+metric+' for '+period+'. The available metadata does not establish the numerical value or change.'};
 }
 return null;
}
/** Presentation admission, independent of signatures/retention. Never invent a fact. */
export function hasConcreteNewsFacts(signal:{title?:unknown;what_changed?:unknown}):boolean {
 return typeof signal.title==='string'&&signal.title.trim().length>=12&&
  typeof signal.what_changed==='string'&&signal.what_changed.trim().length>=30&&
  !/^(?:An official publisher\b|A dated first-party (?:source item|.{0,45}release was observed)\b|The observed release does not\b|The release\b)/iu.test(signal.what_changed)&&
  !/^Official publisher issues /iu.test(signal.title)&&
  !/^Geomacro finds (?:official update|announcement|security|research|policy update|risk update|price data|monetary policy|funding|agreement|production|approval|trade restriction) on /iu.test(signal.title);
}
/** A live re-read using an older renderer must not overwrite concrete retained text. */
export function mergeNewsRevisions<T extends {id:string;category:string;published_at:string;title:string;what_changed:string}>(
 journal:readonly T[],live:readonly T[]):Map<string,T>{
 const rows=new Map(journal.map(s=>[s.id,s]));
 for(const signal of live){
  const previous=rows.get(signal.id);
  if(!previous){rows.set(signal.id,signal);continue;}
  if(previous.category!==signal.category||previous.published_at!==signal.published_at)continue;
  if(!hasConcreteNewsFacts(previous)&&hasConcreteNewsFacts(signal))rows.set(signal.id,signal);
 }
 return rows;
}
