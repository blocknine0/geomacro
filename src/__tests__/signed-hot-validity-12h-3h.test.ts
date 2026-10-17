import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {classifyD1HotMetadata} from "../../scripts/ops/classify-d1-hot-metadata.mjs";
import {assessSignedHotExpiry} from "../../scripts/ops/watch-signed-hot-expiry.mjs";

const TIME=Date.parse("2026-10-17T12:00:00.000Z");
const ISO=(min:number)=>new Date(TIME+min*60_000).toISOString();
const PRODUCTS=[
  ["intelligence","geomacro.public-intelligence-live.v1","geomacro.public-intelligence-live-proof.v1",
    "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",720],
  ["global-risk","geomacro.public-global-risk-live.v1","geomacro.public-global-risk-live-proof.v1",
    "geomacro-evidence/v1/live/global-risk/latest.json.gz",180],
  ["risk-indices","geomacro.public-risk-indices-live.v1","geomacro.public-risk-indices-live-proof.v1",
    "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",180],
] as const;
function rows(ageMinutes=10){
 return PRODUCTS.map(([product,schema_name,proof_schema,b2_object_key,ttl])=>({
   product,schema_name,proof_schema,b2_object_key,
   source_as_of:ISO(-ageMinutes),generated_at:ISO(-2),
   expires_at:ISO(ttl-ageMinutes),b2_hash_length:64,
   payload_hash_length:64,payload_bytes:1024,source_run_id:"39000000000",
 }));
}
describe("founder-approved signed reference validity and separate live freshness",()=>{
 it("retains independently pinned proofs for 12h Intelligence / 3h GRI and Indices",()=>{
   const accepted=classifyD1HotMetadata(rows(75),{nowMs:TIME});
   expect(accepted.all_three_metadata_eligible).toBe(true);
   const watch=assessSignedHotExpiry(accepted,{nowMs:TIME});
   expect(watch.all_three_within_safe_window).toBe(true);
   expect(watch.live_freshness_ready).toBe(false);
   expect(watch.attention_required).toBe(true);
   for(const [product] of PRODUCTS){
     expect(accepted.products[product].live_freshness_eligible).toBe(false);
     expect(watch.products[product].status).toBe("WITHIN_WINDOW");
     expect(watch.products[product].live_freshness_eligible).toBe(false);
   }
   expect(accepted.commercial_eligibility_verified).toBe(false);
   expect(watch.real_commercial_product_approved).toBe(false);
 });
 it("limits each product using immutable source time even when generated recently",()=>{
   for(const [name,,, ,ttl] of PRODUCTS){
     const bad=rows(10);
     const item=bad.find(r=>r.product===name)!;
     item.source_as_of=ISO(-ttl-1);
     item.expires_at=ISO(-1);
     const report=classifyD1HotMetadata(bad,{nowMs:TIME});
     expect(report.products[name].reasons).toContain("SOURCE_TOO_OLD");
     expect(report.products[name].metadata_eligible).toBe(false);
   }
 });
 it("rejects an invented expiry beyond 12h / 3h despite a fresh source",()=>{
   const data=rows();
   for(const row of data) row.expires_at=ISO(row.product==="intelligence"?721:181);
   const report=classifyD1HotMetadata(data,{nowMs:TIME});
   for(const [name] of PRODUCTS){
     expect(report.products[name].reasons).toContain("EXPIRY_WINDOW_INVALID");
   }
 });
 it("consistently enforces the new maximums and independent 60-minute live gate",()=>{
   const control=readFileSync("workers/control-plane/src/index.mjs","utf8");
   const health=readFileSync("src/routes/api.health.ts","utf8");
   const intel=readFileSync("workers/intelligence-edge/src/index.mjs","utf8");
   const gri=readFileSync("workers/global-risk-edge/src/index.mjs","utf8");
   const indices=readFileSync("workers/risk-indices-edge/src/index.mjs","utf8");
   const parent=readFileSync("scripts/lib/risk-indices-verified-d1-parent.mjs","utf8");
   expect((control.match(/maxAgeMs: 12 \* 60 \* 60 \* 1000/g)||[])).toHaveLength(1);
   expect((control.match(/maxAgeMs: 180 \* 60 \* 1000/g)||[])).toHaveLength(2);
   expect((health.match(/liveFreshnessMs: 60 \* 60 \* 1000/g)||[])).toHaveLength(3);
   expect(health).toContain("now - sourceAsOfMs > probe.liveFreshnessMs");
   expect(intel).toContain("SIGNED_HOT_VALIDITY_MS = 12 * 60 * 60 * 1000");
   expect(intel).toContain("Date.now() - sourceAsOf > LIVE_SOURCE_FRESHNESS_MS");
   for(const edge of [gri,indices]){
     expect(edge).toContain("sourceAsOf + 180 * 60 * 1000");
     expect(edge).toContain("Date.now() - sourceAsOf > 60 * 60 * 1000");
   }
   expect(parent).toContain("const MAX_AGE_MS = 180 * 60_000");
   expect(parent).toContain("now - sourceMs > LIVE_PUBLICATION_SOURCE_MAX_AGE_MS");
   expect(parent).toContain("now - readingMs > LIVE_PUBLICATION_SOURCE_MAX_AGE_MS");
 });
 it("never reactivates old paid or frozen Supabase paths",()=>{
   const health=readFileSync("src/routes/api.health.ts","utf8");
   const watch=readFileSync("scripts/ops/watch-signed-hot-expiry.mjs","utf8");
   expect(health).toContain("qualifyPublicCurrentReadiness");
   expect(health).toContain("status: deepReady ? 200 : 503");
   expect(watch).toContain("new_snapshot_published:false");
   expect(watch).toContain("supabase_reads:0");
   expect(watch).toContain("real_funds_touched:false");
 });
});
