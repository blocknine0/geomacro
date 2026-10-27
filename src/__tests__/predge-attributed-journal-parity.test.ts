import {describe,it,expect} from 'vitest';
import {buildDerivedNewsStructural} from '../lib/derived-news-structural-bridge';
import {predgeJournalParity,readPredgeJournal} from '../../scripts/ops/predge-research-journal-parity.mjs';
const NOW=Date.parse('2026-10-24T15:00:00Z');
const journal=[{id:'macro-12345678',category:'macro',
 title:'Geomacro finds an official update on monetary policy',
 what_changed:'An official publisher released an update on monetary policy.',
 why_it_matters:'Financing conditions may be affected; actual effects require separate evidence.',
 topic:'monetary policy',development_type:'monetary policy',geography:null,
 published_at:'2026-10-23T14:00:00.000Z',date_precision:'exact',observed_release_count:1,
 sources_credited:['Bank of Japan'],status:'official_release_observed_unscored',
 same_event_corrob_verified:false,severity:null}] as any;
const make=(mode:'source_neutral'|'attributed_research')=>{
 const items=buildDerivedNewsStructural(journal,NOW,mode);
 return {ok:true,projection:mode,generated_at:new Date(NOW).toISOString(),items,
  attribution_must_be_preserved:mode==='attributed_research',attribution_is_not_a_grant_of_source_rights:true,
  counts:{geopolitics:0,macro:items.length,rare_earth:0}};
};
describe('independent D1 journal parity for attributed private research',()=>{
 it('accepts a credited private row absent from the public source-neutral view',()=>{
  expect(make('source_neutral').items).toHaveLength(0);
  expect(make('attributed_research').items).toHaveLength(1);
  expect(predgeJournalParity(make('attributed_research'),make('source_neutral'),journal)).toBe(true);
 });
 it('rejects missing attribution, altered prose, invented records, inflated counts and a paid flag',()=>{
  for(const mutate of [(r:any)=>delete r.items[0].sources_credited,
   (r:any)=>r.items[0].observed_change='Invented event outcome',
   (r:any)=>r.items[0].id='macro-ffffffff',
   (r:any)=>r.counts.macro=2,(r:any)=>r.items[0].payable=true,
   (r:any)=>r.attribution_must_be_preserved=false]){
   const r=structuredClone(make('attributed_research'));mutate(r);
   expect(predgeJournalParity(r,make('source_neutral'),journal)).toBe(false);
  }
 });
 it('reads the complete immediate journal with strict duplicate and cursor checks',async()=>{
  const get=async()=>({status:200,body:{ok:true,page_offset:0,page_size:250,
   signals:journal,has_more:false,next_offset:null}});
  expect(await readPredgeJournal(get)).toEqual(journal);
  await expect(readPredgeJournal(async()=>({status:200,body:{...(await get()).body,signals:[...journal,...journal]}})))
   .rejects.toThrow('PREDGE_JOURNAL_INVALID');
  await expect(readPredgeJournal(async()=>({status:200,body:{...(await get()).body,next_offset:250}})))
   .rejects.toThrow('PREDGE_JOURNAL_INVALID');
 });
});
