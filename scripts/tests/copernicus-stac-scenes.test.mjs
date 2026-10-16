import {test} from "node:test";
import assert from "node:assert/strict";
import {
 buildCopernicusSceneQuery,parseCopernicusScenes,fetchCopernicusScenes,
 MINERAL_REGION_PILOT
} from "../../global-intelligence/adapters/copernicus-stac-scenes.mjs";
const now=new Date("2026-10-16T12:00:00.000Z");
const item=(patch={})=>({
  type:"Feature",id:"S2A_TEST_123",collection:"sentinel-2-l2a",
  bbox:[-69.33,-24.53,-69.01,-24.16],
  geometry:{type:"Polygon",coordinates:[
    [[-69.33,-24.53],[-69.01,-24.53],[-69.01,-24.16],[-69.33,-24.53]]
  ]},
  properties:{datetime:"2026-10-01T10:10:10Z"},
  assets:{B04:{href:"s3://eodata/test-private-not-a-direct-image"}},...patch
});
const fixture=(features=[item()])=>({type:"FeatureCollection",features});
test("only bounded exact official collection and area can be queried",()=>{
  const q=buildCopernicusSceneQuery({now});
  const u=new URL(q.url);
  assert.equal(u.origin,"https://stac.dataspace.copernicus.eu");
  assert.equal(u.pathname,"/v1/collections/sentinel-2-l2a/items");
  assert.equal(u.searchParams.get("limit"),"5");
  assert.deepEqual(q.bbox,[...MINERAL_REGION_PILOT.bbox]);
  assert.throws(()=>buildCopernicusSceneQuery({bbox:[-180,-40,180,50],now}),/STAC_BBOX_OUT_OF_SCOPE/);
  assert.throws(()=>buildCopernicusSceneQuery({bbox:[1,2,1,3],now}),/STAC_BBOX_OUT_OF_SCOPE/);
  assert.throws(()=>buildCopernicusSceneQuery({bbox:["1",2,3,4],now}),/STAC_BBOX_INVALID/);
  assert.throws(()=>buildCopernicusSceneQuery({now,days:1000}),/STAC_QUERY_SCOPE_INVALID/);
});
test("actual satellite acquisition, geometry and digest are checked, not news timestamps",()=>{
  const r=parseCopernicusScenes(fixture(),{now});
  assert.equal(r.scene_count,1);
  assert.equal(r.latest_acquired_at,"2026-10-01T10:10:10Z");
  assert.match(r.scenes[0].scene_sha256,/^[0-9a-f]{64}$/);
  assert.equal(r.scenes[0].actual_asset_bytes_readback,false);
  assert.equal(r.real_imagery_retrieved,false);
  assert.equal(r.verified_mineral_disruption,false);
  assert.equal(r.country_iso3,null);
  assert.doesNotMatch(JSON.stringify(r),/s3:|S2A_TEST/);
});
test("date-only, unrelated geo, wrong collection, missing assets or future/stale time fail",()=>{
  for(const x of [
    item({collection:"sentinel-1-grd"}),
    item({bbox:[70,40,71,41]}),
    item({assets:{}}),
    item({properties:{datetime:"2026-10-01"}}),
    item({properties:{datetime:"2026-01-01T00:00:00Z"}}),
    item({properties:{datetime:"2026-12-01T00:00:00Z"}}),
    item({geometry:{type:"Point",coordinates:[-69,-24]}}),
  ])assert.throws(()=>parseCopernicusScenes(fixture([x]),{now}));
});
test("duplicate scenes are deduplicated, empty result is not current intelligence",()=>{
  const r=parseCopernicusScenes(fixture([item(),item()]),{now});
  assert.equal(r.scene_count,1);
  const empty=parseCopernicusScenes(fixture([]),{now});
  assert.equal(empty.scene_count,0);
  assert.equal(empty.latest_acquired_at,null);
  assert.equal(empty.signed_current_intelligence,false);
});
test("bounded GET refuses redirects, HTTP errors, huge content, malformed shape",async()=>{
  let called=0;
  const r=await fetchCopernicusScenes({now,fetchImpl:async (u,init)=>{
    called++;
    assert.equal(init.redirect,"error");
    assert.equal(init.method,"GET");
    assert.equal(new URL(u).hostname,"stac.dataspace.copernicus.eu");
    return Response.json(fixture());
  }});
  assert.equal(called,1);
  assert.equal(r.scene_count,1);
  await assert.rejects(()=>fetchCopernicusScenes({now,fetchImpl:async()=>new Response("",{status:429})}),/STAC_HTTP_429/);
  await assert.rejects(()=>fetchCopernicusScenes({now,fetchImpl:async()=>new Response("{}",{
    headers:{"content-length":"600000"}})}),/STAC_BODY_LIMIT/);
  await assert.rejects(()=>fetchCopernicusScenes({now,fetchImpl:async()=>Response.json({unrelated:true})}),/STAC_ITEM_COLLECTION_INVALID/);
});
