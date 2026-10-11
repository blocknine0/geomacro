import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {
  deduplicateOnDemandOriginalHeadlines,
  type PrivateOriginalCandidate,
} from "./on-demand-global-discovery.server";
import {readFileSync} from "node:fs";

function candidate(
  domain:PrivateOriginalCandidate["domain"],
  family:string,title:string,
  hour="2026-10-11T07:00:00.000Z",
):PrivateOriginalCandidate {
  const url="https://www.gov.uk/government/news/"+family;
  return {
    domain,publisher_family:family,article_url:url,article_title:title,
    feed_item_published_at:hour,
    article_identity_sha256:createHash("sha256")
      .update(family+"|"+url).digest("hex"),
    first_party_article_url_verified:true,
    source_native_feed_publication_date_verified:true,
    publisher_article_page_date_verified:false,
    independent_same_event_verified:false,
    derived_commercial_rights_verified:false,
    score_verified:false,signed_gro_verified:false,
    paid_delivery_allowed:false,
  };
}
describe("bounded private original headline de-duplication",()=>{
  it("collapses exact near-time repeated China lithium headline across issuers but never claims corroboration",()=>{
    const one=candidate("rare_earth","uk_dbt","Chinese lithium supply restrictions");
    const two=candidate("rare_earth","australian_industry","CHINESE  lithium supply restrictions",
      "2026-10-11T07:08:00.000Z");
    const r=deduplicateOnDemandOriginalHeadlines([one,two]);
    expect(r.unique_candidates).toEqual([one]);
    expect(r.duplicate_headlines_removed).toBe(1);
    expect(r.unique_candidates[0].independent_same_event_verified).toBe(false);
    expect(r.unique_candidates[0].derived_commercial_rights_verified).toBe(false);
    expect(r.unique_candidates[0].signed_gro_verified).toBe(false);
    expect(r.unique_candidates[0].paid_delivery_allowed).toBe(false);
  });
  it("keeps distinct risk categories, different headlines and separate publication windows",()=>{
    const same=candidate("rare_earth","uk_dbt","Chinese lithium supply restrictions");
    const differentTitle=candidate("rare_earth","australian_industry","Chinese lithium import permit update");
    const diffDomain=candidate("geopolitics","un_news","Chinese lithium supply restrictions");
    const diffTime=candidate("rare_earth","new_issuer","Chinese lithium supply restrictions",
      "2026-10-11T08:45:00.000Z");
    const r=deduplicateOnDemandOriginalHeadlines([same,differentTitle,diffDomain,diffTime]);
    expect(r.unique_candidates).toHaveLength(4);
    expect(r.duplicate_headlines_removed).toBe(0);
  });
  it("never treats changes in the underlying claim as duplicates",()=>{
    const a=candidate("rare_earth","uk_dbt","China lithium exports increase 12 percent");
    const b=candidate("rare_earth","australian_industry","China lithium exports decrease 12 percent");
    const c=candidate("rare_earth","other_issuer","China lithium exports increase 15 percent");
    const r=deduplicateOnDemandOriginalHeadlines([a,b,c]);
    expect(r.unique_candidates).toHaveLength(3);
  });
  it("drops spoofed verification flags, invalid original date and invalid fingerprint",()=>{
    const a=candidate("rare_earth","uk_dbt","Chinese lithium supply restrictions");
    for(const altered of [
      {...a,paid_delivery_allowed:true as false},
      {...a,signed_gro_verified:true as false},
      {...a,first_party_article_url_verified:false as true},
      {...a,source_native_feed_publication_date_verified:false as true},
      {...a,article_identity_sha256:"x"},
      {...a,feed_item_published_at:"not-a-date"},
    ]){
      const result=deduplicateOnDemandOriginalHeadlines([altered]);
      expect(result.unique_candidates).toEqual([]);
      expect(result.duplicate_headlines_removed).toBe(0);
    }
  });
  it("rejects oversized private evidence lists before grouping",()=>{
    expect(()=>deduplicateOnDemandOriginalHeadlines(
      Array.from({length:17},()=>candidate("macro","issuer","Annual inflation rate update")),
    )).toThrow("ON_DEMAND_PRIVATE_CANDIDATE_BUDGET_INVALID");
  });
  it("only safe counts reach HTTP 422 and read-only real-source proof",()=>{
    const handler=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const ops=readFileSync("scripts/ops/verify-live-on-demand-real-apis.ts","utf8");
    expect(handler).toContain("duplicatePrivateOriginalHeadlines=privateResult.duplicate_original_headline_count");
    expect(handler).toContain("duplicate_original_headlines_suppressed:duplicatePrivateOriginalHeadlines");
    expect(ops).toContain("duplicate_original_headlines_suppressed:privateEvidence.duplicate_original_headline_count");
    expect(handler).not.toContain("article_title:privateResult");
    expect(handler).not.toContain("article_url:privateResult");
  });
});
