import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

/**
 * Presentation + intake dedup of derived-only news. No publisher IDs, private
 * URLs, original text or third-party API calls are required.
 * One event appears once across the entire public desk, not once per category.
 * Keep distinct dates, opposing actions, countries and numerical measures.
 */
const FILLER=/\b(?:geomacro finds|a monitored source feed reports|this report has not been independently verified|country or region mentioned|the dated original release)\b/giu;
const STOP=new Set(["a","an","the","in","on","at","for","from","to","of","and","or",
 "with","by","as","its","their","after","over","under","about","new","latest",
 "that","this","was","were","is","are","be","has","have","had","according"]);
const VERBS:Record<string,string>={
 announces:"announce",announced:"announce",announcement:"announce",
 reports:"report",reported:"report",reporting:"report",
 warns:"warn",warned:"warn",warning:"warn",
 approves:"approve",approved:"approve",approval:"approve",
 urges:"urge",urged:"urge",
 rejects:"reject",rejected:"reject",
 cuts:"cut",cut:"cut",lowered:"cut",lowers:"cut",reduced:"cut",reduces:"cut",
 raises:"raise",raised:"raise",increased:"raise",increases:"raise",
 proposes:"propose",proposed:"propose",proposal:"propose",
 launches:"launch",launched:"launch",launch:"launch",
 introduces:"introduce",introduced:"introduce",
 imposes:"impose",imposed:"impose",signed:"sign",signs:"sign",
 confirms:"confirm",confirmed:"confirm",condemned:"condemn",condemns:"condemn",
 issues:"issue",issued:"issue",says:"say",said:"say",
 supports:"support",supported:"support",opens:"open",opened:"open",
};
const POLARITY=new Set(["not","no","never","denies","denied","reject","withdraws","withdrawn"]);
const WINDOW=36*3600_000;
type Descriptor={row:StatelessIntelligenceSignal;time:number;tokens:Set<string>;
 numbers:Set<string>;action:string|null;negative:boolean;headline:string;categoryFit:number};
function tokenise(text:string):string[]{
 const clean=text.toLocaleLowerCase().normalize("NFKC")
  .replace(FILLER," ").replace(/\b(?:u\.?s\.?a?|united states of america)\b/giu,"united states")
  .replace(/\b(?:u\.?k\.?|britain)\b/giu,"united kingdom")
  .replace(/\b(?:fed)\b/giu,"federal reserve")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim();
 return clean.split(/\s+/u).filter(Boolean).map(w=>VERBS[w]??w)
  .filter(w=>!STOP.has(w));
}
function descriptor(row:StatelessIntelligenceSignal):Descriptor{
 const headline=row.title.replace(/^Geomacro finds\s+/iu,"")
  .replace(/\s+·\s+[^·]{2,80}$/u,"").trim();
 const words=tokenise(headline);
 const action=words.find(w=>Object.values(VERBS).includes(w))??null;
 const topicText=[row.title,row.topic,row.what_changed].join(" ");
 const categoryTerms:Record<string,RegExp>={
  geopolitics:/\b(?:war|attack|missile|election|president|minister|diplomacy|sanctions|border|military|security|foreign policy|government|conflict|ukraine|russia|israel|iran|china|taiwan|sudan|yemen|nato|parliament|political)\b/giu,
  macro:/\b(?:inflation|prices?|gdp|central bank|interest rates?|currency|exchange rates?|forex|fx|monetary|fiscal|unemployment|jobs|output|growth|recession|economy|economic|bond|yield|debt|cpi|pmi|exchange)\b/giu,
  rare_earth:/\b(?:rare earths?|critical minerals?|lithium|cobalt|nickel|graphite|copper|manganese|bauxite|ores?|mining|minerals?|batteries?|smelter|refining|uranium|tantalum|gallium|germanium|magnets?|metallurgy|supply chain)\b/giu,
 };
 const scores:Record<string,number>={};
 for(const [category,pattern] of Object.entries(categoryTerms)){
  pattern.lastIndex=0;
  scores[category]=[...topicText.matchAll(pattern)].length;
 }
 const own=scores[row.category]??0;
 const other=Math.max(...Object.entries(scores).filter(([category])=>category!==row.category).map(([,score])=>score));
 return {row,time:Date.parse(row.published_at),headline:words.join(" "),
  tokens:new Set(words),numbers:new Set(words.filter(w=>/\d/u.test(w))),
  action,negative:words.some(w=>POLARITY.has(w)),categoryFit:own-other};
}
function sameSet(a:Set<string>,b:Set<string>){
 return a.size===b.size&&[...a].every(x=>b.has(x));
}
function duplicate(a:Descriptor,b:Descriptor){
 if(!Number.isFinite(a.time)||!Number.isFinite(b.time)||
    Math.abs(a.time-b.time)>WINDOW)return false;
 if(a.row.geography&&b.row.geography&&a.row.geography!==b.row.geography)return false;
 if(!sameSet(a.numbers,b.numbers)||a.negative!==b.negative)return false;
 if(a.action&&b.action&&a.action!==b.action)return false;
 if(a.headline===b.headline)return true;
 if(a.tokens.size<4||b.tokens.size<4)return false;
 let common=0;
 for(const word of a.tokens)if(b.tokens.has(word))common++;
 const union=a.tokens.size+b.tokens.size-common;
 const similarity=union?common/union:0;
 const containment=common/Math.min(a.tokens.size,b.tokens.size);
 // Reworded same-event headlines must agree on nearly all event-bearing words;
 // a shared actor or a vague topic is not enough to erase a distinct update.
 return common>=4&&similarity>=0.82&&containment>=0.95;
}
function priority(d:Descriptor){
 const verifiedOriginal=d.row.status==="official_release_observed_unscored"?2:1;
 const precise=d.row.date_precision==="exact"?1:0;
 // When an event appears in multiple category feeds, retain only the card
 // whose title/topics best fit that domain; source status breaks near-ties.
 return Math.max(-20,Math.min(20,d.categoryFit))*100+
   verifiedOriginal*10+precise*2+Math.min(d.tokens.size,9);
}
/**
 * Deterministic and repeat-safe for live refresh, SSR hydration, existing D1
 * history and new source observations. Quality selects the canonical card,
 * then display order remains newest-first. The original rows stay in storage.
 */
export function dedupeIntelligenceStories(rows:readonly StatelessIntelligenceSignal[])
 :StatelessIntelligenceSignal[]{
 if(!Array.isArray(rows)||rows.length>1600)
   throw Error("INTELLIGENCE_EVENT_DEDUP_BOUND_EXCEEDED");
 const descriptors=rows.map(descriptor).filter(x=>Number.isFinite(x.time));
 descriptors.sort((a,b)=>priority(b)-priority(a)||b.time-a.time||
   a.row.id.localeCompare(b.row.id));
 const canonical:Descriptor[]=[];
 const ids=new Set<string>();
 for(const candidate of descriptors){
   if(ids.has(candidate.row.id))continue;
   ids.add(candidate.row.id);
   if(!canonical.some(saved=>duplicate(saved,candidate)))
     canonical.push(candidate);
 }
 return canonical.map(item=>item.row).sort((a,b)=>
   Date.parse(b.published_at)-Date.parse(a.published_at)||
   a.id.localeCompare(b.id));
}
