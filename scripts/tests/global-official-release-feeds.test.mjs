import test from 'node:test';
import assert from 'node:assert/strict';
import {GLOBAL_OFFICIAL_RELEASE_FEEDS as feeds,GLOBAL_MACRO_RELEASE_TOPIC,MINERAL_RELEASE_TOPIC,globalOriginalArticleUrl,ieaMineralsIndexCandidates,verifiedIeaOriginalPublication,verifiedGlobalRdfFeed} from '../lib/global-official-release-feeds.mjs';
import {summarizeFreeSourceUpdates} from '../lib/free-source-production-updates.mjs';
import {validateFreeLineupProbePayload} from '../lib/free-no-key-source-probe.mjs';
const now=new Date('2026-10-16T08:00:00Z');
const candidate={articleUrl:'https://www.iea.org/news/zambia-critical-minerals-supply-security',title:'Zambia critical minerals supply security'};
const page=(clock='2026-10-16T07:00:00Z',extra='')=>`<!doctype html><html><h1>${candidate.title}</h1><p class="o-hero-news__meta">News<br/><time datetime="${clock}">16 October 2026</time></p>${extra}</html>`;
test('expanded official international connectors cover all three categories without credentials',()=>{
 assert.equal(feeds.length,19);assert.equal(new Set(feeds.map(s=>s.id)).size,19);
 assert.deepEqual(new Set(feeds.map(s=>s.category)),new Set(['geopolitics','macro','rare_earth']));
 for(const s of feeds){const u=new URL(s.url);assert.equal(u.hostname,s.host);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password);assert.equal(s.poll_minutes,30);}
});
test('China NBS RSS uses HTTPS and only admits its exact English release-article path',()=>{
 const s=feeds.find(s=>s.id==='china_nbs_macro_original');assert.ok(s);
 assert.equal(s.category,'macro');assert.equal(s.family,'china_nbs_original_macro_publisher');
 assert.equal(s.url,'https://www.stats.gov.cn/english/PressRelease/rss.xml');
 const article='https://www.stats.gov.cn/english/PressRelease/202610/t20261029_1966000.html';
 assert.equal(globalOriginalArticleUrl(article,s),article);
 for(const raw of [article+'?source=rss',article+'#top',
  article.replace('www.stats.gov.cn','stats.gov.cn.evil.test'),
  'http://www.stats.gov.cn/english/PressRelease/202610/t20261029_1966000.html',
  'https://www.stats.gov.cn/english/PressRelease/rss.xml'])
  assert.equal(globalOriginalArticleUrl(raw,s),null);
 assert.match(s.credit,/attribute the statistical data/iu);
 assert.match(s.credit,/rights remain unverified/iu);
});
test('macro/FX and critical-minerals title matching covers global supply-chain and policy terms',()=>{
 for(const title of ['central bank FX reserves','foreign-exchange intervention','sovereign debt and bond yields','balance of payments and capital flows','industrial production and tariffs','rare earth elements export controls','dysprosium and neodymium magnet production','antimony refining capacity','tungsten supply chain','lithium battery materials','critical raw materials processing']){
  const macro=GLOBAL_MACRO_RELEASE_TOPIC.test(title);
  const minerals=MINERAL_RELEASE_TOPIC.test(title);
  assert.ok(macro||minerals, 'expected a macro/FX or minerals match for '+title);
 }
 for(const title of ['rare earth elements export controls','dysprosium and neodymium magnet production','antimony refining capacity','tungsten supply chain','lithium battery materials','critical raw materials processing'])assert.equal(MINERAL_RELEASE_TOPIC.test(title),true,title);
 for(const title of ['central bank FX reserves','foreign-exchange intervention','sovereign debt and bond yields','balance of payments and capital flows','industrial production and tariffs'])assert.equal(GLOBAL_MACRO_RELEASE_TOPIC.test(title),true,title);
});

test('original URL admission pins issuer paths and upgrades only observed BOJ HTTP permalinks',()=>{
 const s=feeds.find(s=>s.id==='boj_press_global');
 assert.equal(globalOriginalArticleUrl('http://www.boj.or.jp/en/about/press/koen_2026/ko261015a.htm',s),'https://www.boj.or.jp/en/about/press/koen_2026/ko261015a.htm');
 for(const raw of ['https://www.boj.or.jp.evil.example/en/about/press/a.htm','http://untrusted.example/en/about/press/a.htm','https://user@www.boj.or.jp/en/about/press/a.htm','https://www.boj.or.jp:444/en/about/press/a.htm','https://www.boj.or.jp/en/about/press/a.htm#fragment','https://www.boj.or.jp/en/rss/whatsnew.xml'])assert.equal(globalOriginalArticleUrl(raw,s),null);
});
test('BIS RDF native dates are admitted for the exact publisher, not modified or transport clocks',()=>{
 const s=feeds.find(s=>s.id==='bis_press_global');
 const body='<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Zambia banking regulation and monetary policy</title><link>https://www.bis.org/press/p261016.htm</link><dc:date>2026-10-16T07:00:00Z</dc:date></item></rdf:RDF>';
 assert.equal(validateFreeLineupProbePayload(s,body).valid,true);
 assert.equal(summarizeFreeSourceUpdates(s,body,now).latest_native_publication_at,'2026-10-16T07:00:00.000Z');
 assert.equal(summarizeFreeSourceUpdates(s,body.replaceAll('dc:date','dc:modified'),now).latest_native_publication_at,null);
 assert.equal(validateFreeLineupProbePayload(s,body.replace('<rdf:RDF','<!DOCTYPE rdf><rdf:RDF')).valid,false);
});
test('IEA index admission is topical, deduped and never manufactures a publication time',()=>{
 const anchor=`<a href="/news/zambia-critical-minerals-supply-security"><h3>${candidate.title}</h3><span>16 October 2026</span></a>`;
 const html='<!doctype html><html>'+anchor+anchor+'<a href="https://untrusted.example/news/rare-earths">critical minerals elsewhere</a><a href="/news/football-news">Football event update</a></html>';
 const rows=ieaMineralsIndexCandidates(html);assert.equal(rows.length,1);assert.equal(rows[0].articleUrl,candidate.articleUrl);assert.equal(rows[0].title,candidate.title);
 const s=feeds.find(s=>s.id==='iea_minerals_global'),observed=summarizeFreeSourceUpdates(s,html,now);
 assert.equal(observed.kind,'PUBLISHER_INDEX_CHANGE');assert.equal(observed.sampled_records,1);assert.equal(observed.latest_native_publication_at,null);
});
test('IEA exact original News header must match the same article and consistent original metadata',()=>{
 assert.equal(verifiedIeaOriginalPublication(page(),candidate,now),'2026-10-16T07:00:00.000Z');
 for(const body of [page('2026-10-17T07:00:00Z'),page('2026-10-16'),page().replace('News<br/>','News updated<br/>'),page().replace('o-hero-news__meta','footer'),page().replace('<h1>','<h1>Unrelated '),page('2026-02-30T07:00:00Z'),page('2026-07-16T05:00:00Z'),page(undefined,'<meta property="article:published_time" content="2026-10-16T06:00:00Z">'),page(undefined,'<meta property="article:published_time" content="2026-10-17T06:00:00Z">')])assert.equal(verifiedIeaOriginalPublication(body,candidate,now),null);
 assert.equal(verifiedIeaOriginalPublication(page(),{...candidate,articleUrl:'https://untrusted.example/news/zambia-critical-minerals-supply-security'},now),null);
});

test('new Canadian RDF reader require the exact registry and original clock',()=>{
 for(const id of ['boc_press_global']){
  const spec=feeds.find(s=>s.id===id);
  const url='https://www.bankofcanada.ca/2026/10/canada-monetary-policy/';
  const body=`<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Canada Australia monetary policy decision</title><link>${url}</link><dc:date>2026-10-16T07:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(globalOriginalArticleUrl(url,spec),url);
  assert.equal(validateFreeLineupProbePayload(spec,body).valid,true);
  assert.equal(verifiedGlobalRdfFeed(spec.id,spec.url,body),true);
  assert.equal(verifiedGlobalRdfFeed('unknown',spec.url,body),false);
  assert.equal(verifiedGlobalRdfFeed(spec.id,spec.url+'/untrusted',body),false);
  assert.equal(summarizeFreeSourceUpdates(spec,body,now).latest_native_publication_at,'2026-10-16T07:00:00.000Z');
  for(const bad of [body.replaceAll('dc:date','dc:modified'),body.replace('2026-10-16T07:00:00Z','2026-10-17T07:00:00Z')])assert.equal(summarizeFreeSourceUpdates(spec,bad,now).latest_native_publication_at,null);
 }
 const bc=feeds.find(s=>s.id==='bc_minerals_global');
 assert.equal(globalOriginalArticleUrl('https://news.gov.bc.ca/releases/2026MCM0031-001120',bc),'https://news.gov.bc.ca/releases/2026MCM0031-001120');
 for(const url of ['https://news.gov.bc.ca.evil.example/releases/2026MCM0031-001120','https://news.gov.bc.ca/ministries/mining-and-critical-minerals','http://news.gov.bc.ca/releases/2026MCM0031-001120'])assert.equal(globalOriginalArticleUrl(url,bc),null);
});

test('targeted macro trade and rare-earth discovery use real strict official first-party identity',()=>{
 const cases=[
  ['govuk_global_trade_fx','macro','international trade',
    'https://www.gov.uk/government/news/global-trade-and-inflation'],
  ['govuk_global_rare_earth','rare_earth','rare earth',
    'https://www.gov.uk/government/news/rare-earth-minerals-supply-chain'],
 ];
 for(const [id,category,keyword,article] of cases){
  const spec=feeds.find(row=>row.id===id);
  assert.ok(spec);assert.equal(spec.category,category);
  assert.equal(spec.host,'www.gov.uk');assert.equal(spec.format,'json');
  assert.ok(spec.url.startsWith('https://www.gov.uk/api/search.json?'));
  assert.equal(new URL(spec.url).searchParams.get('q'),keyword);
  assert.equal(new URL(spec.url).searchParams.get('filter_format'),'news_article');
  assert.equal(new URL(spec.url).searchParams.get('count'),'10');
  assert.equal(globalOriginalArticleUrl(article,spec),article);
  assert.equal(globalOriginalArticleUrl(article.replace('www.gov.uk','www.gov.uk.evil.test'),spec),null);
  assert.equal(globalOriginalArticleUrl(article+'#index-time',spec),null);
  assert.equal(validateFreeLineupProbePayload(spec,JSON.stringify({total:0,results:[]})).valid,true);
  assert.equal(validateFreeLineupProbePayload(spec,'<html>fake news</html>').valid,false);
 }
 // These complementary search lanes cannot count as independent publishers.
 assert.equal(feeds.find(x=>x.id==='govuk_global_economy').family,
   feeds.find(x=>x.id==='govuk_global_trade_fx').family);
 assert.equal(feeds.find(x=>x.id==='govuk_global_minerals').family,
   feeds.find(x=>x.id==='govuk_global_rare_earth').family);
});

test('UN Geneva official geopolitical feed accepts issuer press releases, not index/fake or future timestamps',()=>{
 const source=feeds.find(x=>x.id==='ungeneva_press_global');
 assert.ok(source);
 assert.equal(source.format,'rss');
 assert.equal(source.category,'geopolitics');
 const article='https://www.ungeneva.org/en/news-media/press-release/2026/10/human-rights-council-adopts-urgent-resolution-on-sudan';
 assert.equal(globalOriginalArticleUrl(article,source),article);
 for(const other of [
  'https://www.ungeneva.org/news-media/press-releases-list/rss.xml',
  'https://www.ungeneva.org/en/news-media/news/2026/10/sudan-security-council',
  'https://www.ungeneva.org/en/news-media/press-release/2026/10/sudan',
  'https://www.ungeneva.org.en.evil.test/en/news-media/press-release/2026/10/security-council-urges-ceasefire',
  'http://www.ungeneva.org/en/news-media/press-release/2026/10/security-council-urges-ceasefire',
  article+'?source=feed',
  article+'#updated'
 ])assert.equal(globalOriginalArticleUrl(other,source),null);
 const rss='<rss version="2.0"><channel><item><title>Security Council calls for ceasefire in Sudan</title><link>'+
   article+'</link><pubDate>Thu, 22 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 assert.equal(validateFreeLineupProbePayload(source,rss).valid,true);
 const accepted=summarizeFreeSourceUpdates(source,rss,new Date('2026-10-22T11:00:00Z'));
 assert.equal(accepted.latest_native_publication_at,'2026-10-22T08:00:00.000Z');
 const undated=summarizeFreeSourceUpdates(source,rss.replace('pubDate','updated').replace('/pubDate','/updated'),
   new Date('2026-10-22T11:00:00Z'));
 assert.equal(undated.latest_native_publication_at,null);
});


test('DOE official battery supply-chain strategy is a discovery lead, never a certified paid release',()=>{
 const doe=feeds.find(s=>s.id==='us_doe_minerals_global');
 assert.equal(doe.host,'www.energy.gov');
 assert.equal(doe.family,'us_doe_minerals_original_publisher');
 const official='https://www.energy.gov/cmei/articles/does-office-critical-minerals-and-energy-innovation-unveils-new-strategy-and';
 assert.equal(globalOriginalArticleUrl(official,doe),official);
 for(const title of [
  'DOE national battery strategy and manufacturing accelerator',
  'National battery strategy to secure US manufacturing',
  'Battery supply chain policy for domestic processing',
 ])assert.equal(MINERAL_RELEASE_TOPIC.test(title),true,title);
 for(const unrelated of [
  'battery football championship',
  'battery phone charger user manual',
  'electric vehicle racing result',
  'community sports supply update'
 ])assert.equal(MINERAL_RELEASE_TOPIC.test(unrelated),false,unrelated);
 assert.equal(globalOriginalArticleUrl('https://www.energy.gov.evil.example/cmei/articles/'+
   'does-office-critical-minerals-and-energy-innovation-unveils-new-strategy-and',doe),null);
 assert.equal(globalOriginalArticleUrl(official+'?updated_at=2026-10-29',doe),null);
 // The feed is only an ORIGINAL CANDIDATE. Neither article rights nor
 // independence, time/readback, scoring or payment can be inferred here.
 assert.equal(doe.production_update_reader,true);
});

test('trade-geo-macro-minerals official issuer feeds keep exact first-party URL and fail closed',()=>{
 const cases=[
  ['wto_trade_policy_global','geopolitics','https://www.wto.org/english/news_e/news26_e/tar_29jun26_431_e.htm','https://www.wto.org/english/news_e/news26_e/news26_e.htm'],
  ['bis_management_macro_global','macro','https://www.bis.org/speeches/20261029-deposit-insurance-changing-financial-landscape','https://www.bis.org/review/r261029a.htm'],
  ['australia_critical_minerals_minister_global','rare_earth','https://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project','https://www.minister.industry.gov.au/media-centre'],
 ];
 for (const [id,category,real,nonArticle] of cases) {
  const source=feeds.find(s=>s.id===id);
  assert.ok(source,id+' registered');
  assert.equal(source.category,category);
  assert.equal(source.format,'rss');
  assert.equal(source.production_update_reader,true);
  assert.equal(source.poll_minutes,30);
  assert.equal(globalOriginalArticleUrl(real,source),real);
  assert.equal(globalOriginalArticleUrl(nonArticle,source),null);
  assert.equal(globalOriginalArticleUrl(real+'?ref=feed',source),null);
  assert.equal(globalOriginalArticleUrl(real+'#modified',source),null);
  assert.equal(globalOriginalArticleUrl(real.replace('https://','http://'),source),null);
  assert.equal(globalOriginalArticleUrl(real.replace('https://','https://evil.example/'),source),null);
  assert.equal(source.credit.length>30,true);
  assert.notEqual(source.commercial_reuse_authorized,true);
  assert.notEqual(source.signed_delivery_verified,true);
 }
 const bis=feeds.find(s=>s.id==='bis_management_macro_global');
 assert.equal(globalOriginalArticleUrl('https://www.bis.org/speeches/sp261029.htm',bis),
  'https://www.bis.org/speeches/sp261029.htm');
 assert.equal(globalOriginalArticleUrl('https://www.bis.org/speeches/20261029-deposit-insurance-changing-financial-landscape',bis),
  'https://www.bis.org/speeches/20261029-deposit-insurance-changing-financial-landscape');
 assert.equal(globalOriginalArticleUrl('https://www.bis.org/speeches/20261029',bis),null);
 const wto=feeds.find(s=>s.id==='wto_trade_policy_global');
 const xml='<rss><channel><item><title>WTO members announce tariff safeguard and trade dispute talks</title>'+
  '<link>https://www.wto.org/english/news_e/news26_e/tar_29jun26_431_e.htm</link>'+
  '<pubDate>Thu, 29 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 assert.equal(validateFreeLineupProbePayload(wto,xml).valid,true);
 assert.equal(summarizeFreeSourceUpdates(wto,xml,new Date('2026-10-29T12:00:00Z')).latest_native_publication_at,'2026-10-29T08:00:00.000Z');
 assert.equal(summarizeFreeSourceUpdates(wto,xml.replaceAll('pubDate','updated'),new Date('2026-10-29T12:00:00Z')).latest_native_publication_at,null);
});
