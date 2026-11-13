import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hot50DailySignalInputs,planHot50StreamCells,HOT50_STREAM_TARGETS}
 from "../../workers/control-plane/src/risk-stream-autonomous-hot50.mjs";
const now=Date.parse("2026-11-14T12:00:00Z");
test("hot50 includes exactly 150 three-category targets, each rotated by minute",()=>{
 assert.equal(HOT50_STREAM_TARGETS.length,150);
 assert.equal(new Set(HOT50_STREAM_TARGETS.map(x=>x.country_iso3+"|"+x.category)).size,150);
 const visited=new Set();
 for(let t=0;t<75;t++){
  const targets=planHot50StreamCells(t*60000,2);
  for(const x of targets)visited.add(x.country_iso3+"|"+x.category);
 }
 assert.equal(visited.size,150);
});
test("news from five D1 lanes and verified stream is today-only and private",async()=>{
 const target={country_iso3:"IND",category:"GEOPOLITICS"};
 const pool={
  discovery:[
   {country_iso3:"IND",category:"geopolitics",signal_id:"a".repeat(64),source_clock_at:"2026-11-14T09:00:00Z"},
   {country_iso3:"IND",category:"geopolitics",signal_id:"b".repeat(64),source_clock_at:"2026-11-13T09:00:00Z"},
   {country_iso3:"USA",category:"geopolitics",signal_id:"c".repeat(64),source_clock_at:"2026-11-14T09:00:00Z"}
  ],
  search:[{country_iso3:"IND",category:"GEOPOLITICS",lead_id:"d".repeat(64),
   published_at:"2026-11-14T10:00:00Z",publisher_root_domain:"publisher.example"}],
  evidence:[{country_iso3:"IND",category:"GEOPOLITICS",observation_id:"e".repeat(64),
   event_fingerprint:"f".repeat(64),published_at:"2026-11-14T11:00:00Z",
   original_verified:1,enabled:1,commercial_rights_approved:1,
   rights_expire_at:"2026-11-15T00:00:00Z",
   derived_json:JSON.stringify({what:"Unverified WAR event signal reported for IND"})}],
  signed:[{country_iso3:"IND",category:"GEOPOLITICS",event_fingerprint:"f".repeat(64),
   signature_verified:true}]
 };
 const out=await hot50DailySignalInputs(target,pool,now);
 assert.equal(out.length,3);
 assert.equal(out.filter(x=>x.original_verified).length,1);
 assert.equal(out.filter(x=>x.corroborated_signed_original).length,1);
 assert.ok(out.every(x=>x.published_at.startsWith("2026-11-14")));
 assert.ok(out.every(x=>!Object.hasOwn(x,"publisher_root_domain")&&!Object.hasOwn(x,"source_url")));
});
test("stream and scheduled runner both issue immutable GeoMacro news GROs; no payment path",()=>{
 const p=readFileSync("workers/control-plane/src/risk-stream-pipeline.mjs","utf8");
 const c=readFileSync("workers/control-plane/src/risk-stream-autonomous-hot50.mjs","utf8");
 const g=readFileSync("workers/control-plane/src/risk-stream-news-gro.mjs","utf8");
 assert.match(p,/issueDailyNewsBatch\(env,distinct\.map/u);
 assert.match(c,/issueDailyNewsBatch\(env,events/u);
 assert.match(g,/commercial_sale_authorized:false/u);
 assert.match(g,/billable:false/u);
 assert.doesNotMatch(g,/dispatchLicensedCommercialOutbox|persistPredgePaidUsage|customer_store_risk_gate_usage/u);
});
