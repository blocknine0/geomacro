import test from "node:test";
import assert from "node:assert/strict";
import {phase2fCategorySourceReceipt} from "../lib/phase2f-category-source-receipt.mjs";
test("every category reports discovery and quota held without pretending rights, archive commit or D1 success",()=>{
  const rows=[
    ["geopolitics",68,19],
    ["macro",24,5],
    ["rare_earth",13,1],
  ];
  for(const [category,discovered,count] of rows){
    const r=phase2fCategorySourceReceipt({
      category,discovered,relevant:count,deduplicated:count,
      archiveOnly:true,policyReady:false,
    });
    assert.equal(r.outcome,"QUOTA_HELD_ARCHIVE_CANDIDATES");
    assert.equal(r.discovered_official_candidates,discovered);
    assert.equal(r.archive_candidate_count,count);
    assert.equal(r.quota_held,true);
    assert.equal(r.rights_pending,true);
    assert.equal(r.commercially_permitted_count,null);
    assert.equal(r.source_native_original_page_verified_count,null);
    assert.equal(r.archive_commit_verified,false);
    assert.equal(r.d1_write_acknowledged_count,0);
    assert.equal(r.commercial_publication_verified,false);
    assert.equal(r.quota_or_rights_gate_bypassed,false);
  }
});
test("distinguish no-source, worker unavailable and actual free derived write ack",()=>{
  let r=phase2fCategorySourceReceipt({
    category:"geopolitics",discovered:0,relevant:0,deduplicated:0,archiveOnly:true,policyReady:false,
  });
  assert.equal(r.outcome,"NO_SOURCE");
  assert.equal(r.no_source,true);
  r=phase2fCategorySourceReceipt({
    category:"macro",discovered:8,relevant:3,deduplicated:2,archiveOnly:false,policyReady:false,
  });
  assert.equal(r.outcome,"D1_PUBLISHER_POLICY_UNAVAILABLE");
  assert.equal(r.rights_pending,true);
  r=phase2fCategorySourceReceipt({
    category:"rare_earth",discovered:12,relevant:3,deduplicated:2,
    archiveOnly:false,policyReady:true,d1WriteAcknowledged:2,
  });
  assert.equal(r.outcome,"FREE_DERIVED_D1_WRITE_ACKNOWLEDGED");
  assert.equal(r.d1_write_acknowledged_count,2);
  assert.equal(r.free_derived_publication_acknowledged,true);
  assert.equal(r.d1_independent_public_readback_verified,false);
  assert.equal(r.commercial_publication_verified,false);
  assert.equal(r.rights_pending,true);
});
test("reject ungrounded count, fabricated native-authority and quota-bypassing acknowledgement",()=>{
  for(const alteration of [
    {category:"bad"},{discovered:1,relevant:2},
    {relevant:1,deduplicated:2},{d1WriteAcknowledged:3},
    {archiveOnly:true,d1WriteAcknowledged:1},
    {policyReady:false,d1WriteAcknowledged:1},
    {discovered:-1},
  ]){
    const args={category:"macro",discovered:3,relevant:2,deduplicated:2,
      archiveOnly:false,policyReady:true,d1WriteAcknowledged:0,...alteration};
    assert.throws(()=>phase2fCategorySourceReceipt(args),/PHASE2F_SOURCE_FUNNEL_INVALID/);
  }
});
