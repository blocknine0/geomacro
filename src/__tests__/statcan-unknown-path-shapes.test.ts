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
   ROOT:1,N1_OTHER:1,NON_N1:1,SUFFIX_HTML:0,SUFFIX_XML:1,SUFFIX_OTHER:2,QUERY_PRESENT:1,
  });
  expect(r.undated_atom_link_diagnostic.statcan_non_n1_publisher_hosts).toEqual({
   WWW150:2,WWW:0,
  });
  expect(r.undated_atom_link_diagnostic.statcan_non_n1_prefix_families).toEqual({
   EN_DAILY:0,EN_SUBJECTS_OR_CATALOGUE:0,EN_OTHER:1,
   ROOT_DAILY:0,ROOT_CATALOGUE:0,OTHER:1,
  });
  expect(r.undated_atom_article_link_candidates).toBe(0);
  expect(r.private_original_article_candidates??[]).toHaveLength(0);
  expect(JSON.stringify(r.undated_atom_link_diagnostic)).not.toContain("https");
  expect(r.commercial_eligible).toBe(false);
 });
 it("counts trusted same-host /en/ and root Daily article candidates without making them eligible",async()=>{
  const urls=[
   "https://www150.statcan.gc.ca/en/daily-quotidien/261009/item.html",
   "https://www.statcan.gc.ca/en/subjects/prices.html",
   "https://www150.statcan.gc.ca/daily-quotidien/261008/dq261008a.html",
   "https://www.statcan.gc.ca/en/releases/item.html",
   "https://www150.statcan.gc.ca/catalogue/prices.html",
   "https://evil.example/en/daily-quotidien/261009/item.html",
  ];
  const feed="<feed>"+urls.map(mk).join("")+"</feed>";
  const result=await probeExpandedSource(source,{
   now:new Date("2026-10-11T18:00:00Z"),openDiscovery:true,
   fetchImpl:async()=>new Response(feed,{
    status:200,headers:{"content-type":"application/atom+xml"},
   }),
  });
  const diag=result.undated_atom_link_diagnostic;
  expect(diag.rejected_original_path).toBe(5);
  expect(diag.rejected_publisher_host).toBe(1);
  expect(diag.statcan_non_n1_publisher_hosts).toEqual({WWW150:3,WWW:2});
  expect(diag.statcan_non_n1_prefix_families).toEqual({
   EN_DAILY:1,EN_SUBJECTS_OR_CATALOGUE:1,EN_OTHER:1,
   ROOT_DAILY:1,ROOT_CATALOGUE:1,OTHER:0,
  });
  expect(diag.valid_first_party_article_links).toBe(0);
  expect(result.undated_atom_article_link_candidates).toBe(0);
  expect(result.original_page_checked).toBe(0);
  expect(JSON.stringify(diag)).not.toContain("statcan.gc.ca");
  expect(JSON.stringify(diag)).not.toContain("evil.example");
  expect(result.commercial_eligible).toBe(false);
 });
});