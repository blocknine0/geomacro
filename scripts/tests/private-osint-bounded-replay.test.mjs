import test from "node:test";
import assert from "node:assert/strict";
import {selectBoundedPrivateOsintReplay,MINIMUM_BUNDLED_REPLAY_MAX_ITEMS}
 from "../lib/private-osint-bounded-replay.mjs";
const records=Object.freeze(["geopolitics","macro","rare_earth"].flatMap((category,i)=>
 Array.from({length:30},(_,j)=>Object.freeze({
  id:"news-"+String(i*30+j).padStart(64,"0"),category
 }))));
test("readback budget never replays 768 original items into a single minimum Free D1 tick",()=>{
 const p={items:records};
 const b=selectBoundedPrivateOsintReplay(p,{now:Date.parse("2026-10-31T00:00:00Z")});
 assert.equal(MINIMUM_BUNDLED_REPLAY_MAX_ITEMS,5);
 assert.equal(b.eligible_total,90);
 assert.equal(b.eligible_selected,5);
 assert.equal(b.eligible_deferred,85);
 assert.equal(b.all_eligible_selected,false);
 assert.equal(b.encrypted_artifact_can_be_deleted_on_partial,false);
 assert.deepEqual(b.category_counts,{geopolitics:2,macro:2,rare_earth:1});
 assert.equal(new Set(b.items.map(x=>x.id)).size,b.items.length);
 assert.equal(b.source_fetches,0);
 assert.equal(b.commercial_rights_granted,false);
});
test("subsequent admitted time slot advances immutable items and gives minerals fair share",()=>{
 const p={items:records};
 const a=selectBoundedPrivateOsintReplay(p,{now:Date.parse("2026-10-31T00:00:00Z")});
 const b=selectBoundedPrivateOsintReplay(p,{now:Date.parse("2026-10-31T00:15:00Z")});
 assert.notDeepEqual(a.items.map(x=>x.id),b.items.map(x=>x.id));
 assert.equal(b.category_counts.rare_earth,1);
});
test("only fully replayable <=5-row artifact becomes an eligible candidate for strict deletion proof",()=>{
 const a=selectBoundedPrivateOsintReplay({items:records.slice(0,3)},
   {now:Date.parse("2026-10-31T00:00:00Z")});
 assert.equal(a.all_eligible_selected,true);
 assert.equal(a.eligible_deferred,0);
 assert.equal(a.eligible_selected,3);
 const empty=selectBoundedPrivateOsintReplay({items:[]});
 assert.equal(empty.all_eligible_selected,true);
 assert.equal(empty.eligible_selected,0);
 for(const [planned,opts] of [[null,{}],[{items:[{id:"id",category:"fake"}]},{}],
  [{items:records},{maxItems:6}]]){
  assert.throws(()=>selectBoundedPrivateOsintReplay(planned,opts),/OSINT_MINIMUM_BUNDLED_REPLAY_INVALID/);
 }
});
