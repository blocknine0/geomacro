import {describe,it,expect} from 'vitest';
// @ts-expect-error Shared JavaScript batch utility has no declaration file.
import {prepareDerivedNewsBatches} from '../../scripts/lib/derived-news-d1-batches.mjs';
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
});
