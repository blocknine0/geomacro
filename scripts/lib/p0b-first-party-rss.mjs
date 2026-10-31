/** Free official first-party RSS last-resort source discovery for P0-B.
 * Source RSS title/date/link metadata only, never report bodies, external
 * excerpts, third-party content or paid/source rights. No arbitrary URLs,
 * redirects, cookies or raw publisher bytes leave private memory.
 */
import {phase2hHeadlineCountryCandidate} from "./phase2h-country-originals-195.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
import {p0bProjectEvidenceBounded} from "./p0b-event-grounded-projection.mjs";
const SOURCES=Object.freeze({
 geopolitics:[{url:"https://news.un.org/feed/subscribe/en/news/all/rss.xml",host:"news.un.org",
  path:/^\/en\/story\/20\d{2}\/\d{1,2}\/[a-z0-9-]+$/u}],
 macro:[{url:"https://www.bis.org/doclist/all_pressrels.rss",host:"www.bis.org",
  path:/^\/press\/p\d{6}[a-z]?\.htm$/u},
  // Official US BLS release RSS: publisher's agency jurisdiction is USA;
  // the topic still must be present in the same first-party native title.
  {url:"https://www.bls.gov/feed/bls_latest.rss",host:"www.bls.gov",
   path:/^\/news\.release\/(?:[a-z]{2,20}\.nr\d|archives\/[a-z]{2,20}_\d{8})\.htm$/u,
   issuer_country:"USA",issuer:"US Bureau of Labor Statistics"},
  // BLS officially publishes this topic-specific RSS, unlike its general
  // latest-numbers feed which may point to summary pages rather than a
  // publisher-native dated news release.
  {url:"https://www.bls.gov/feed/eci.rss",host:"www.bls.gov",
   path:/^\/news\.release\/(?:eci\.nr\d|archives\/eci_\d{8})\.htm$/u,
   issuer_country:"USA",issuer:"US Bureau of Labor Statistics"}],
 rare_earth:[{url:"https://news.gov.bc.ca/ministries/mining-and-critical-minerals/feed",
  host:"news.gov.bc.ca",path:/^\/releases\/20\d{2}[A-Z]{2,6}\d{4}-\d{6}$/u,
  issuer_country:"CAN",issuer_level:"PROVINCIAL",issuer:"Province of British Columbia"}],
});
const resultError=x=>({status:x,items:[],checked:1});
const capped=async(url,fetchImpl)=>{
 let r;
 try{r=await fetchImpl(url,{method:"GET",redirect:"manual",
  headers:{Accept:"application/rss+xml, application/xml;q=0.9"},
  signal:AbortSignal.timeout(9000)})}
 catch{return null}
 if(r.status!==200||r.redirected||!/xml|rss/iu.test(r.headers?.get("content-type")??"")||
   Number(r.headers?.get("content-length")??"0")>330000)return null;
 try{const body=await r.text();return body.length<=330000&&!/<!DOCTYPE\b/iu.test(body)?body:null}
 catch{return null}
};
// An exact three-tag parser avoids escaping regex fragments through a
// dynamic RegExp constructor. Only bounded RSS metadata tags are admitted.
const RSS_ITEM_TAGS=Object.freeze({
 title:/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/iu,
 link:/<link(?:\s[^>]*)?>([\s\S]*?)<\/link\s*>/iu,
 pubDate:/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate\s*>/iu,
});
const xmlValue=(xml,tag)=>{
 const re=RSS_ITEM_TAGS[tag];
 if(!re)return null;
 let text=re.exec(xml)?.[1]?.trim()??null;
 if(!text)return null;
 const cdata=/^<!\[CDATA\[([\s\S]*?)\]\]>$/u.exec(text);
 if(cdata)text=cdata[1];
 text=text.replace(/&amp;/gu,"&").replace(/&quot;/gu,'"')
  .replace(/&apos;|&#39;/gu,"'").replace(/&lt;/gu,"<")
  .replace(/&gt;/gu,">").replace(/\s+/gu," ").trim();
 return text.length<=350?text:null;
};
const sha=async data=>[...new Uint8Array(await crypto.subtle.digest(
 "SHA-256",new TextEncoder().encode(data)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const channels=category=>category==="macro"?["rates_and_bonds","fx_and_payments"]:
 category==="geopolitics"?["trade_and_logistics"]:["mineral_supply_chain"];
const pinnedPermalink=(raw,source)=>{
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!==source.host||u.username||u.password||
     u.port||u.hash||u.search||!source.path.test(u.pathname))return null;
  return "https://"+source.host+u.pathname;
 }catch{return null}
};
const topicWords=(question,countryName)=>{
 const skipped=new Set(["the","what","why","when","latest","news","update","does",
 "did","impact","matter","happened","about","please","for","with","from",
 "macro","geopolitics","geopolitical","economics","economic","category","breaking"]);
 const country=new Set(countryName.toLowerCase().split(/\s+/u));
 return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[])
  .filter(x=>x.length<=35&&!skipped.has(x)&&!country.has(x)))].slice(0,6);
};
export async function p0bFirstPartyFeedNews({
 category,countryIso3,countryName,question,fetchImpl=fetch,now=Date.now()
}={}){
 if(!SOURCES[category]||typeof countryIso3!=="string"||
  typeof countryName!=="string"||typeof question!=="string")
  return resultError("INVALID_FEED_SCOPE");
 const topic=topicWords(question,countryName);
 const checked=await Promise.allSettled(SOURCES[category].map(async source=>{
  const xml=await capped(source.url,fetchImpl);
  if(!xml)return null;
  const items=[];
  let scanned=0;
  const matches=xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/giu);
  for(const match of matches){
   if(++scanned>40||items.length>=2)break;
   const part=match[1],title=xmlValue(part,"title");
   const url=pinnedPermalink(xmlValue(part,"link"),source);
   const time=officialItemNativePublicationMs(xmlValue(part,"pubDate"));
   if(!title||title.length<12||title.length>260||/[<>]/u.test(title)||
    !url||!Number.isFinite(time)||time>now+60000||now-time>72*3600000)continue;
   const inTitle=phase2hHeadlineCountryCandidate(title);
   // A pinned national statistical agency may establish its own country's
   // release jurisdiction, not the geographic subject of another country.
   if(inTitle!==countryIso3&&
      !(inTitle===null&&source.issuer_country===countryIso3))continue;
   if(topic.length&&!topic.some(term=>title.toLowerCase().includes(term)))continue;
   const native=new Date(time).toISOString(),id=await sha(category+"\n"+url+"\n"+native);
   const original={original_title:title,original_published_at:native,
    original_content:null,original_url:url};
   const base={schema:"geomacro.phase2h.private-five-part.v1",
    what_happened:{text:null,original_observation_id:id},
    why_it_matters:{text:null,independently_verified:false},
    market_relevance:{potential_watch_channels:channels(category),
     observed_market_reaction_verified:false,confirmed_instruments:[],
     price_direction:null,price_change:null},
    what_to_watch:{event_topic:null,
     trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
     confirmed_followup_at:null},
    evidence_and_confidence:{original_observation_id:id,
     source_published_at:native,date_precision:"exact",
     observed_feed_title_available:true,original_article_page_verified:false,
     independent_event_verified:false,commercial_rights_verified:false,
     paid_eligible:false,source_content_identity_sha256:await sha(title+"\n"+native)}};
   let five=p0bProjectEvidenceBounded({record_id:id,category,original,analysis:base});
   // The release TITLE and exact originating US BLS feed prove publication,
   // not the numeric value or direction of the actual Employment Cost Index.
   if(!five&&source.issuer_country==="USA"&&category==="macro"&&
      /\bemployment cost index\b/iu.test(title)){
    const candidate={...base,
     what_happened:{text:"The US Bureau of Labor Statistics published an Employment Cost Index update.",
      original_observation_id:id},
     why_it_matters:{text:"The Employment Cost Index update informs wage-cost and inflation monitoring; no reported value, rate change or market price move is inferred from the title.",
      independently_verified:false}};
    const grounded=p0bProjectEvidenceBounded({record_id:id,category,original,
     analysis:candidate});
    if(grounded)five=grounded;
   }
   if(!five)continue;
   items.push({record_id:id,category,original_published_at:native,five_part:five,
    original_page_independently_verified:false,
    first_party_feed_metadata_verified:true,
    ...(source.issuer_country?{issuer_country_verified:source.issuer_country,
      country_attribution_basis:source.issuer_level==="PROVINCIAL"?
       "FIRST_PARTY_PROVINCIAL_MINERAL_ISSUER":
       "FIRST_PARTY_NATIONAL_STATISTICAL_ISSUER"}:{}),
    archive_d1_ack_present:false,p0a_evidence_limited:false,
    paid_eligible:false,commercial_rights_verified:false,
    source_title_only_research_fallback_used:false});
  }
  return items;
 }));
 const items=checked.flatMap(x=>x.status==="fulfilled"&&Array.isArray(x.value)?x.value:[]);
 const dedup=[...new Map(items.map(x=>[x.record_id,x])).values()].slice(0,2);
 return Object.freeze({status:dedup.length?"FIRST_PARTY_FEED_METADATA_GROUNDED":
  checked.some(x=>x.status==="fulfilled"&&Array.isArray(x.value))?
   "NO_MATCHING_FEED_ORIGINAL":"FEED_UNAVAILABLE",
  items:dedup,checked:checked.length});
}
