import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  websitePublicCutoff,websiteLaggedEvidenceRows,
  websiteVerifiedSnapshotPastEmbargo,WEBSITE_RELEASE_DELAY_MS,
} from "../lib/website-publication-delay";

const now=Date.parse("2026-10-12T15:00:00.000Z");
const row=(published_at:string,created_at:string)=>({published_at,created_at,category:"macro",severity:62});

describe("founder-final website release and privacy lock — GRI + Intelligence at least 60m delayed",()=>{
 it("keeps website delay exactly 60 minutes and rejects unverified original dates",()=>{
  expect(WEBSITE_RELEASE_DELAY_MS).toBe(3_600_000);
  expect(websitePublicCutoff(now)).toBe(Date.parse("2026-10-12T14:00:00.000Z"));
  const rows=[
    row("2026-10-12T14:00:00.000Z","2026-10-12T13:59:59.000Z"),
    row("2026-10-12T14:00:01.000Z","2026-10-12T13:30:00.000Z"),
    row("2026-10-12T13:59:59.000Z","2026-10-12T14:00:01.000Z"),
    row("","2026-10-12T13:00:00.000Z"),
    row("2026-10-12T16:00:00.000Z","2026-10-12T13:00:00.000Z"),
  ];
  expect(websiteLaggedEvidenceRows(rows,now)).toEqual([rows[0]]);
  expect(rows).toHaveLength(5);
 });
 it("does not backdate recent GRI snapshot or its category readings",()=>{
   const base={
     snapshotAsOf:"2026-10-12T14:00:00.000Z",
     verificationStatus:"verified",
     auditPersisted:true as const,
     recentEvents:[],
     domainIndices:{
       geopolitics:{readingAsOf:"2026-10-12T13:00:00.000Z"},
       macro:{readingAsOf:"2026-10-12T13:20:00.000Z"},
       rare_earth:{readingAsOf:"2026-10-12T13:59:59.000Z"},
     },
   };
   expect(websiteVerifiedSnapshotPastEmbargo(base,now)).toBe(true);
   expect(websiteVerifiedSnapshotPastEmbargo({...base,snapshotAsOf:"2026-10-12T14:00:01.000Z"},now)).toBe(false);
   expect(websiteVerifiedSnapshotPastEmbargo({...base,verificationStatus:"pending"},now)).toBe(false);
   expect(websiteVerifiedSnapshotPastEmbargo({...base,
     domainIndices:{...base.domainIndices,macro:{readingAsOf:"2026-10-12T14:02:00.000Z"}}},now)).toBe(false);
   expect(websiteVerifiedSnapshotPastEmbargo({...base,
     recentEvents:[{published_at:"2026-10-12T14:00:01.000Z"}]},now)).toBe(false);
 });
 it("keeps Supabase completely out of website-only GRI production serving",()=>{
   const reader=readFileSync("src/lib/global-risk-read.server.ts","utf8");
   const webPart=reader.slice(reader.indexOf("export async function readWebsiteLaggedGlobalRisk("));
   expect(webPart).toContain("v1/public/website-lagged-global-risk");
   expect(webPart).toContain("readGlobalRiskEdge");
   expect(webPart).not.toContain("getAppSupabase(");
   expect(webPart).not.toContain("const b2=await readB2PublicRisk(");
   expect(webPart).toContain("websiteVerifiedSnapshotPastEmbargo(risk,now)");
   expect(webPart).toContain("validateGlobalRiskContinuity(risk,now).ok");
   const hook=readFileSync("src/lib/use-global-risk.ts","utf8");
   expect(hook).toContain("getWebsiteLaggedGlobalRisk");
   expect(hook).toContain("websiteVerifiedSnapshotPastEmbargo(previous)");
   expect(hook).toContain('throw new Error("WEBSITE_GRI_LAGGED_SERVER_UNAVAILABLE")');
   expect(hook).not.toContain("previous=await readWithFailover()");
   expect(hook).toContain("getWebsiteLaggedGlobalRisk({data:{}})");
   // A website-only lag does not throttle the paid/API product path.
   const paid=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
   expect(paid).not.toContain("websitePublicCutoff");
   expect(paid).not.toContain("websiteLaggedEvidenceRows");
 });
 it("enforces 60min release on browser Intelligence, SSR/SEO and source-monitor timestamps",()=>{
   const hook=readFileSync("src/lib/use-intelligence.ts","utf8");
   const seo=readFileSync("src/lib/public-intelligence-seo.functions.ts","utf8");
   const monitor=readFileSync("src/components/intelligence/source-network-monitor.tsx","utf8");
   expect(hook).toContain("websiteLaggedEvidenceRows");
   expect(seo).toContain("websiteLaggedEvidenceRows");
   expect(monitor).toContain("PUBLIC_MONITORING_DELAY_MS = 60 * 60_000");
   expect(monitor).toContain("timestamp > now - PUBLIC_MONITORING_DELAY_MS");
   expect(monitor).toContain("lastChecked: null");
   const page=readFileSync("src/routes/intelligence.tsx","utf8");
   expect(page).toContain("Website view · delayed ≥60 minutes");
   expect(page).toContain("website 60-minute release cutoff");
 });
 it("eliminates public navigation to source registry while retaining sitewide verified release disclaimer",()=>{
   const shell=readFileSync("src/components/site-shell.tsx","utf8");
   expect(shell).not.toContain("GITHUB_URL");
   expect(shell).not.toContain("github.com/blocknine0/geomacro");
   expect(shell).not.toContain("<Github ");
   expect(shell).toContain("Intelligence findings have no added publication delay · Risk Indices retain their 60-minute delay");
   const frozen=JSON.parse(readFileSync("config/global-risk-final-lock.json","utf8"));
   expect(frozen.locked).toBe(true);
   expect(frozen.frozen_paths).toEqual([
     "src/routes/global-risk.tsx",
     "src/components/gri/global-risk-domain-indices.tsx",
   ]);
 });
});
