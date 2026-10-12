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
  it("rotates both bounded slots and samples all pages without a permanently stale anchor",()=>{
    const observations=[slot0,slot1,slot2].map(now=>
      selectRotatingFirstPartyPages(urls,now,{rotate:true}));
    for(const group of observations){
      expect(group).toHaveLength(2);
      expect(new Set(group).size).toBe(2);
    }
    expect(new Set(observations.flat())).toEqual(new Set(urls));
    expect(observations[0]).toEqual(observations[2]);
    expect(observations[0]).not.toEqual(observations[1]);
    expect(selectRotatingFirstPartyPages(urls,slot0,{rotate:false}))
      .toEqual(urls.slice(0,2));
    expect(selectRotatingFirstPartyPages([urls[0]],slot0,{rotate:true}))
      .toEqual([urls[0]]);
    const five=[...urls,"https://www.gov.uk/government/news/foreign-secretary-extra"];
    const groups=Array.from({length:5},(_,i)=>selectRotatingFirstPartyPages(
      five,new Date(slot0.getTime()+i*30*60*1000),{rotate:true}));
    expect(new Set(groups.flat())).toEqual(new Set(five));
    expect(groups.every(x=>x.length===2&&x[0]!==x[1])).toBe(true);
  });
  it("recovers original publisher dates from rotating pages under exactly two article requests",async()=>{
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
      const checked=selectRotatingFirstPartyPages(urls,now,{rotate:true});
      const stale=checked.includes(urls[0])?1:0;
      const fresh=2-stale;
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetched).toEqual([src.url,...checked]);
      expect(observed.original_page_precise_date_checks).toBe(2);
      expect(observed.original_page_eligible_link_pool_count).toBe(4);
      expect(observed.original_page_rotation_applied).toBe(true);
      expect(observed.undated_atom_article_link_candidates).toBe(4);
      expect(observed.original_page_precise_date_24h).toBe(fresh);
      // Zero-count enum keys are intentionally absent from sanitized receipts.
      expect(observed.first_party_original_page_date_reason_codes
        .STALE_PUBLISHER_PUBLICATION??0).toBe(stale);
      expect(observed.first_party_original_page_date_reason_codes
        .PRECISE_PUBLICATION_ACCEPTED??0).toBe(fresh);
      expect(Object.values(observed.first_party_original_page_date_reason_codes)
        .reduce((n:number,x:any)=>n+x,0)).toBe(2);
      expect(observed.current_scored_intelligence_verified).toBe(false);
      expect(observed.commercial_eligible).toBe(false);
      expect(observed.private_original_article_candidates).toHaveLength(fresh);
      expect(observed.private_original_article_candidates.every(
        (x:{eligible_for_scoring:boolean})=>x.eligible_for_scoring===false
      )).toBe(true);
    }
    expect(new Set(pageHistory)).toEqual(new Set(urls));
    expect(pageHistory).toHaveLength(6);
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