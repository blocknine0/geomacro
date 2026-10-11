import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
  selectRotatingFirstPartyPages,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const slot0=new Date("2026-10-11T12:00:00.000Z");
const slot1=new Date(slot0.getTime()+30*60*1000);
const slot2=new Date(slot0.getTime()+60*60*1000);
const src=EXPANDED_OFFICIAL_SOURCES.find(
  (s:{id:string})=>s.id==="uk_fcdo_original_foreign_policy_atom_review")!;
const urls=[
  "https://www.gov.uk/government/news/foreign-secretary-publisher-article-one",
  "https://www.gov.uk/government/news/foreign-secretary-publisher-article-two",
  "https://www.gov.uk/government/news/foreign-secretary-publisher-article-three",
  "https://www.gov.uk/government/news/foreign-secretary-publisher-article-four",
];
const feed='<feed>'+urls.map((u,i)=>'<entry><title>Foreign secretary official update '+i+
  '</title><updated>2026-10-11T11:45:00Z</updated>'+
  '<link rel="alternate" href="'+u+'"/></entry>').join("")+'</feed>';
const xml=new Response(feed,{headers:{"content-type":"application/atom+xml"}});
const htmlFor=(url:string)=>
  '<html><head><meta name="govuk:first-published-at" content="'+
  (url===urls[0]?"2026-09-28T10:00:00Z":"2026-10-11T11:45:00Z")+
  '"></head></html>';

describe("#2041 bounded rotating original-publisher page verification",()=>{
  it("always anchors the first valid original and eventually samples every additional eligible page",()=>{
    const results=[slot0,slot1,slot2].map(now=>
      selectRotatingFirstPartyPages(urls,now,{rotate:true}));
    for(const group of results) {
      expect(group).toHaveLength(2);
      expect(group[0]).toBe(urls[0]);
      expect(group[1]).not.toBe(urls[0]);
    }
    expect(new Set(results.map(r=>r[1]))).toEqual(new Set(urls.slice(1)));
    expect(selectRotatingFirstPartyPages(urls,slot0,{rotate:false}))
      .toEqual(urls.slice(0,2));
    expect(selectRotatingFirstPartyPages([urls[0]],slot0,{rotate:true}))
      .toEqual([urls[0]]);
  });
  it("recovers separate publisher page publication clocks across polls without trusting Atom updated or exceeding two page GETs",async()=>{
    const pageHistory:string[]=[];
    for(const now of [slot0,slot1,slot2]){
      const fetched:string[]=[];
      const fetchImpl=vi.fn(async (url:string)=>{
        fetched.push(url);
        if(url===src.url)return new Response(feed,{
          headers:{"content-type":"application/atom+xml"}});
        pageHistory.push(url);
        return new Response(htmlFor(url),{
          headers:{"content-type":"text/html"}});
      });
      const observed=await probeExpandedSource(src,{
        now,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetched[0]).toBe(src.url);
      expect(fetched[1]).toBe(urls[0]);
      expect(observed.original_page_precise_date_checks).toBe(2);
      expect(observed.original_page_eligible_link_pool_count).toBe(4);
      expect(observed.original_page_rotation_applied).toBe(true);
      expect(observed.undated_atom_article_link_candidates).toBe(4);
      expect(observed.original_page_precise_date_24h).toBe(1);
      expect(observed.first_party_original_page_date_reason_codes).toMatchObject({
        STALE_PUBLISHER_PUBLICATION:1,PRECISE_PUBLICATION_ACCEPTED:1,
      });
      expect(Object.values(observed.first_party_original_page_date_reason_codes)
        .reduce((n:number,x:any)=>n+x,0)).toBe(2);
      expect(observed.current_scored_intelligence_verified).toBe(false);
      expect(observed.commercial_eligible).toBe(false);
      expect(observed.private_original_article_candidates).toHaveLength(1);
      expect(observed.private_original_article_candidates[0].eligible_for_scoring)
        .toBe(false);
    }
    expect(pageHistory.filter(url=>url===urls[0])).toHaveLength(3);
    expect(new Set(pageHistory.filter(url=>url!==urls[0])))
      .toEqual(new Set(urls.slice(1)));
  });
  it("rejects invalid clocks, unbounded lists and untyped link candidates",()=>{
    expect(()=>selectRotatingFirstPartyPages(urls,new Date(NaN),{rotate:true}))
      .toThrow("ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID");
    expect(()=>selectRotatingFirstPartyPages(Array(81).fill(urls[0]),slot0,{
      rotate:true,
    })).toThrow("ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID");
    expect(()=>selectRotatingFirstPartyPages([urls[0],null] as any,slot0,{
      rotate:true,
    })).toThrow("ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID");
    expect(selectRotatingFirstPartyPages([urls[0],urls[0],urls[1]],slot0,{
      rotate:true,
    })).toEqual([urls[0],urls[1]]);
  });
});