import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
 WEBSITE_RELEASE_DELAY_MS,websitePublicCutoff,
 websiteEvidencePastEmbargo,websiteLaggedEvidenceRows,
 websiteVerifiedSnapshotPastEmbargo,
} from "../lib/website-publication-delay";

const NOW=Date.parse("2026-10-12T12:00:00.000Z");
const iso=(offsetMinutes:number)=>new Date(NOW+offsetMinutes*60_000).toISOString();
describe("website-only 60min publication embargo (machine / x402 unaffected)",()=>{
 it("defines exactly 60min and preserves source-native clocks without rewriting timestamps",()=>{
  expect(WEBSITE_RELEASE_DELAY_MS).toBe(3_600_000);
  expect(websitePublicCutoff(NOW)).toBe(Date.parse("2026-10-12T11:00:00.000Z"));
  expect(()=>websitePublicCutoff(NaN)).toThrow("WEBSITE_RELEASE_CLOCK_INVALID");
  expect(()=>websitePublicCutoff(Infinity)).toThrow("WEBSITE_RELEASE_CLOCK_INVALID");
  const records=[
   {published_at:iso(-61),created_at:iso(-61),id:"old"},
   {published_at:iso(-60),created_at:iso(-60),id:"boundary"},
   {published_at:iso(-59),created_at:iso(-59),id:"too-soon"},
   {published_at:iso(-90),created_at:iso(-1),id:"recently-verified"},
   {published_at:null,created_at:iso(-300),id:"undated"},
   {published_at:iso(5),created_at:iso(-70),id:"future"},
  ];
  const original=JSON.stringify(records);
  expect(websiteLaggedEvidenceRows(records,NOW).map(x=>x.id)).toEqual(["old","boundary"]);
  expect(JSON.stringify(records)).toBe(original);
  expect(websiteEvidencePastEmbargo(records[1],NOW)).toBe(true);
  expect(websiteEvidencePastEmbargo(records[3],NOW)).toBe(false);
  expect(websiteEvidencePastEmbargo(records[4],NOW)).toBe(false);
 });
 it("cannot release a newer verified GRI score with a misleading old rendered-as-of label",()=>{
  const base={
   snapshotAsOf:iso(-60),verificationStatus:"verified",
   auditPersisted:true as const,
   recentEvents:[{published_at:iso(-61),created_at:iso(-61)}],
   domainIndices:{
     geopolitics:{readingAsOf:iso(-60)},
     macro:{readingAsOf:iso(-220)},
     rare_earth:null,
   },
  };
  expect(websiteVerifiedSnapshotPastEmbargo(base,NOW)).toBe(true);
  expect(websiteVerifiedSnapshotPastEmbargo({...base,snapshotAsOf:iso(-59)},NOW)).toBe(false);
  expect(websiteVerifiedSnapshotPastEmbargo({...base,
   domainIndices:{...base.domainIndices,macro:{readingAsOf:iso(-1)}}},NOW)).toBe(false);
  expect(websiteVerifiedSnapshotPastEmbargo({...base,
   recentEvents:[{published_at:iso(-1),created_at:iso(-50)}]},NOW)).toBe(false);
  expect(websiteVerifiedSnapshotPastEmbargo({...base,verificationStatus:"pending"},NOW)).toBe(false);
 });
 it("keeps the GRI frozen UI unchanged and uses a separate archived snapshot server function",()=>{
  const gri=readFileSync("src/routes/global-risk.tsx","utf8");
  const oldGri=readFileSync("src/components/gri/global-risk-domain-indices.tsx","utf8");
  const hook=readFileSync("src/lib/use-global-risk.ts","utf8");
  const websiteFn=readFileSync("src/lib/website-lagged-global-risk.functions.ts","utf8");
  const historical=readFileSync("src/lib/global-risk-read.server.ts","utf8");
  const machine=readFileSync("src/lib/production-global-risk.server.ts","utf8");
  const index=readFileSync("src/lib/use-risk-indices.ts","utf8");
  expect(gri).toContain("component: GlobalRiskDomainIndices");
  expect(oldGri).toContain("const risk = useGlobalRisk()");
  expect(hook).toContain("getWebsiteLaggedGlobalRisk");
  expect(hook).toContain("websiteVerifiedSnapshotPastEmbargo");
  // Website-only serving is D1 verified historical ring -> verified B2
  // rather than a frozen Supabase query that can hang or burn quota.
  const webMethod=historical.slice(historical.indexOf("export async function readWebsiteLaggedGlobalRisk"));
  expect(webMethod).toContain("/v1/public/website-lagged-global-risk");
  expect(webMethod).toContain("readB2PublicRisk()");
  expect(webMethod).not.toContain("getAppSupabase()");
  expect(webMethod).not.toContain('.from("gri_snapshots")');
  expect(historical).toContain("WEBSITE_GRI_ONE_HOUR_VERIFIED_SNAPSHOT_UNAVAILABLE");
  expect(websiteFn).toContain('createServerFn({method:"GET"})');
  expect(websiteFn).toContain("readWebsiteLaggedGlobalRisk");
  // Risk Indices has founder-approved separate GeoMacro-issued news-severity
  // methodology, not a republishing of frozen combined GRI v1.2. The
  // historical Global Risk embargo remains enforced above unchanged.
  expect(index).toContain("readGeoMacroCertifiedNewsRisk()");
  expect(index).toContain("geomacro-certified-news-severity-gri");
  expect(index).not.toContain('const response=riskIndicesFromGlobalRisk(lagged.data)');
  expect(index).not.toContain("WEBSITE_RISK_INDICES_60MIN_PROOF_HOLD");
  expect(machine).toContain("readB2PublicRisk()");
  expect(machine).not.toContain("websitePublicCutoff");
  expect(machine).not.toContain("WEBSITE_RELEASE_DELAY_MS");
 });
 it("hides fresh Intelligence rows both in server-side SEO hydration and browser refresh",()=>{
  const seo=readFileSync("src/lib/public-intelligence-seo.functions.ts","utf8");
  const website=readFileSync("src/lib/use-intelligence.ts","utf8");
  const machine=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
  expect(seo).toContain("websiteLaggedEvidenceRows(await readPublicIntelligenceRowsFromB2())");
  expect(website).toContain("mapPublicRows(websiteLaggedEvidenceRows(rows, now))");
  expect(website).toContain("build(mapPublicRows(rows), now)");
  expect(website).toContain("mapPublicRows(websiteLaggedEvidenceRows(rows, now))");
  expect(machine).not.toContain("websiteLaggedEvidenceRows");
  expect(machine).not.toContain("WEBSITE_RELEASE_DELAY_MS");
  expect(machine).toContain("source_identity_delivered: false");
 });
});
