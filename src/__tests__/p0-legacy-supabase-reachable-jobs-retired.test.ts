import { describe,expect,it } from "vitest";
import {readFileSync} from "node:fs";

const jobs = {
  "gdelt-v2-event-sync.yml":["sync"],
  "gdelt-gal-live-sync.yml":["sync"],
  "eurostat-sovereign-fiscal-promotion.yml":["production-promotion"],
  "ppg-production-promotion-census.yml":["promote-and-census"],
  "qpsd-production-promotion-census.yml":["promote-and-census"],
  "production-intelligence-readiness.yml":["country-census","hot-topic-readiness"],
  "gri-realtime-direct-postgres.yml":["refresh-three-domain-gri"],
  "apply-production-migrations.yml":["migrate"],
  "intelligence-current-scoring-fastlane.yml":["recover-current-scoring"],
  "intelligence-current-scoring-all-domains.yml":["score-current-all-domains"],
  "auto-ingest-news.yml":["recover-news-ingest"],
  "b2-country-gro-continuity.yml":["publish"],
} as const;
const read=(p:string)=>readFileSync(p,"utf8");
describe("P0 Supabase free legacy job retirement",()=>{
  for(const [file,names] of Object.entries(jobs)){
    it(file+" permanently disables all reachable former Postgres jobs",()=>{
      const flow=read(".github/workflows/"+file);
      for(const name of names){
        const start=flow.indexOf("  "+name+":\n");
        expect(start).toBeGreaterThan(-1);
        const tail=flow.slice(start+name.length+4);
        const lines=tail.split("\n").filter(s=>s.trim()!=="");
        const ifLine=lines.find(x=>/^    if:/.test(x));
        expect(ifLine).toBe("    if: ${{ false }}");
        expect(flow.slice(start,start+300)).toContain("if: ${{ false }}");
      }
    });
  }
  it("keeps original-source three-domain monitoring and signed canonical current publishers available",()=>{
    const pub=read(".github/workflows/three-domain-30m-original-publisher-pulse.yml");
    const gri=read(".github/workflows/gri-v12-supabase-free-reviewed-current.yml");
    const risk=read(".github/workflows/risk-indices-verified-d1-parent.yml");
    const b2=read(".github/workflows/b2-country-gro-continuity.yml");
    const usgs=read(".github/workflows/usgs-earthquake-hazards-sync.yml");
    const euro=read(".github/workflows/eurostat-government-debt-sync.yml");
    const ppg=read(".github/workflows/world-bank-ppg-global-shadow-census.yml");
    expect(pub).toContain("schedule:");
    expect(gri).toContain("publish-supabase-free-global-risk.mjs --verified-current");
    expect(risk).toContain("publish-risk-indices-from-verified-global-risk.mjs --verified-d1-parent-only");
    expect(b2).toContain("  observe-existing-d1-hot:");
    expect(b2).toContain("Read D1 hot GRO rows");
    expect(usgs).toContain("  dry-run:");
    expect(euro).toContain("  dry-run:");
    expect(ppg).toContain("world-bank-ppg-supabase-free-source-census.mjs");
  });
  it("does not modify locked pricing or commerce security contracts",()=>{
    const pricing=read("src/lib/capability-pricing-catalog.ts");
    const ledger=read("src/lib/mainnet-intelligence-endpoint.server.ts");
    expect(pricing).toContain("intelligence_query");
    expect(ledger).toContain("published_only");
    const binding=read("src/lib/verified-capability-coinbase-binding.server.ts");
    expect(binding).toContain("resolveVerifiedPublishedPlanPrice");
  });
});
