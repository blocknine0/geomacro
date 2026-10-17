import {afterEach,describe,expect,it,vi} from 'vitest';
import {readWebsiteDerivedNews} from '../lib/website-derived-news-reader.server';
import {checkedDerivedNews} from '../lib/public-derived-news-client';
const now=Date.parse('2026-10-17T18:00:00.000Z');
const story={id:'macro-1234abcd',category:'macro',title:'Geomacro finds official economic statistics release',
 what_changed:'An official economic release was observed with a source-native date.',
 why_it_matters:'Official economic releases can inform country and currency-risk context.',
 topic:'official economic statistics',geography:'Canada',development_type:'release',
 published_at:'2026-10-15',date_precision:'day',observed_release_count:1,sources_credited:[],
 status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null};
const doc=(signals:unknown[])=>({ok:true,schema:'geomacro.website-derived-news-feed.v1',checked_at:new Date(now).toISOString(),
 original_release_delay_minutes:15,retention_days:30,delivery_scope:'free_website_only',signals});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('website server/browser source and native-day parity',()=>{
 it('retains the same embargo-eligible macro publisher-day as the browser without inventing an hour',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const fetcher=vi.fn(async()=>Response.json(doc([story])));vi.stubGlobal('fetch',fetcher);
  const actual=await readWebsiteDerivedNews();
  expect(actual.signals).toEqual(checkedDerivedNews(doc([story]),now));
  expect(actual.signals).toEqual([story]);
  expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
 });
 it('rejects early originals and private metadata consistently on server and browser',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const input=doc([story,{...story,id:'macro-abcdef12',source_name:'private supplier'},
    {...story,id:'macro-abcdef13',published_at:'2026-10-17'}]);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(input)));
  expect((await readWebsiteDerivedNews()).signals).toEqual([story]);
  expect(checkedDerivedNews(input,now)).toEqual([story]);
 });
});
