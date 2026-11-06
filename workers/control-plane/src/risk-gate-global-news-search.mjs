/**
 * Discovery-only global newsroom rotation for Hot50 × three categories.
 * Google News is an index, not an independent original or a content licence.
 * Primary official source feeds and signed Facts/Rights issuers remain authoritative.
 */
export const RISK_DISCOVERY_CATEGORIES=Object.freeze(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
export const RISK_DISCOVERY_PUBLISHER_GROUPS=Object.freeze([
 Object.freeze(["reuters.com","aninews.in","apnews.com","afp.com"]),
 Object.freeze(["bbc.com","dw.com","france24.com","euronews.com"]),
 Object.freeze(["aljazeera.com","theguardian.com","scmp.com","nikkei.com"]),
 Object.freeze(["npr.org","abc.net.au","cbc.ca","swissinfo.ch"]),
 Object.freeze(["thehindu.com","straitstimes.com","channelnewsasia.com","allafrica.com"]),
 Object.freeze(["mining.com","miningweekly.com","spglobal.com","ft.com"]),
]);
const SEARCH_HOST="https://news.google.com/rss/search";
const safeName=s=>typeof s==="string"&&s.length>=2&&s.length<=110&&
 !/[<>\\\r\n]/u.test(s)&&/^[\p{L}\p{N}\p{M} .()'-]+$/u.test(s);
const validSlot=n=>Number.isSafeInteger(n)&&n>=0;
const queryKeywords={
 GEOPOLITICS:["sanctions","conflict","ceasefire","export controls","border"],
 MACRO_FX:["central bank","inflation","currency","GDP","debt"],
 CRITICAL_MINERALS:["critical minerals","rare earth","lithium","cobalt","mining"],
};
export function riskPublisherSearchPlan(target,now=Date.now(),index=0){
 if(!target||!RISK_DISCOVERY_CATEGORIES.includes(target.category)||
  !safeName(target.name)||!Number.isFinite(now)||!validSlot(index))
  throw Error("RISK_DISCOVERY_INPUT_INVALID");
 const slot=Math.floor(now/(20*60000));
 const family=RISK_DISCOVERY_PUBLISHER_GROUPS[(slot+index)%RISK_DISCOVERY_PUBLISHER_GROUPS.length];
 const terms=queryKeywords[target.category];
 const q='"'+target.name+'" ('+terms.map(s=>'"'+s+'"').join(" OR ")+
  ') ('+family.map(h=>"site:"+h).join(" OR ")+") when:24h";
 const url=new URL(SEARCH_HOST);
 url.searchParams.set("q",q);url.searchParams.set("hl","en-US");
 url.searchParams.set("gl","US");url.searchParams.set("ceid","US:en");
 if(url.href.length>1200)throw Error("RISK_DISCOVERY_QUERY_TOO_LONG");
 return Object.freeze({url:url.href,
  search_family_index:(slot+index)%RISK_DISCOVERY_PUBLISHER_GROUPS.length,
  publishers:Object.freeze([...family]),
  discovery_only:true,source_event_verified:false,
  commercial_reuse_authorized:false,independent_corroboration:false});
}
/** A news wire is not necessarily an independent second publisher;
 * no automated full-body fetching from restricted wire URLs. */
export function isPublisherFullTextRestricted(host){
 return ["reuters.com","aninews.in","apnews.com","afp.com",
   "bloomberg.com","ft.com","spglobal.com"].some(h=>
   host===h||host?.endsWith("."+h));
}
