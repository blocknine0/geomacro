import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  websitePublicCutoff,
  websiteLaggedEvidenceRows,
  websiteVerifiedSnapshotPastEmbargo,
} from "../lib/website-publication-delay";

const read=(p:string)=>readFileSync(p,"utf8");
const NOW=Date.parse("2026-10-12T12:00:00.000Z");
const iso=(mins:number)=>new Date(NOW+mins*60_000).toISOString();

describe("Supabase-frozen, strictly lagged source-private public GRI",()=>{
 it("website GRI/historical D1 and independent verified edge failover NEVER read frozen Supabase",()=>{
  const server=read("src/lib/global-risk-read.server.ts");
  const lag=server.slice(server.indexOf("export async function readWebsiteLaggedGlobalRisk("));
  expect(lag).not.toContain("getAppSupabase()");
  expect(lag).not.toContain('.from("gri_snapshots")');
  expect(lag).not.toContain('SUPABASE_DB_URL');
  expect(lag).toContain("/v1/public/website-lagged-global-risk");
  // Under quota exhaustion website never falls through to unmetered direct
  // S3. Cloudflare risk edge owns account-wide D1 B2 reservation/caching.
  expect(lag).toContain('await import("./global-risk-edge.server")');
  expect(lag).toContain("readGlobalRiskEdge()");
  expect(lag).not.toContain("const b2=await readB2PublicRisk();");
  const helper=read("src/lib/b2-live.server.ts");
  expect(helper).toContain("async function signedGetOnce(");
  // This generic helper may still have direct S3 reads for non-website
  // recovery; keeping it out of the public website path is deliberate.
  expect(helper).toContain("await readJsonGzip<");
  expect(lag).toContain("websiteVerifiedSnapshotPastEmbargo");
  expect(lag).toContain("validateGlobalRiskContinuity");
  expect(lag).toContain("WEBSITE_GRI_ONE_HOUR_VERIFIED_SNAPSHOT_UNAVAILABLE");
  const worker=read("workers/control-plane/src/index.mjs");
  expect(worker).toContain("website_verified_gri_snapshot_history");
  expect(worker).toContain("hex!==row.payload_sha256");
  expect(worker).toContain("privateVerifiedGriHistoryProjection");
  expect(worker).toContain("WEBSITE_GRI_HISTORY_LIMIT");
  expect(worker).toContain("env.DB.batch([currentStatement,historicalInsert,prune])");
  // The paid API retains an independent unlagged signed-GRO path.
  const paid=read("src/lib/mainnet-intelligence-endpoint.server.ts");
  expect(paid).not.toContain("website-lagged-global-risk");
  expect(paid).not.toContain("websitePublicCutoff");
 });
 it("the entire public website uses an actual 60-min cutoff, never a backdated display label",()=>{
  expect(websitePublicCutoff(NOW)).toBe(NOW-3_600_000);
  const rows=[
    {id:"released",published_at:iso(-61),created_at:iso(-60)},
    {id:"fresh-original",published_at:iso(-59),created_at:iso(-100)},
    {id:"fresh-ingestion",published_at:iso(-180),created_at:iso(-59)},
    {id:"unknown",published_at:null,created_at:iso(-200)},
  ];
  expect(websiteLaggedEvidenceRows(rows,NOW).map(x=>x.id)).toEqual(["released"]);
  expect(websiteVerifiedSnapshotPastEmbargo({
    snapshotAsOf:iso(-60),verificationStatus:"verified",auditPersisted:true,
    recentEvents:[],domainIndices:{geopolitics:{readingAsOf:iso(-62)}},
  },NOW)).toBe(true);
  expect(websiteVerifiedSnapshotPastEmbargo({
    snapshotAsOf:iso(-59),verificationStatus:"verified",auditPersisted:true,
    recentEvents:[],
  },NOW)).toBe(false);
  const intel=read("src/lib/use-intelligence.ts");
  const ssr=read("src/lib/public-intelligence-seo.functions.ts");
  const gri=read("src/lib/use-global-risk.ts");
  const indices=read("src/lib/use-risk-indices.ts");
  expect(intel).toContain("websiteLaggedEvidenceRows");
  expect(ssr).toContain("websiteLaggedEvidenceRows");
  expect(gri).toContain("getWebsiteLaggedGlobalRisk");
  expect(indices).toContain("getWebsiteLaggedGlobalRisk");
 });
 it("homepage WHY never fetches original headline, frozen DB or upstream source fields",()=>{
  const hero=read("src/components/sections/hero-section.tsx");
  expect(hero).toContain("useGlobalRisk()");
  expect(hero).toContain("riskFeed.data?.drivers");
  expect(hero).toContain("Verified category-level GRI drivers");
  expect(hero).toContain("Independent stories");
  for(const forbidden of [
    "supabaseFeed","gri_snapshots","source_title","sourceTitle",
    "from(\"events\")","from(\"gri_snapshots\")",
    "data.source_name","data.source_url","reportError(",
    "Original article:", "provider_name", "eventChanges",
  ])expect(hero).not.toContain(forbidden);
  expect(hero).toContain("Source identities,");
  expect(hero).not.toContain("Data Sources");
 });
});
