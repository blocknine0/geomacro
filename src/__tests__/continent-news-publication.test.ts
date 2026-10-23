import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContinentNewsPublisher} from '../../scripts/lib/continent-news-publication.mjs';
import type {StatelessIntelligenceSignal} from '../lib/stateless-intelligence-model';
const NOW=Date.parse('2026-10-23T06:30:00Z'),root='private-test-token-never-print-0123456789';
function signal(category:'geopolitics'|'macro'|'rare_earth'='geopolitics',at='2026-10-23T06:00:00.000Z'):StatelessIntelligenceSignal{
 return {id:category+'-1234abcd',category,title:'Geomacro finds a verified official policy development',
  what_changed:'The government announced a policy development described in its original dated release.',
  why_it_matters:'This policy development may affect operational exposure and requires monitoring of implementation.',
  topic:{geopolitics:'foreign policy',macro:'monetary policy',rare_earth:'critical-minerals policy'}[category],
  geography:'United Kingdom',development_type:'policy announcement',published_at:at,date_precision:'exact',
  observed_release_count:1,sources_credited:[],status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null};
}
function harness(options:{ack?:boolean;readback?:boolean}={}){
 let clock=NOW;const journal:StatelessIntelligenceSignal[]=[],writes:{at:number;signals:StatelessIntelligenceSignal[]}[]=[];
 const readJournal=vi.fn(async()=>options.readback===false?[]:[...journal]);
 const fetchImpl=vi.fn(async(_url:string,init:RequestInit)=>{
  const signals=JSON.parse(String(init.body)).signals;if(signals.length)writes.push({at:clock,signals});
  journal.push(...signals);
  return Response.json({ok:true,schema:'geomacro.website-derived-news-write-receipt.v1',accepted:options.ack===false?999:signals.length});
 });
 return {journal,writes,readJournal,fetchImpl,create:()=>createContinentNewsPublisher({root,readJournal,fetchImpl,
  now:()=>clock,wait:async ms=>{clock+=ms;}})};
}
describe('same-run continent news publication',()=>{
 it('streams three categories to D1 and independently verifies the exact derived cards',async()=>{
  const h=harness(),publisher=await h.create();
  for(const category of ['geopolitics','macro','rare_earth'] as const)await publisher.accept([signal(category)]);
  const result=await publisher.finish();expect(result.new_rows_readback_verified).toBe(3);expect(result.authenticated_write_verified).toBe(true);
  expect(result.new_rows_by_category).toEqual({geopolitics:1,macro:1,rare_earth:1});
  expect(h.writes).toHaveLength(3);expect(h.readJournal).toHaveBeenCalledTimes(4);
 });
 it('deduplicates across country workers and prior retained stories without rewriting their clock',async()=>{
  const h=harness();h.journal.push(signal());const publisher=await h.create();
  await Promise.all([publisher.accept([signal(),signal('macro')]),publisher.accept([signal('macro')])]);
  const result=await publisher.finish();expect(result.new_rows_written).toBe(1);expect(result.duplicate_rows_excluded).toBe(2);
  await expect(publisher.accept([signal('geopolitics','2026-10-23T06:01:00.000Z')])).rejects.toThrow(/CLOCK_CONFLICT/);
 });
 it('publishes a five-minute-old original immediately without waiting or redating',async()=>{
  const h=harness(),publisher=await h.create(),news=signal('geopolitics','2026-10-23T06:25:00.000Z');
  await publisher.accept([news]);expect(h.writes).toHaveLength(1);
  const result=await publisher.finish();expect(result.pending_rows).toBe(0);
  expect(h.writes[0].at).toBe(NOW);
  expect(h.writes[0].signals[0].published_at).toBe(news.published_at);
 });
 it('rejects raw metadata, future originals, extra categories and fabricated scoring',async()=>{
  for(const bad of [{...signal(),article_url:'https://private.invalid'},
   {...signal(),published_at:'2026-10-23T06:40:00.000Z'},{...signal(),category:'other'},
   {...signal(),severity:75},{...signal(),id:'macro-1234abcd'}]){
   const h=harness(),publisher=await h.create();await expect(publisher.accept([bad])).rejects.toThrow();
   expect(h.writes).toHaveLength(0);
  }
 });
 it('does not report successful publication on missing acknowledgement or readback',async()=>{
  await expect(harness({ack:false}).create()).rejects.toThrow(/ACK_INVALID/);
  const h=harness({readback:false}),publisher=await h.create();
  await expect(publisher.accept([signal()])).rejects.toThrow(/READBACK_MISSING/);
 });
 it('uses existing protected authorization and leaves source workers without the publisher secret',async()=>{
  await expect(createContinentNewsPublisher({root:'',readJournal:async()=>[]})).rejects.toThrow(/AUTH_MISSING/);
  const runner=readFileSync('scripts/ops/run-full-continent-country-sweep.mjs','utf8');
  expect(runner).toContain('GEOMACRO_COMMERCE_LEDGER_TOKEN:_privateToken,...sourceEnv');
  const workflow=readFileSync('.github/workflows/continent-country-original-probe-reusable.yml','utf8');
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain('GEOMACRO_CONTINENT_NEWS_PUBLICATION: "1"');
  expect(workflow).toContain('run: bun scripts/ops/publish-original-news-five-minute-fastlane.ts');
 });
});
