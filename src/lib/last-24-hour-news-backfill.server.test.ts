import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {backfillLast24HourNews} from './last-24-hour-news-backfill.server';
import {filterIntelligenceDesk} from './intelligence-desk-view';
import type {StatelessCategory,StatelessIntelligenceSignal} from './stateless-intelligence-model';
import type {StatelessIntelligenceResult} from './stateless-public-intelligence.server';
const NOW=Date.parse('2026-10-23T12:00:00Z');
function signal(category:StatelessCategory,minutes:number,index=1):StatelessIntelligenceSignal{
 return {id:category+'-'+index.toString(16).padStart(8,'0'),category,
  title:'Geomacro finds an original-dated policy development',
  what_changed:'The government announced a policy development in its original dated release.',
  why_it_matters:'The announcement may affect operational exposure and requires monitoring of implementation.',
  topic:{geopolitics:'foreign policy',macro:'monetary policy',rare_earth:'critical-minerals policy'}[category],
  geography:'United Kingdom',development_type:'policy announcement',published_at:new Date(NOW-minutes*60000).toISOString(),
  date_precision:'exact',observed_release_count:1,sources_credited:[],
  status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null};
}
const report=(category:StatelessCategory,signals:StatelessIntelligenceSignal[])=>({category,signals,feed_count:5,healthy_feed_count:4}) as StatelessIntelligenceResult;
function publisher(){return {accept:vi.fn(async(_signals:StatelessIntelligenceSignal[])=>{}),finish:vi.fn(async()=>({authenticated_write_verified:true}))};}
describe('live plus rolling last-24-hour website backfill',()=>{
 it('covers all three categories and includes hour 23 as well as newly eligible news',async()=>{
  const p=publisher();const result=await backfillLast24HourNews({now:NOW,publisher:p,
   readCategory:async category=>report(category,[signal(category,15,1),signal(category,23*60,2),
    signal(category,24*60,3),signal(category,24*60+1,4),signal(category,14,5),signal(category,-1,6)])});
  expect(result.complete).toBe(true);expect(result.categories.map(c=>c.eligible_original_last_24h)).toEqual([3,3,3]);
  expect(p.accept.mock.calls.flatMap(([rows])=>rows)).toHaveLength(9);
  expect(p.accept.mock.calls[0][0].map(s=>s.published_at)).toEqual([
   '2026-10-23T11:45:00.000Z','2026-10-22T13:00:00.000Z','2026-10-22T12:00:00.000Z']);
 });
 it('does not truncate to the fastlane newest 20; publishes a full bounded 200-row reader result',async()=>{
  const p=publisher();await backfillLast24HourNews({now:NOW,publisher:p,
   readCategory:async category=>report(category,Array.from({length:200},(_,i)=>signal(category,20+i,i+1)))});
  expect(p.accept).toHaveBeenCalledTimes(30);
  expect(p.accept.mock.calls.flatMap(([rows])=>rows)).toHaveLength(600);
  expect(p.accept.mock.calls.every(([rows])=>rows.length<=20)).toBe(true);
 });
 it('keeps healthy categories when one source reader fails and makes partial backfill visible',async()=>{
  const p=publisher();const result=await backfillLast24HourNews({now:NOW,publisher:p,
   readCategory:async category=>{if(category==='macro')throw Error('timeout');return report(category,[signal(category,60)]);}});
  expect(result.complete).toBe(false);expect(result.categories[1].status).toBe('LAST_24H_BACKFILL_UNAVAILABLE');
  expect(p.accept.mock.calls.flatMap(([rows])=>rows).map(s=>s.category)).toEqual(['geopolitics','rare_earth']);
 });
 it('rejects unsafe source metadata and fabricated clocks without inventing a day-only timestamp',async()=>{
  const p=publisher();const result=await backfillLast24HourNews({now:NOW,publisher:p,
   readCategory:async category=>report(category,[{...signal(category,60),article_url:'https://private.invalid'} as StatelessIntelligenceSignal])});
  expect(result.complete).toBe(false);expect(p.accept).not.toHaveBeenCalled();
  const q=publisher();await backfillLast24HourNews({now:NOW,publisher:q,
   readCategory:async category=>report(category,[{...signal(category,60),date_precision:'day',published_at:'2026-10-23'}])});
  expect(q.accept).not.toHaveBeenCalled();
 });
 it('last-24h website filtering exposes newly eligible and recovered older stories together',()=>{
  const fresh=signal('macro',20,1),backfilled=signal('macro',23*60,2),older=signal('macro',25*60,3);
  expect(filterIntelligenceDesk([older,backfilled,fresh],{category:'macro',query:'',period:'24h'},NOW)).toEqual([fresh,backfilled]);
  expect(backfilled.published_at).toBe('2026-10-22T13:00:00.000Z');
 });
 it('same continent run performs wide 24h backfill plus the existing near-real-time fastlane',()=>{
  const workflow=readFileSync('.github/workflows/continent-country-original-probe-reusable.yml','utf8');
  expect(workflow).toContain('run: bun scripts/ops/publish-last-24-hour-website-news.ts');
  expect(workflow).toContain('run: bun scripts/ops/publish-original-news-five-minute-fastlane.ts');
  const runner=readFileSync('scripts/ops/publish-last-24-hour-website-news.ts','utf8');
  expect(runner).toContain('undefined,undefined,200,shared');
  const ui=readFileSync('src/components/intelligence/stateless-live-desk.tsx','utf8');
  expect(ui).toContain('<option value="24h">Last 24 hours</option>');
 });
});
