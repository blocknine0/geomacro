import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {writeOptionalRiskStreamNormalizedOriginals} from "../ops/ingest-direct-global-corridors.mjs";

const normalized={feed_origin:"RSS",source_id:"approved_wire",source_url:"https://wire.test/item",
 event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
  target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:00:00.000Z"},
 raw_payload:"Private normalized source bytes, synthetic test only.",reporting_position:"confirms"};

test("normalized feed export is OFF by default and writes no file",()=>{
 const directory=mkdtempSync(join(tmpdir(),"risk-stream-export-off-"));
 try{
  assert.equal(writeOptionalRiskStreamNormalizedOriginals({normalized_originals:[normalized]},
   {directory}),null);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test("enabled export writes only provided normalized originals with private mode",()=>{
 const directory=mkdtempSync(join(tmpdir(),"risk-stream-export-on-"));
 try{
  const output=writeOptionalRiskStreamNormalizedOriginals({normalized_originals:[normalized]},
   {enabled:"true",directory});
  assert.deepEqual(JSON.parse(readFileSync(output,"utf8").trim()),normalized);
  assert.equal(statSync(output).mode&0o777,0o600);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test("enabled export fails closed when normalized originals are absent or GDELT index-only",()=>{
 const directory=mkdtempSync(join(tmpdir(),"risk-stream-export-invalid-"));
 try{
  assert.throws(()=>writeOptionalRiskStreamNormalizedOriginals({},
   {enabled:"true",directory}),/NORMALIZED_EXPORT_INPUT_MISSING/u);
  assert.throws(()=>writeOptionalRiskStreamNormalizedOriginals({normalized_originals:[
   {...normalized,feed_origin:"GDELT_INDEX"}]},{enabled:"true",directory}),
   /NORMALIZED_EXPORT_INVALID/u);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
