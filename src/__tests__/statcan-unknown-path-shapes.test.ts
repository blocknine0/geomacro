import {describe,expect,it} from "vitest";
import {EXPANDED_OFFICIAL_SOURCES,probeExpandedSource} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
const source=EXPANDED_OFFICIAL_SOURCES.find(x=>x.id==="statcan_prices_original_atom_review");
const mk=(url)=>'<entry><title>Official release</title><updated>2026-10-11T14:00:00Z</updated><link rel="alternate" href="'+url+'"/></entry>';
describe("StatCan unknown first-party Atom paths remain observation only",()=>{
 it("reports unknown URL structure numerically without allowing arbitrary original links",async()=>{
  const body="<feed>"+[
   "https://www150.statcan.gc.ca/n1/en/article/abc.html",
   "https://www150.statcan.gc.ca/en/releases/abc",
   "https://www150.statcan.gc.ca/n1/other/abc.xml",
   "https://www150.statcan.gc.ca/?p=123",
  ].map(mk).join("")+"</feed>";
  const r=await probeExpandedSource(source,{now:new Date("2026-10-11T18:00:00Z"),openDiscovery:true,
    fetchImpl:async()=>new Response(body,{status:200,headers:{"content-type":"application/atom+xml"}})});
  expect(r.undated_atom_link_diagnostic.rejected_original_path).toBe(4);
  expect(r.undated_atom_link_diagnostic.statcan_other_path_shapes).toEqual({
   ROOT:1,N1_OTHER:2,NON_N1:1,SUFFIX_HTML:1,SUFFIX_XML:1,SUFFIX_OTHER:2,QUERY_PRESENT:1,
  });
  expect(r.undated_atom_article_link_candidates).toBe(0);
  expect(r.private_original_article_candidates??[]).toHaveLength(0);
  expect(JSON.stringify(r.undated_atom_link_diagnostic)).not.toContain("https");
  expect(r.commercial_eligible).toBe(false);
 });
});