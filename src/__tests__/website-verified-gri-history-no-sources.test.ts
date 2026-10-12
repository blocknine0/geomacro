import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  privateVerifiedGriHistoryProjection,
  WEBSITE_GRI_DELAY_MS,WEBSITE_GRI_HISTORY_LIMIT,
  WEBSITE_GRI_HISTORY_RETENTION_MS,
} from "../../workers/control-plane/src/website-gri-history.mjs";

const now=Date.parse("2026-10-12T12:00:00.000Z");
const time=(minutes:number)=>new Date(now+minutes*60_000).toISOString();
function stored(asOf=time(-61)){
 const data={
  snapshotId:"gri-verified-123",
  snapshotAsOf:asOf,
  methodologyVersion:"gri-v1.2.0",
  verificationStatus:"verified",
  auditPersisted:true,
  proofHash:"a".repeat(64),
  inputHash:"b".repeat(64),
  calculationHash:"c".repeat(64),
  domainIndices:{
   geopolitics:{readingAsOf:asOf,score:41},
   macro:{readingAsOf:asOf,score:29},
   rare_earth:null,
  },
  recentEvents:[{
   id:"private-event",source_url:"https://private-publisher.example/news",
   source_name:"PRIVATE_PUBLISHER",source_title:"Private original headline",
   published_at:time(-72),created_at:time(-71),
  }],
  drivers:[{category:"geopolitics",topEvent:{title:"Private original headline"}}],
  topDriver:{category:"geopolitics",topEvent:{title:"Private original headline"}},
 };
 const value={
  schema:"geomacro.public-global-risk-live.v1",
  source_project:"ldpwajisioljyjtojvfx",
  generated_at:time(-2),
  data,
 };
 const payload_json=JSON.stringify(value);
 return {
  source_as_of:asOf,payload_json,
  original_verified_at:time(-2),
  payload_sha256:createHash("sha256").update(payload_json).digest("hex"),
  b2_sha256:"d".repeat(64),
  proof_schema:"geomacro.public-global-risk-live-proof.v1",
 };
}
describe("bounded privacy-safe genuine prior verified website GRI history",()=>{
 it("retains at most 12 records for 72h, exact one-hour original snapshot embargo",()=>{
  expect(WEBSITE_GRI_DELAY_MS).toBe(3_600_000);
  expect(WEBSITE_GRI_HISTORY_LIMIT).toBe(12);
  expect(WEBSITE_GRI_HISTORY_RETENTION_MS).toBe(259_200_000);
  const eligible=privateVerifiedGriHistoryProjection(stored(time(-60)),{now});
  expect(eligible?.ok).toBe(true);
  expect(privateVerifiedGriHistoryProjection(stored(time(-59)),{now})).toBeNull();
  expect(privateVerifiedGriHistoryProjection(stored(time(+3)),{now})).toBeNull();
  expect(privateVerifiedGriHistoryProjection(stored(time(-31*24*60)),{now})).toBeNull();
 });
 it("returns only true risk-derived values, never private original event/source identities",()=>{
  const r=privateVerifiedGriHistoryProjection(stored(),{now});
  expect(r).toMatchObject({
   ok:true,schema:"geomacro.website-lagged-global-risk.v1",
   website_only:true,minimum_delay_minutes:60,
   source_identity_disclosed:false,raw_upstream_disclosed:false,
   prior_b2_readback_verified_at_write:true,
   independently_rechecked_b2_now:false,
   paid_delivery_authorized:false,chargeable:false,
  });
  expect(r?.data?.snapshotId).toBe("gri-verified-123");
  expect(r?.data?.recentEvents).toEqual([]);
  expect(r?.data?.drivers[0].topEvent).toBeNull();
  expect(r?.data?.topDriver.topEvent).toBeNull();
  expect(JSON.stringify(r)).not.toContain("private-publisher");
  expect(JSON.stringify(r)).not.toContain("PRIVATE_PUBLISHER");
  expect(JSON.stringify(r)).not.toContain("Private original headline");
  expect(JSON.stringify(r)).not.toContain("source_url");
 });
 it("refuses malformed, unverified, future-domain and post-cutoff private publisher event claims",()=>{
  const o=stored();
  expect(privateVerifiedGriHistoryProjection({...o,proof_schema:"unverified"}, {now})).toBeNull();
  expect(privateVerifiedGriHistoryProjection({...o,b2_sha256:"invalid"}, {now})).toBeNull();
  const changed=JSON.parse(o.payload_json);
  changed.data.domainIndices.macro.readingAsOf=time(-15);
  expect(privateVerifiedGriHistoryProjection({...o,payload_json:JSON.stringify(changed)}, {now})).toBeNull();
  const event=JSON.parse(o.payload_json);
  event.data.recentEvents[0].published_at=time(-15);
  expect(privateVerifiedGriHistoryProjection({...o,payload_json:JSON.stringify(event)}, {now})).toBeNull();
 });
 it("production store enforces original hash check, atomic D1 archive and strict no-source read projection",()=>{
  const code=readFileSync("workers/control-plane/src/index.mjs","utf8");
  const migration=readFileSync("workers/control-plane/migrations/0015_website_verified_gri_history.sql","utf8");
  const website=readFileSync("src/lib/global-risk-read.server.ts","utf8");
  expect(migration).toContain("CREATE TABLE IF NOT EXISTS website_verified_gri_snapshot_history");
  expect(code).toContain("env.DB.batch([currentStatement,historicalInsert,prune])");
  expect(code).toContain('row.verificationMode==="direct-b2-readback"');
  expect(code).toContain('hex!==row.payload_sha256');
  expect(code).toContain('url.pathname==="/v1/public/website-lagged-global-risk"');
  expect(code).toContain("privateVerifiedGriHistoryProjection(row,{now})");
  expect(code).toContain("source_identity_disclosed:false");
  expect(website).toContain("/v1/public/website-lagged-global-risk");
  expect(website).toContain("websiteVerifiedSnapshotPastEmbargo(receipt.data,now)");
  expect(website).toContain("validateGlobalRiskContinuity(receipt.data,now).ok");
  const paid=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
  expect(paid).not.toContain("website-lagged-global-risk");
  expect(paid).not.toContain("WEBSITE_GRI_DELAY_MS");
 });
});
