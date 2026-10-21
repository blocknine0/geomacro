import {describe,it,expect} from 'vitest';
// @ts-expect-error Shared JavaScript batch utility has no declaration file.
import {prepareDerivedNewsBatches} from '../../scripts/lib/derived-news-d1-batches.mjs';
import {deriveStatelessSignals} from '../lib/stateless-intelligence-model';
// @ts-expect-error Existing JavaScript Worker admission contract.
import {verifyDerivedStory} from '../../workers/control-plane/src/website-derived-intelligence.mjs';
describe('derived journal ingress byte limits and duplicate identity',()=>{
 it('preserves every distinct Unicode item inside the actual 64-KiB envelope limit',()=>{
  const items=Array.from({length:121},(_,i)=>({id:'macro-'+i,title:'বাংলা সংবাদ '.repeat(90)}));
  const result=prepareDerivedNewsBatches([...items,items[0]]);
  expect(result.signals).toEqual(items);expect(result.chunks.flat()).toEqual(items);
  for(const chunk of result.chunks){
   expect(chunk.length).toBeLessThanOrEqual(40);
   expect(Buffer.byteLength(JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals:chunk}))).toBeLessThanOrEqual(60000);
  }
 });
 it('keeps an empty retention sweep and rejects oversize or conflicting IDs without dropping data',()=>{
  expect(prepareDerivedNewsBatches([]).chunks).toEqual([[]]);
  expect(()=>prepareDerivedNewsBatches([{id:'a',title:'x'.repeat(60000)}])).toThrow('SINGLE_ITEM_TOO_LARGE');
  expect(()=>prepareDerivedNewsBatches([{id:'a',title:'first'},{id:'a',title:'changed'}])).toThrow('DUPLICATE_ID_CONFLICT');
 });
 it('admits the actual EIA, WTO and Australian-resource Macro cards produced by the source model',()=>{
  const now=Date.parse('2026-10-21T18:00:00Z');
  const sources=[
   {sourceId:'eia_press_macro',title:'Short-Term Energy Outlook for winter fuels',publishedAt:'2026-10-21T16:00:00Z',expected:'energy supply and cost outlook'},
   {sourceId:'wto_trade_original_rss',title:'WTO dispute-settlement panel notice',publishedAt:'2026-10-21T16:00:00Z',expected:'international trade measures and disputes'},
   {sourceId:'au_resources_macro_index',title:'Resources and energy exports outlook',publishedAt:'2026-10-19',datePrecision:'day',expected:'resources and energy export outlook'},
  ];
  for(const [i,source] of sources.entries()){
   const [card]=deriveStatelessSignals([{...source,category:'macro',credit:null,articleUrl:'https://example.org/original-'+i} as any],now);
   expect(card.topic).toBe(source.expected);expect(verifyDerivedStory(card,now)).toBe(true);
  }
 });
});
