import {describe,it,expect,vi} from "vitest";
import {
  selectGkgFirstPartyReviewLeads,
  reviewGkgFirstPartyPublicationDates,
  probeGdeltGkgBulk,
} from "../../scripts/lib/gdelt-gkg-bulk-discovery.mjs";

const now=new Date("2026-10-12T12:00:00.000Z");
const batch_at="2026-10-12T11:45:00.000Z";
const stamp="20261012114500";
const urls={
 geopolitics:"https://www.gov.uk/government/news/china-regional-security-negotiations",
 macro:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261012a.htm",
 rare_earth:"https://www.gov.uk/government/news/china-critical-minerals-trade-policy",
};
const asRow=(source:string,themes:string,date=stamp)=>{
 const x=Array(27).fill("");
 x[0]="gkg-item";x[1]=date;x[3]="publisher.example";x[4]=source;
 x[7]=themes;
 return x.join("\t");
};
const sample=[
 asRow(urls.geopolitics,"ARMED_CONFLICT;MILITARY"),
 asRow(urls.macro,"MONETARY;CENTRAL_BANK"),
 asRow(urls.rare_earth,"CRITICAL_MINERAL;LITHIUM"),
 asRow(urls.geopolitics,"ARMED_CONFLICT"),
 asRow("https://untrusted.example.com/government/news/trade-policy","CRITICAL_MINERAL"),
 asRow("http://127.0.0.1/government/news/military-escalation","ARMED_CONFLICT"),
].join("\n")+"\n";

describe("GKG theme matching -> bounded genuine first-party page date review only",()=>{
 it("selects only original publisher allowlist hosts and article paths, deduplicates",()=>{
   const leads=selectGkgFirstPartyReviewLeads(sample,{batch_at,now});
   expect(leads).toEqual([
     {category:"geopolitics",url:urls.geopolitics},
     {category:"macro",url:urls.macro},
     {category:"rare_earth",url:urls.rare_earth},
   ]);
   expect(JSON.stringify(leads)).not.toContain("untrusted.example.com");
   expect(()=>selectGkgFirstPartyReviewLeads(sample,{
     batch_at:"2026-10-12T13:00:00.000Z",now,
   })).toThrow("GKG_PRIVATE_REVIEW_INPUT_INVALID");
 });
 it("reads exact official original clocks and NEVER upgrades events, data rights, GRO or x402",async()=>{
   const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
     expect(Object.values(urls)).toContain(url);
     expect(options.redirect).toBe("error");
     return new Response('<!doctype html><html><head><meta property="article:published_time" '+
       'content="2026-10-12T11:20:00Z"></head><body>First party release</body></html>',{
       headers:{"content-type":"text/html"}
     });
   });
   const result=await reviewGkgFirstPartyPublicationDates(sample,{batch_at,now,fetchImpl});
   expect(fetchImpl).toHaveBeenCalledTimes(3);
   expect(result.schema).toBe("geomacro.private-gkg-firstparty-original-review.v1");
   expect(result.state).toBe("FIRST_PARTY_PAGE_DATES_CHECKED_NOT_EVENT_VERIFIED");
   expect(result.bounded_page_request_count).toBe(3);
   expect(result.maximum_page_request_budget).toBe(6);
   expect(result.domains.map((x:any)=>x.publisher_original_24h_dates_verified))
     .toEqual([1,1,1]);
   expect(result.domains.every((x:any)=>!x.independent_same_event_verified &&
     !x.claim_and_country_verified && !x.commercial_rights_verified &&
     !x.signed_gro_generated && !x.chargeable)).toBe(true);
   expect(result.original_article_content_persisted).toBe(false);
   expect(result.original_urls_in_receipt).toBe(false);
   expect(result.source_identity_disclosed).toBe(false);
   expect(result.gkg_observation_time_used_as_publisher_time).toBe(false);
   expect(result.public_published).toBe(false);
   expect(result.supabase_requests+result.d1_writes+result.b2_requests+result.payments_performed)
     .toBe(0);
   const serialized=JSON.stringify(result);
   for(const url of Object.values(urls))expect(serialized).not.toContain(url);
   expect(serialized).not.toContain("First party release");
 });
 it("rejects updated-only and contradictory originals; no GKG batch-time shortcut",async()=>{
   let index=0;
   const pages=[
     '<html><meta name="govuk:public-updated-at" content="2026-10-12T11:30:00Z"></html>',
     '<html><meta property="article:published_time" content="2026-10-12T11:20:00Z">'+
       '<meta name="govuk:first-published-at" content="2026-10-12T10:30:00Z"></html>',
     '<html><meta name="datePublished" content="2026-10-10T11:00:00Z"></html>',
   ];
   const fetchImpl=vi.fn(async()=>new Response(pages[index++],{
     headers:{"content-type":"text/html"}
   }));
   const r=await reviewGkgFirstPartyPublicationDates(sample,{batch_at,now,fetchImpl});
   expect(fetchImpl).toHaveBeenCalledTimes(3);
   expect(r.domains.reduce((n:number,x:any)=>n+x.publisher_original_24h_dates_verified,0))
     .toBe(0);
   expect(r.independent_event_qualified).toBe(false);
   expect(r.chargeable).toBe(false);
 });
 it("requires current trustworthy GKG time, never fetches non-publisher URL",async()=>{
   const allUntrusted=[
     asRow("https://not-gov.example/get?u=https://www.gov.uk/government/news/china-critical-minerals-trade-policy",
       "CRITICAL_MINERAL"),
     asRow("https://www.gov.uk/government/news/valid-article?token=secret","ARMED_CONFLICT"),
     asRow("https://www.gov.uk/government/news/future-claim","ARMED_CONFLICT","20261012123000"),
   ].join("\n");
   const fetchImpl=vi.fn();
   const r=await reviewGkgFirstPartyPublicationDates(allUntrusted,{batch_at,now,
     fetchImpl});
   expect(r.state).toBe("NO_ALLOWLISTED_FIRST_PARTY_LEADS");
   expect(r.bounded_page_request_count).toBe(0);
   expect(fetchImpl).not.toHaveBeenCalled();
 });
});
