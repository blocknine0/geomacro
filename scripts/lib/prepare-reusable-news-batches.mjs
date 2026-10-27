/**
 * Fully packed protected D1 writes: max Worker items/checks AND 60KiB bound.
 * Data is already normalized upstream; never discard on size pressure.
 * Uses actual UTF-8, not JS character counts. No source bodies or logs.
 */
export const REUSABLE_BATCH_LIMITS=Object.freeze({
  items:40,checks:48,bytes:60_000,
});
const schema="geomacro.reusable-source-news-batch.v1";
const encoder=new TextEncoder();
export function prepareReusableNewsBatches({items,checks,schema:actualSchema}){
  if(actualSchema!==schema||!Array.isArray(items)||!Array.isArray(checks)||
     items.length+checks.length===0)
    throw Error("REUSABLE_BUNDLE_INPUT_INVALID");
  const batches=[];let ni=0,nc=0;
  const size=group=>encoder.encode(JSON.stringify(group)).byteLength;
  while(ni<items.length||nc<checks.length){
    const group={schema,items:[],checks:[]};
    while(ni<items.length&&group.items.length<REUSABLE_BATCH_LIMITS.items){
      group.items.push(items[ni]);
      if(size(group)>REUSABLE_BATCH_LIMITS.bytes){
        group.items.pop();break;
      }
      ni++;
    }
    while(nc<checks.length&&group.checks.length<REUSABLE_BATCH_LIMITS.checks){
      group.checks.push(checks[nc]);
      if(size(group)>REUSABLE_BATCH_LIMITS.bytes){
        group.checks.pop();break;
      }
      nc++;
    }
    if(group.items.length+group.checks.length===0)
      throw Error("REUSABLE_BUNDLE_SINGLE_RECORD_OVERSIZE");
    batches.push(group);
  }
  return Object.freeze({
    schema:"geomacro.reusable-news-packed-batches.v1",
    batches,
    input_items:items.length,input_checks:checks.length,
    sent_items:batches.reduce((sum,g)=>sum+g.items.length,0),
    sent_checks:batches.reduce((sum,g)=>sum+g.checks.length,0),
    dropped_items:0,dropped_checks:0,
  });
}
