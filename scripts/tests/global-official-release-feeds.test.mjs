import test from 'node:test';
import assert from 'node:assert/strict';
import {GLOBAL_OFFICIAL_RELEASE_FEEDS as feeds,globalOriginalArticleUrl,ieaMineralsIndexCandidates,verifiedIeaOriginalPublication,verifiedGlobalRdfFeed} from '../lib/global-official-release-feeds.mjs';
import {summarizeFreeSourceUpdates} from '../lib/free-source-production-updates.mjs';
import {validateFreeLineupProbePayload} from '../lib/free-no-key-source-probe.mjs';
const now=new Date('2026-10-16T08:00:00Z');
const candidate={articleUrl:'https://www.iea.org/news/zambia-critical-minerals-supply-security',title:'Zambia critical minerals supply security'};
const page=(clock='2026-10-16T07:00:00Z',extra='')=>`<!doctype html><html><h1>${candidate.title}</h1><p class="o-hero-news__meta">News<br/><time datetime="${clock}">16 October 2026</time></p>${extra}</html>`;
test('eleven pinned international connectors cover all three categories without credentials',()=>{
 assert.equal(feeds.length,11);assert.equal(new Set(feeds.map(s=>s.id)).size,11);
 assert.deepEqual(new Set(feeds.map(s=>s.category)),new Set(['geopolitics','macro','rare_earth']));
 for(const s of feeds){const u=new URL(s.url);assert.equal(u.hostname,s.host);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password);assert.equal(s.poll_minutes,30);}
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

test('new Australian and Canadian RDF readers require the exact registry and original clock',()=>{
 for(const id of ['rba_press_global','boc_press_global']){
  const spec=feeds.find(s=>s.id===id);
  const url=id==='rba_press_global'?'https://www.rba.gov.au/media-releases/2026/mr-26-27.html':'https://www.bankofcanada.ca/2026/10/canada-monetary-policy/';
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
