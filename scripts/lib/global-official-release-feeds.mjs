// Pinned first-party international release connectors. No commercial rights,
// event corroboration or country coverage is granted by these definitions.
import {verifiedPublisherPageDate} from './official-original-article-date.mjs';
import {officialItemNativePublicationMs} from './official-native-item-publication-date.mjs';
export const GLOBAL_MACRO_RELEASE_TOPIC=/\b(?:inflation|monetary|interest rates?|central banks?|economic|economy|growth|debt|fiscal|banking|financial|foreign exchange|foreign-exchange|currency|currencies|fx reserves?|exchange rates?|trade|trade flows?|trade balance|current account|balance of payments|gdp|gross domestic product|liquidity|sovereign debt|bond yields?|treasury yields?|capital flows?|industrial production|manufacturing output|purchasing managers? index|\bPMI\b|tariffs?|export controls?|commodity prices?|energy prices?|tankan)\b/iu;
const macro=GLOBAL_MACRO_RELEASE_TOPIC;
export const MINERAL_RELEASE_TOPIC=/\b(?:critical minerals?|critical raw materials?|rare[- ]earth(?:s?| elements?)?|lanthanides?|lithium|cobalt|nickel|graphite|copper|gallium|germanium|tungsten|antimony|manganese|vanadium|scandium|tantalum|niobium|dysprosium|neodymium|terbium|praseodymium|samarium|yttrium|mineral supply|mining|mineral processing|ore processing|rare earth processing|refining capacity|permanent magnets?|magnet production|battery materials|national battery strateg(?:y|ies)|battery manufacturing accelerator|battery supply chains?)\b/iu;
const geo=/\b(?:security council|peace|conflict|war|sanctions?|military|ceasefire|diploma|humanitarian|violence|disarmament)\w*/iu;
export const GLOBAL_OFFICIAL_RELEASE_FEEDS=Object.freeze([
 {id:'govuk_global_economy',category:'macro',url:'https://www.gov.uk/api/search.json?q=economy&filter_format=news_article&count=10&order=-public_timestamp',format:'json',host:'www.gov.uk',path:/^\/government\/(?:news|speeches|statements|world-location-news)\/[a-z0-9-]+$/u,topic:macro,credit:'Contains public sector information licensed under the Open Government Licence v3.0.',family:'govuk_economy_global_original_publisher'},
 {id:'govuk_global_minerals',category:'rare_earth',url:'https://www.gov.uk/api/search.json?q=critical%20minerals&filter_format=news_article&count=10&order=-public_timestamp',format:'json',host:'www.gov.uk',path:/^\/government\/(?:news|speeches|statements|world-location-news)\/[a-z0-9-]+$/u,topic:MINERAL_RELEASE_TOPIC,credit:'Contains public sector information licensed under the Open Government Licence v3.0.',family:'govuk_minerals_global_original_publisher'},
 // Complementary exact first-party government release searches; these are
 // topic discovery lanes on the SAME publisher, not independent corroboration.
 // Official Content API first_published_at must be validated for every item.
 {id:'govuk_global_trade_fx',category:'macro',url:'https://www.gov.uk/api/search.json?q=international%20trade&filter_format=news_article&count=10&order=-public_timestamp',format:'json',host:'www.gov.uk',path:/^\/government\/(?:news|speeches|statements|world-location-news)\/[a-z0-9-]+$/u,topic:macro,credit:'Contains public sector information licensed under the Open Government Licence v3.0.',family:'govuk_economy_global_original_publisher'},
 {id:'govuk_global_rare_earth',category:'rare_earth',url:'https://www.gov.uk/api/search.json?q=rare%20earth&filter_format=news_article&count=10&order=-public_timestamp',format:'json',host:'www.gov.uk',path:/^\/government\/(?:news|speeches|statements|world-location-news)\/[a-z0-9-]+$/u,topic:MINERAL_RELEASE_TOPIC,credit:'Contains public sector information licensed under the Open Government Licence v3.0.',family:'govuk_minerals_global_original_publisher'},
 // UN Geneva officially advertises this first-party RSS endpoint. Filter
 // only issuer-native press RELEASE permalinks; meeting/press feed indexes,
 // unrelated pages, translations, redirects, and updated clock are not news.
 {id:'ungeneva_press_global',category:'geopolitics',
   url:'https://www.ungeneva.org/news-media/press-releases-list/rss.xml',
   format:'rss',host:'www.ungeneva.org',
   path:/^\/en\/news-media\/press-release\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]{8,220}$/u,
   topic:geo,credit:'United Nations Office at Geneva',
   family:'un_geneva_original_press_release_publisher'},
 {id:'un_press_global',category:'geopolitics',url:'https://press.un.org/en/rss.xml',format:'rss',host:'press.un.org',path:/^\/en\/20\d{2}\/[a-z]+\d+[a-z0-9]*\.doc\.htm$/u,topic:geo,credit:'United Nations',family:'un_press_original_publisher'},
 {id:'un_news_economy',category:'macro',url:'https://news.un.org/feed/subscribe/en/news/topic/economic-development/feed/rss.xml',format:'rss',host:'news.un.org',path:/^\/en\/story\/20\d{2}\/\d{1,2}\/[a-z0-9-]+$/u,topic:macro,credit:'UN News',family:'un_economy_original_publisher'},
 // China NBS officially publishes this English RSS and current macro releases.
 // Its terms allow use of statistical data with correct attribution; article
 // text, third-party material, and commercial redistribution are NOT cleared.
 {id:'china_nbs_macro_original',category:'macro',url:'https://www.stats.gov.cn/english/PressRelease/rss.xml',format:'rss',host:'www.stats.gov.cn',path:/^\/english\/PressRelease\/\d{6}\/t\d{8}_\d+\.html$/u,topic:macro,credit:'National Bureau of Statistics of China; attribute the statistical data. Article-text and third-party rights remain unverified.',family:'china_nbs_original_macro_publisher'},
 {id:'bis_press_global',category:'macro',url:'https://www.bis.org/doclist/all_pressrels.rss',format:'rss',host:'www.bis.org',path:/^\/(?:press\/p\d{6}[a-z]?\.htm|media-releases\/20\d{6}-[a-z0-9-]+)$/u,topic:macro,credit:'Bank for International Settlements',family:'bis_original_publisher',rdf:true,websiteId:'bis_press'},
 {id:'boj_press_global',category:'macro',url:'https://www.boj.or.jp/en/rss/whatsnew.xml',format:'rss',host:'www.boj.or.jp',path:/^\/en\/(?:about|announcements|mopo|statistics|research)\/[A-Za-z0-9_./-]+\.htm$/u,topic:macro,credit:'Bank of Japan',family:'boj_original_publisher'},
 {id:'un_news_minerals',category:'rare_earth',url:'https://news.un.org/feed/subscribe/en/news/all/rss.xml',format:'rss',host:'news.un.org',path:/^\/en\/story\/20\d{2}\/\d{1,2}\/[a-z0-9-]+$/u,topic:MINERAL_RELEASE_TOPIC,credit:'UN News',family:'un_minerals_original_publisher'},
 {id:'boc_press_global',category:'macro',url:'https://www.bankofcanada.ca/content_type/press-releases/feed/',format:'rss',host:'www.bankofcanada.ca',path:/^\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]+\/$/u,topic:macro,credit:'Bank of Canada',family:'boc_original_publisher',rdf:true},
 {id:'bc_minerals_global',category:'rare_earth',url:'https://news.gov.bc.ca/ministries/mining-and-critical-minerals/feed',format:'rss',host:'news.gov.bc.ca',path:/^\/releases\/20\d{2}[A-Z]{2,6}\d{4}-\d{6}$/u,topic:MINERAL_RELEASE_TOPIC,credit:'Province of British Columbia',family:'bc_minerals_original_publisher'},
 // Exact RSS endpoints are linked directly by their official publishing bodies.
 // Feed transport/relevance is only a DISCOVERY lead. Publisher page+native
 // publication date, article bytes, same-event independence and licensed
 // commercial rights are independently checked by downstream publishers.
 // EU Council reuse terms require acknowledgement: no silent rights grant.
 {id:'eu_council_press_original',category:'geopolitics',
   url:'https://www.consilium.europa.eu/en/rss/pressreleases.ashx',
   format:'rss',host:'www.consilium.europa.eu',
   path:/^\/en\/press\/press-releases\/20\d{2}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/[a-z0-9]+(?:-[a-z0-9]+){2,100}\/$/u,
   topic:geo,credit:'© European Union, 2026. Source attribution required.',
   family:'eu_council_original_publisher'},
 // PR #2780's USGS minerals RSS returned HTTP 4xx from the live hosted
 // runner (#40021850932). Stop wasting a scarce first-party GET on it.
 // Reuse the ALREADY OPERATIONAL same DOE origin/feed used in Geomacro's
 // stateless website and free-source source-inventory, not a novel source.
 // Each RSS pubDate is only a hint pending official original-page byte/time
 // verification; third-party reuse rights remain unapproved.
 {id:'us_doe_minerals_global',websiteId:'us_doe_news_minerals',category:'rare_earth',
   url:'https://www.energy.gov/rss/energygov/2193718',
   format:'rss',host:'www.energy.gov',
   path:/^\/(?:articles|cmei\/articles|em\/articles)\/[a-z0-9]+(?:-[a-z0-9]+){2,120}$/u,
   topic:MINERAL_RELEASE_TOPIC,credit:'U.S. Department of Energy; first-party U.S. government original; external materials still require individual rights review.',
   family:'us_doe_minerals_original_publisher'},
 // Market-moving international trade and first-party government releases.
 // All three are RSS DISCOVERY sources, not approved paid delivery. Per-item
 // original-page clocks, country/event attribution, independent confirmation,
 // legal reuse review and signing remain required by the existing product gates.
 // WTO's trade-policy notifications cover tariff, safeguard and WTO dispute
 // developments; the issuing WTO country is NEVER inferred from its host.
 {id:'wto_trade_policy_global',category:'geopolitics',
   url:'https://www.wto.org/library/rss/latest_news_e.xml',
   format:'rss',host:'www.wto.org',
   path:/^\/english\/news_e\/(?:news|pres)\d{2}_e\/(?!(?:news|pres)\d{2}_e\.htm$)[a-z0-9_]{4,180}\.htm$/u,
   topic:/\b(?:tariffs?|trade disputes?|dispute settlement|safeguards?|export controls?|sanctions?|trade tensions?|trade restrictions?|trade policy|border|trade measures?)\b/iu,
   credit:'World Trade Organization; attribution required; no article-text redistribution approval.',
   family:'wto_original_trade_policy_news'},
 // BIS management speeches are first-party BIS releases; republished external
 // central-bank speeches belong to a separate source class and are NOT claimed
 // as BIS original. Speeches are potential MARKET-IMPACT leads, not forecasts.
 {id:'bis_management_macro_global',category:'macro',
   url:'https://www.bis.org/doclist/mgmtspeeches.rss?paging_length=15',
   format:'rss',host:'www.bis.org',
   path:/^\/speeches\/(?:sp\d{6}[a-z]?\.htm|20\d{6}-[a-z0-9]+(?:-[a-z0-9]+){1,36})$/u,
   topic:GLOBAL_MACRO_RELEASE_TOPIC,
   credit:'Bank for International Settlements; original management speech metadata only; commercial reuse unapproved.',
   family:'bis_management_original_macro_speeches'},
 // Australian government minister's FIRST-PARTY critical-minerals releases.
 // This also has an existing read-only private probe, but the global release
 // reader lacked its original issuer link eligibility checks.
 {id:'australia_critical_minerals_minister_global',category:'rare_earth',
   url:'https://www.minister.industry.gov.au/feed/t-ayres/rss.xml',
   format:'rss',host:'www.minister.industry.gov.au',
   path:/^\/t-ayres\/media\/[a-z0-9]+(?:-[a-z0-9]+){2,140}$/u,
   topic:MINERAL_RELEASE_TOPIC,
   credit:'Australian Government Department of Industry, Science and Resources; commercial reuse review pending.',
   family:'australia_industry_minister_original_minerals'},
 {id:'iea_minerals_global',category:'rare_earth',url:'https://www.iea.org/news?topic%5B0%5D=critical-minerals',format:'html',host:'www.iea.org',path:/^\/news\/[a-z0-9]+(?:-[a-z0-9]+){1,35}$/u,topic:MINERAL_RELEASE_TOPIC,credit:'International Energy Agency',family:'iea_minerals_original_publisher'},
].map(s=>{
 const u=new URL(s.url);if(u.protocol!=='https:'||u.hostname!==s.host||u.username||u.password||u.port||u.hash)throw Error('GLOBAL_RELEASE_REGISTRY_INVALID');
 return Object.freeze({...s,maxBytes:384*1024,production_update_reader:true,poll_minutes:30});
}));
export function globalOriginalArticleUrl(raw,spec){
 try{
  // BOJ's own RSS emits legacy HTTP permalinks. Upgrade only that exact
  // observed issuer origin; no other HTTP link, redirect or URL is admitted.
  let text=String(raw).replace(/&amp;/giu,'&').trim();
  if(spec.id==='boj_press_global'&&text.startsWith('http://www.boj.or.jp/en/'))text=text.replace('http:','https:');
  const u=new URL(text);
  if(u.protocol!=='https:'||u.hostname!==spec.host||u.username||u.password||u.port||u.hash||u.search||u.href.length>1800||!spec.path.test(u.pathname))return null;
  return u.origin+u.pathname;
 }catch{return null;}
}
const visible=x=>String(x).replace(/<[^>]*>/gu,' ').replace(/&(?:amp|quot|apos|#039|rsquo|lsquo|nbsp);/giu,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&#039;':"'",'&rsquo;':"'",'&lsquo;':"'",'&nbsp;':' '})[m.toLowerCase()]??m).replace(/\s+/gu,' ').trim();
export function ieaMineralsIndexCandidates(html){
 if(typeof html!=='string'||new TextEncoder().encode(html).byteLength>384*1024||/<!ENTITY|<!DOCTYPE\s+[^>]*\[/iu.test(html))return [];
 const spec=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(s=>s.id==='iea_minerals_global'),seen=new Set(),rows=[];
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)){
  if(!/^\/news\/[a-z0-9-]+$/u.test(m[1]))continue;
  const url=globalOriginalArticleUrl('https://www.iea.org'+m[1],spec);
  const title=visible(m[2]).replace(/^(?:Critical Minerals|Energy Security|News)\s+/u,'').replace(/\s+\d{1,2}\s+[A-Za-z]+\s+20\d{2}$/u,'');
  if(!url||seen.has(url)||title.length<12||title.length>300||!MINERAL_RELEASE_TOPIC.test(title))continue;
  seen.add(url);rows.push({articleUrl:url,title});if(rows.length===12)break;
 }
 return rows;
}
export function verifiedIeaOriginalPublication(html,candidate,now=new Date(),maxAgeMs=31*86400000){
 const spec=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(s=>s.id==='iea_minerals_global');
 if(typeof html!=='string'||new TextEncoder().encode(html).byteLength>384*1024||!Number.isFinite(now.getTime())||!Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>31*86400000||globalOriginalArticleUrl(candidate?.articleUrl,spec)!==candidate?.articleUrl)return null;
 const heading=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
 if(!heading||visible(heading)!==candidate.title)return null;
 // Publisher's exact News header, not arbitrary footer <time>, last-updated,
 // URL day or fetch time. Require one unambiguous original clock.
 const metas=[...html.matchAll(/<p\b[^>]*class=["'][^"']*\bo-hero-news__meta\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/giu)];
 if(metas.length!==1||!/\bNews\b/u.test(visible(metas[0][1]))||/updated|modified|revised/iu.test(visible(metas[0][1])))return null;
 const clocks=[...metas[0][1].matchAll(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/giu)];
 if(clocks.length!==1)return null;
 const ms=officialItemNativePublicationMs(clocks[0][1]);
 const diagnostics={};const metadata=verifiedPublisherPageDate(html,now,diagnostics,{maxAgeMs});
 if(metadata?Math.abs(Date.parse(metadata)-ms)>60000:diagnostics.date_reason!=='MISSING_PUBLISHER_PUBLICATION_METADATA')return null;
 return Number.isFinite(ms)&&ms<=now.getTime()&&now.getTime()-ms<=maxAgeMs?new Date(ms).toISOString():null;
}

export function verifiedGlobalRdfFeed(id,url,xml){
 const spec=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(s=>(s.id===id||s.websiteId===id||s.family===id)&&s.url===url&&s.rdf===true);
 return Boolean(spec&&typeof xml==='string'&&!/<!DOCTYPE|<!ENTITY/iu.test(xml)&&/<rdf:RDF(?:\s|>)/iu.test(xml)&&/xmlns:dc\s*=\s*["']http:\/\/purl\.org\/dc\/elements\/1\.1\/["']/iu.test(xml));
}
