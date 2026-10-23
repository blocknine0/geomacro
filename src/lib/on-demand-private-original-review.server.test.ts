import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  deduplicateOnDemandOriginalHeadlines,
  verifyOnDemandOriginalArticlePages,
  type PrivateOriginalCandidate,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T12:00:00Z");
const date="2026-10-11T07:00:00.000Z";
function original(
  family:string,domain:PrivateOriginalCandidate["domain"],
  article_url:string,article_title:string,
  at=date,
):PrivateOriginalCandidate{
  return {
    publisher_family:family,domain,article_url,article_title,
    feed_item_published_at:at,
    article_identity_sha256:createHash("sha256")
      .update(family+"|"+article_url).digest("hex"),
    first_party_article_url_verified:true,
    source_native_feed_publication_date_verified:true,
    publisher_article_page_date_verified:false,
    independent_same_event_verified:false,
    derived_commercial_rights_verified:false,
    score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
  };
}
const u=original("uk_dbt_original_publisher","rare_earth",
  "https://www.gov.uk/government/news/chinese-lithium-export-policy",
  "Chinese lithium supply policy announcement");
const a=original("australian_industry_original_publisher","rare_earth",
  "https://www.minister.industry.gov.au/t-ayres/media/releases/lithium-export-policy",
  "CHINESE   lithium supply policy announcement",
  "2026-10-11T07:07:00.000Z");

describe("private originals survive presentation headline dedup",()=>{
  it("shows one possible story but retains two original, distinct publishers for *future* review",async()=>{
    const proof=deduplicateOnDemandOriginalHeadlines([u,a]);
    expect(proof.duplicate_headlines_removed).toBe(1);
    expect(proof.unique_candidates).toEqual([u]);
    expect(proof.original_review_candidates).toEqual([u,a]);
    const visited:string[]=[];
    const fetchImpl=vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{
      visited.push(String(url));
      expect(options?.redirect).toBe("manual");
      expect(options?.method).toBe("GET");
      return new Response(
        '<html><head><meta property="article:published_time" content="2026-10-11T07:00:00Z"></head></html>',
        {status:200,headers:{"content-type":"text/html"}},
      );
    }) as unknown as typeof fetch;
    const pages=await verifyOnDemandOriginalArticlePages(
      proof.original_review_candidates,{fetchImpl,now});
    expect(pages.attempted).toBe(2);
    expect(pages.verified).toBe(2);
    expect(visited).toHaveLength(2);
    expect(new Set(pages.verified_candidates.map(x=>x.publisher_family)).size).toBe(2);
    expect(pages.verified_candidates.every(x=>
      x.publisher_article_page_date_verified &&
      !x.independent_same_event_verified &&
      !x.derived_commercial_rights_verified &&
      !x.score_verified && !x.signed_gro_verified &&
      !x.paid_delivery_allowed)).toBe(true);
  });

  it("never treats a duplicate publisher copy as a second independent source",()=>{
    const second={...u,
      article_url:"https://www.gov.uk/government/news/chinese-lithium-alt",
      article_identity_sha256:createHash("sha256").update(
        "uk_dbt_original_publisher|https://www.gov.uk/government/news/chinese-lithium-alt",
      ).digest("hex"),
    };
    const grouped=deduplicateOnDemandOriginalHeadlines([u,second]);
    expect(grouped.duplicate_headlines_removed).toBe(1);
    expect(grouped.original_review_candidates).toHaveLength(2);
    // Existing publisher-page checker selects at most one original per family.
    expect(new Set(grouped.original_review_candidates.map(x=>x.publisher_family)).size).toBe(1);
  });

  it("rejects forged paid/source status without retaining invalid original review evidence",()=>{
    for(const forged of [
      {...a,signed_gro_verified:true as false},
      {...a,paid_delivery_allowed:true as false},
      {...a,article_identity_sha256:"00"},
      {...a,feed_item_published_at:"not-date"},
    ]){
      const result=deduplicateOnDemandOriginalHeadlines([forged]);
      expect(result.unique_candidates).toEqual([]);
      expect(result.original_review_candidates).toEqual([]);
      expect(result.duplicate_headlines_removed).toBe(0);
    }
  });

  it("never serializes private originals in public query or zero-funds proof",()=>{
    const endpoint=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const ops=readFileSync("scripts/ops/verify-live-on-demand-real-apis.ts","utf8");
    expect(endpoint).toContain("verifyOnDemandOriginalArticlePages(\n              privateResult.private_original_review_candidates,\n              {maxAgeSeconds:requestedNewsAgeSeconds})");
    expect(endpoint).toContain("articleDatesVerified===privateOriginalReviewCandidateCount");
    expect(ops).toContain("privateEvidence.private_original_review_candidates");
    expect(ops).toContain("pageProof.verified===privateEvidence.private_original_review_candidates.length");
    expect(endpoint).not.toContain("private_original_review_candidates:privateResult");
    expect(endpoint).not.toContain("private_candidates:privateResult");
    expect(ops).not.toContain("private_original_review_candidates:privateEvidence");
  });

  it("uses GOV.UK first-published-at on 128–384KiB query-time articles just like the 30m pulse",async()=>{
    const large='<html><head><meta name="govuk:first-published-at" '+
      'content="2026-10-11T07:00:00Z"></head><body>'+
      "Private first-party long article. ".repeat(6500)+"</body></html>";
    expect(Buffer.byteLength(large)).toBeGreaterThan(128*1024);
    expect(Buffer.byteLength(large)).toBeLessThan(384*1024);
    const fetchImpl=vi.fn(async(url:RequestInfo|URL)=>{
      expect(String(url)).toBe(u.article_url);
      return new Response(large,{
        headers:{"content-type":"text/html",
          "content-length":String(Buffer.byteLength(large))}
      });
    }) as unknown as typeof fetch;
    const verified=await verifyOnDemandOriginalArticlePages([u],{fetchImpl,now});
    expect(verified.verified).toBe(1);
    expect(verified.verified_candidates[0].page_original_published_at)
      .toBe("2026-10-11T07:00:00.000Z");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects conflicting publisher first-publication clocks, modified-only dates and day-only metadata",async()=>{
    // A missing/day-only HTML date now justifies ONE additional
    // same-issuer Content API check (within the existing 4-page budget).
    // The test's mock deliberately returns fake HTML instead of a genuine
    // first-party Content API JSON, so it must remain UNVERIFIED.
    // Conflicting precise or malformed clocks must not trigger rescue.
    for(const [html,expectedCalls] of [
      ['<html><meta name="govuk:first-published-at" content="2026-10-11T07:00:00Z">'+
        '<meta property="article:published_time" content="2026-10-11T08:30:00Z"></html>',1],
      ['<html><meta name="govuk:public-updated-at" content="2026-10-11T07:00:00Z"></html>',2],
      ['<html><meta property="article:published_time" content="2026-10-11"></html>',2],
      ['<html><meta name="govuk:first-published-at" content="2026-10-11T07:00:00"></html>',1],
    ] as const){
      const fetchImpl=vi.fn(async()=>new Response(html,{
        headers:{"content-type":"text/html"}
      })) as unknown as typeof fetch;
      const proof=await verifyOnDemandOriginalArticlePages([u],{fetchImpl,now});
      expect(proof.attempted).toBe(1);
      expect(proof.verified).toBe(0);
      expect(proof.verified_candidates).toHaveLength(0);
      expect(fetchImpl).toHaveBeenCalledTimes(expectedCalls);
    }
  });

  it("rejects an HTTP 200 pretending to be HTML when original page MIME is not HTML",async()=>{
    const fetchImpl=vi.fn(async()=>new Response(
      '<meta name="govuk:first-published-at" content="2026-10-11T07:00:00Z">',
      {headers:{"content-type":"application/json"}}
    )) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages([u],{fetchImpl,now});
    expect(proof.attempted).toBe(1);
    expect(proof.verified).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses first-party article bodies above 384KiB without signing/rights/payment",async()=>{
    const oversized= '<html><meta name="govuk:first-published-at" '+
      'content="2026-10-11T07:00:00Z"></html>'+'X'.repeat(385*1024);
    const fetchImpl=vi.fn(async()=>new Response(oversized,{
      headers:{"content-type":"text/html"}
    })) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages([u],{fetchImpl,now});
    expect(proof.attempted).toBe(1);
    expect(proof.verified).toBe(0);
    expect(proof.verified_candidates).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});