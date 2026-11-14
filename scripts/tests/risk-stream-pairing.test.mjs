import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {pairRiskStreamOriginals} from "../lib/risk-stream-pairing.mjs";

const now=Date.parse("2026-11-14T12:00:00.000Z");
const base={category:"GEOPOLITICS",country_iso3:"USA",
 event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
  target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:00:00.000Z"},
 feed_origin:"RSS",published_at:"2026-11-14T11:00:00.000Z",reporting_position:"confirms"};
function item(id,role,root,parent,overrides={}){
 const raw_payload="Original page bytes from "+id+" private fixture.";
 return {...base,source_id:id,source_role:role,publisher_root_domain:root,
  parent_media_entity:parent,source_url:"https://"+root+"/item",
  raw_payload,original_page_sha256:createHash("sha256").update(raw_payload).digest("hex"),
  ...overrides};
}
const pair=()=>[
 item("wire_primary","GOVERNMENT_WIRE","wire.test","wire_parent"),
 item("regional_primary","INDEPENDENT_REGIONAL","regional.test","regional_parent")
];

test("pairs two independent required-role publishers for the same claim",()=>{
 const result=pairRiskStreamOriginals(pair(),now);
 assert.equal(result.pairs.length,1);
 assert.equal(result.pairs[0].state,"QUALIFIED_PAIR");
 assert.equal(result.pairs[0].items.length,2);
});

test("same parent media entity (syndicated copies) is never paired",()=>{
 const [a,b]=pair();b.parent_media_entity=a.parent_media_entity;
 assert.equal(pairRiskStreamOriginals([a,b],now).pairs.length,0);
});

test("a dispute or retraction vetoes otherwise qualifying confirmations",()=>{
 for(const position of ["disputes","retracts"]){
  const [a,b]=pair();
  assert.equal(pairRiskStreamOriginals([a,b,{...b,source_id:"third_source",
   publisher_root_domain:"third.test",parent_media_entity:"third_parent",
   reporting_position:position}],now).pairs.length,0);
  assert.equal(pairRiskStreamOriginals([a,b,{...b,source_id:"third_source",
   publisher_root_domain:"third.test",parent_media_entity:"third_parent",
   reporting_position:position}],now).contradictions[0].state,"MATERIAL_CONTRADICTION");
 }
});

test("both required roles and distinct article bytes are required",()=>{
 const [a,b]=pair();b.source_role="GOVERNMENT_WIRE";
 assert.equal(pairRiskStreamOriginals([a,b],now).pairs.length,0);
 const [c,d]=pair();d.raw_payload=c.raw_payload;d.original_page_sha256=c.original_page_sha256;
 assert.equal(pairRiskStreamOriginals([c,d],now).pairs.length,0);
});
