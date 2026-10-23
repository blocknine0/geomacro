import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {deriveCountryWebsiteNews} from './continent-derived-news.server';
import {deriveStatelessSignals} from './stateless-intelligence-model';
import {websiteCandidateFromCountryOriginal,type PrivateOriginalCandidate,type PrivatePageDatedOriginal} from './on-demand-global-discovery.server';
const now=new Date('2026-10-23T06:30:00Z');
function original(domain:'geopolitics'|'macro'|'rare_earth'='geopolitics'){
 const family={geopolitics:'uk_fcdo_original_publisher',macro:'uk_hmt_original_publisher',rare_earth:'uk_dbt_original_publisher'}[domain];
 const title={geopolitics:'UK announces new sanctions on Russia',macro:'UK Treasury announces inflation report',rare_earth:'UK approves lithium mining project'}[domain];
 const url='https://www.gov.uk/government/news/test-'+domain;
 const candidate:PrivateOriginalCandidate={domain,country_iso3:'GBR',publisher_family:family,
  article_url:url,article_title:title,feed_item_published_at:'2026-10-23T06:00:00Z',
  article_identity_sha256:createHash('sha256').update(family+'|'+url).digest('hex'),
  first_party_article_url_verified:true,source_native_feed_publication_date_verified:true,
  publisher_article_page_date_verified:false,independent_same_event_verified:false,
  derived_commercial_rights_verified:false,score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false};
 const page:PrivatePageDatedOriginal={...candidate,publisher_article_page_date_verified:true,page_original_published_at:'2026-10-23T06:00:00Z'};
 return {candidate,page};
}
describe('country scan to existing three-domain website deriver',()=>{
 it('derives all three categories only from exact country-bound actual page originals',()=>{
  const rows=(['geopolitics','macro','rare_earth'] as const).map(original);
  const signals=deriveCountryWebsiteNews('GBR',rows.map(r=>r.candidate),rows.map(r=>r.page),now);
  expect(new Set(signals.map(s=>s.category))).toEqual(new Set(['geopolitics','macro','rare_earth']));
  expect(signals.every(s=>s.published_at==='2026-10-23T06:00:00.000Z'&&s.severity===null)).toBe(true);
  expect(JSON.stringify(signals)).not.toMatch(/https?:\/\/|article_url|article_title|publisher_family/);
  expect(signals[0].sources_credited[0]).toContain('Open Government Licence');
 });
 it('preserves the existing website source ID and story ID across discovery paths/countries',()=>{
  const {candidate,page}=original();
  const mapped=websiteCandidateFromCountryOriginal(page,'GBR',now)!;
  expect(mapped.sourceId).toBe('uk_fcdo');
  expect(deriveCountryWebsiteNews('GBR',[candidate],[page],now)[0].id)
   .toBe(deriveStatelessSignals([mapped],now.getTime())[0].id);
 });
 it('rejects missing page verification, wrong country/family/path/identity, stale or future clocks',()=>{
  const {candidate,page}=original();
  for(const change of [{publisher_article_page_date_verified:false},{country_iso3:'USA'},
   {publisher_family:'gdelt_doc_discovery'},{article_url:'https://attacker.invalid/story'},
   {article_identity_sha256:'0'.repeat(64)},{page_original_published_at:'2026-10-23T07:00:00Z'},
   {page_original_published_at:'2026-10-20T06:00:00Z'},{feed_item_published_at:'2026-10-23T05:00:00Z'}]){
   expect(deriveCountryWebsiteNews('GBR',[candidate],[{...page,...change} as PrivatePageDatedOriginal],now)).toEqual([]);
  }
  expect(deriveCountryWebsiteNews('GBR',[],[page],now)).toEqual([]);
  expect(deriveCountryWebsiteNews('USA',[candidate],[page],now)).toEqual([]);
 });
 it('keeps under-15m derived findings private for the publisher queue without rewriting the clock',()=>{
  const {candidate,page}=original();
  candidate.feed_item_published_at=page.feed_item_published_at=page.page_original_published_at='2026-10-23T06:25:00Z';
  const signals=deriveCountryWebsiteNews('GBR',[candidate],[page],now);
  expect(signals).toHaveLength(1);expect(signals[0].published_at).toBe('2026-10-23T06:25:00.000Z');
 });
 it('does not publish unclassified feed candidates or structural annual figures as news',()=>{
  const {candidate,page}=original();candidate.article_title=page.article_title='Annual calendar and office opening hours';
  expect(deriveCountryWebsiteNews('GBR',[candidate],[page],now)).toEqual([]);
 });
});
