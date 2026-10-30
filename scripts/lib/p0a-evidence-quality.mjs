/** P0-A: deterministic evidence completeness contract shared by offline and production audits.
 * Publisher metadata is data, not instructions. No invented actors, numbers,
 * market moves, event dates, outcomes, or paid/source rights.
 * This audit NEVER logs raw publisher content or authorizes a charge.
 */
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const FIELDS=["what_happened","why_it_matters","market_relevance","what_to_watch","evidence_and_confidence"];
const GENERIC=/\b(?:a dated first-party source item was observed|the dated original release concerns|category relevance, event details|has not yet been established|this is a current-evidence brief|geomacro finds [0-9]+|a publisher-native report dated)\b/iu;
const HYPE=/\b(?:guarantees?|certain to|will definitely|market (?:rallied|crashed|surged|plunged)|prices? (?:rallied|crashed|surged|plunged))\b/iu;
const STOP=new Set(["the","and","for","that","this","with","from","into","about","have","has","had","was","were","are","been","will","would","could","may","might","reported","reports","report","publisher","release","official","original","source","observed","development","specific","stated","topic","because","matters","relevant","impact","effect","market","unverified","verified","remains","not","the","what","why","its","their","over","under","after","before","update","announces","announced","discusses","discussed","published","publishes","new","policy","country","region","information","changes","change"]);
const words=x=>String(x??"").normalize("NFKC").toLocaleLowerCase("en")
 .match(/[\p{L}\p{N}]+/gu)?.filter(w=>w.length>=3&&!STOP.has(w))??[];
const plain=x=>typeof x==="string"&&x.trim().length>0&&!/[<>]|https?:\/\/|www\./iu.test(x);
const dates=x=>String(x??"").match(/\b(?:20\d{2}[-/]\d\d[-/]\d\d|\d+(?:\.\d+)?\s?%)\b/gu)??[];
const moneyOrNumbers=x=>String(x??"").match(/(?:\$|€|£)\s?\d+(?:[.,]\d+)*|\b\d{2,}(?:[.,]\d+)*(?:\s?(?:bps|basis points|million|billion|tonnes?|tons?|percent))?\b/giu)??[];
const norm=x=>String(x).normalize("NFKC").toLowerCase().replace(/\s+/gu," ").trim();
const unique=a=>[...new Set(a)];
export function p0aAuditOriginal(row){
 const why=row?.analysis?.why_it_matters?.text;
 const what=row?.analysis?.what_happened?.text;
 const title=row?.original?.original_title;
 const sourceBody=row?.original?.original_content;
 const evidence=row?.analysis?.evidence_and_confidence;
 const reasons=[];
 if(!CATEGORIES.has(row?.category)||!plain(title)||title.length>260||
    !row?.analysis||!FIELDS.every(field=>Object.hasOwn(row.analysis,field)))
   return Object.freeze({status:"REJECT",reasons:["SCHEMA_OR_ORIGINAL_UNAVAILABLE"]});
 const publisher=title+" "+(plain(sourceBody)?sourceBody:"");
 const fp=row.analysis;
 if(!plain(what))reasons.push("WHAT_MISSING");
 else if(GENERIC.test(what))reasons.push("WHAT_BOILERPLATE");
 if(!plain(why))reasons.push("WHY_MISSING");
 else if(GENERIC.test(why))reasons.push("WHY_BOILERPLATE");
 if(plain(what)&&plain(why)&&norm(what)===norm(why))
   reasons.push("WHAT_WHY_IDENTICAL");
 // Facts must contain distinct terms visible in the actual publisher title
 // or lawfully retained description. The generic subject/category is not a fact.
 const evidenceWords=new Set(words(publisher));
 if(plain(what)&&unique(words(what).filter(t=>evidenceWords.has(t))).length<2)
   reasons.push("WHAT_LACKS_SOURCE_FACT_ANCHORS");
 if(plain(why)&&unique(words(why).filter(t=>evidenceWords.has(t))).length<2)
   reasons.push("WHY_LACKS_EVENT_ANCHORS");
 if(plain(what)&&HYPE.test(what)||plain(why)&&HYPE.test(why))
   reasons.push("UNSUPPORTED_CERTAINTY");
 // Numeric, percentage, and date claims must be literally sourced. Original
 // publication day itself is permitted as a timestamp, not as an event date.
 const allowedNumeric=new Set([...moneyOrNumbers(publisher),...dates(publisher),
   ...moneyOrNumbers(row.original.original_published_at),
   ...dates(row.original.original_published_at)].map(norm));
 for(const number of unique([...moneyOrNumbers(what),...moneyOrNumbers(why),
    ...dates(what),...dates(why)]).map(norm))
  if(!allowedNumeric.has(number))reasons.push("UNSOURCED_QUANTITATIVE_CLAIM");
 if(fp.market_relevance?.observed_market_reaction_verified!==false||
    fp.market_relevance?.price_direction!==null||
    fp.market_relevance?.price_change!==null||
    !Array.isArray(fp.market_relevance?.confirmed_instruments)||
    fp.market_relevance.confirmed_instruments.length!==0)
   reasons.push("UNVERIFIED_MARKET_CLAIM");
 if(fp.what_to_watch?.confirmed_followup_at!==null)
   reasons.push("UNSOURCED_FOLLOWUP_CLOCK");
 if(evidence?.original_observation_id!==row.record_id||
    evidence?.source_published_at!==row.original.original_published_at||
    evidence?.original_article_page_verified!==false||
    evidence?.paid_eligible!==false||
    evidence?.independent_event_verified!==false)
   reasons.push("EVIDENCE_PROVENANCE_MISMATCH");
 const distinct=unique(reasons);
 const unsupported=distinct.some(x=>x!=="WHAT_MISSING"&&x!=="WHY_MISSING");
 return Object.freeze({status:distinct.length===0?"PASS":unsupported?"REJECT":"EVIDENCE_LIMITED",
  reasons:distinct,original_page_verified:false,independent_event_verified:false,
  market_impact_verified:false});
}
export function p0aAuditBatch(rows){
 const counts=Object.fromEntries([...CATEGORIES].map(c=>[c,{total:0,pass:0,limited:0,reject:0}]));
 const issues={};const whyByCategory=new Map();
 for(const row of rows){
  const category=row?.category;
  if(!CATEGORIES.has(category))continue;
  const score=p0aAuditOriginal(row), bucket=counts[category];
  bucket.total++;bucket[score.status==="EVIDENCE_LIMITED"?"limited":score.status.toLowerCase()]++;
  for(const reason of score.reasons)issues[reason]=(issues[reason]??0)+1;
  if(score.status!=="PASS")continue;
  const rawWhy=norm(row.analysis.why_it_matters.text);
  const key=category+"|"+rawWhy;
  const old=whyByCategory.get(key);
  if(old&&old!==row.record_id){
   issues.REPEATED_IDENTICAL_WHY_ACROSS_ORIGINALS=(issues.REPEATED_IDENTICAL_WHY_ACROSS_ORIGINALS??0)+1;
  }else whyByCategory.set(key,row.record_id);
 }
 return {schema:"geomacro.p0a-evidence-completeness.v1",
  counts,issue_counts:issues,
  all_three_with_source_grounded_pass:Object.values(counts).every(x=>x.pass>0),
  no_unsupported_claims:Object.keys(issues).every(reason=>
   !["UNSOURCED_QUANTITATIVE_CLAIM","UNVERIFIED_MARKET_CLAIM",
     "UNSOURCED_FOLLOWUP_CLOCK","UNSUPPORTED_CERTAINTY",
     "REPEATED_IDENTICAL_WHY_ACROSS_ORIGINALS"].includes(reason))};
}
