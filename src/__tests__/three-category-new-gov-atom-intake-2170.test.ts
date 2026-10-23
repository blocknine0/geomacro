import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {THIRTY_MIN_PUBLISHER_PAIRS,select30MinPublishers}
  from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
const NOW=new Date("2026-10-10T07:00:00.000Z");
const SOURCES=[
  {id:"uk_mod_original_defence_atom_review",domain:"geopolitics",
    topic:"Military deployment and NATO defence border security",
    endpoint:"https://www.gov.uk/government/organisations/ministry-of-defence.atom"},
  {id:"uk_hmt_original_treasury_atom_review",domain:"macro",
    topic:"Inflation, fiscal budget and financial stability",
    endpoint:"https://www.gov.uk/government/organisations/hm-treasury.atom"},
  {id:"uk_desnz_original_energy_minerals_atom_review",domain:"rare_earth",
    topic:"Critical minerals and rare earth battery supply chain",
    endpoint:"https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom"},
] as const;
const article=(title:string,link:string,when="2026-10-10T06:35:00Z")=>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>${title}</title>
    <published>${when}</published><updated>2026-10-10T06:59:00Z</updated>
    <link rel="alternate" href="${link}" /></entry></feed>`;
const res=(text:string)=>new Response(text,{
  status:200,headers:{"content-type":"application/atom+xml"}});
describe("#2170 activating three first-party GOV departmental original feeds",()=>{
  for(const item of SOURCES){
    it(`${item.domain}: actually parses a first-party original article native publication clock`,async()=>{
      const source=EXPANDED_OFFICIAL_SOURCES.find(s=>s.id===item.id)!;
      expect(source).toBeDefined();
      expect(source.url).toBe(item.endpoint);
      expect(source.media).toBe("atom");
      expect(source.domain).toBe(item.domain);
      expect(source.rights).toBe("UNVERIFIED");
      expect(source.event_intelligence).toBe(false);
      const fetchImpl=vi.fn(async(url:string,opts:RequestInit)=>{
        expect(url).toBe(item.endpoint);
        expect(opts.redirect).toBe("error");
        return res(article(item.topic,
          "https://www.gov.uk/government/news/example-first-party-announcement"));
      });
      const result=await probeExpandedSource(source,{now:NOW,fetchImpl});
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.publisher_reachable).toBe(true);
      expect(result.format_valid).toBe(true);
      expect(result.source_native_24h_release_items).toBe(1);
      expect(result.topical_private_release_links_24h).toBe(1);
      expect(result.original_publisher_topical_90m).toBe(1);
      expect(result.current_scored_intelligence_verified).toBe(false);
      expect(result.commercial_rights_verified).toBe(false);
      expect(result.commercial_eligible).toBe(false);
      expect(JSON.stringify(result)).not.toContain("example-first-party-announcement");
      const updatedOnly=article(item.topic,
        "https://www.gov.uk/government/news/old-article");
      const noNative=updatedOnly.replace(/<published>[^<]+<\/published>/u,"");
      const stale=await probeExpandedSource(source,{
        now:NOW,fetchImpl:async()=>res(noNative)});
      expect(stale.topical_private_release_links_24h).toBe(0);
      const spoof=await probeExpandedSource(source,{
        now:NOW,fetchImpl:async()=>res(article(item.topic,
          "https://www.gov.uk.evil.example/government/news/forged-article"))});
      expect(spoof.topical_private_release_links_24h).toBe(0);
      expect(spoof.commercial_eligible).toBe(false);
    });
  }
  it("cycles five independent publishers per category at two GETs per half-hour",()=>{
    const count={geopolitics:4,macro:5,rare_earth:5};
    for(const [domain,n] of Object.entries(count)){
      const list=THIRTY_MIN_PUBLISHER_PAIRS[domain];
      expect(list).toHaveLength(n);
      const seen=new Set<string>();
      for(let slot=0;slot<n;slot++){
        const pair=select30MinPublishers(new Date(NOW.getTime()+slot*1800000))[domain];
        expect(pair).toHaveLength(2);
        for(const original of pair)seen.add(original.id);
      }
      expect(seen).toEqual(new Set(list));
    }
    const signer=readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
    expect(signer).toContain("approvedIndependentReviewerFromEnv()");
  });
});
