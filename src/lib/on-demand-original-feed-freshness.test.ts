import {describe,expect,it} from "vitest";
import {freshestPrivateOriginalFeedCandidates}
 from "./on-demand-global-discovery.server";
import type {PrivateOriginalCandidate,OnDemandCategory}
 from "./on-demand-global-discovery.server";

const candidate=(category:OnDemandCategory,index:number,date:string|null):
 PrivateOriginalCandidate=>({
 domain:category,publisher_family:"synthetic_first_party_test_issuer",
 article_url:`https://publisher.example.org/original/${category}/${index}`,
 article_title:`An official ${category} native publication ${index}`,
 feed_item_published_at:date,
 ...(date===null?{undated_atom_original_page_pending:true as const}:{}),
 article_identity_sha256:index.toString(16).padStart(64,"0"),
 first_party_article_url_verified:true,
 source_native_feed_publication_date_verified:date!==null,
 publisher_article_page_date_verified:false,independent_same_event_verified:false,
 derived_commercial_rights_verified:false,score_verified:false,
 signed_gro_verified:false,paid_delivery_allowed:false,
});
describe("freshest original first-party feed selection",()=>{
 it.each(["geopolitics","macro","rare_earth"] as const)(
  "%s prefers four ACTUAL newest native published items in an unsorted issuer feed",
  category=>{
   const input=[
    candidate(category,1,"2026-10-23T15:00:00.000Z"),
    candidate(category,2,"2026-10-24T11:00:00.000Z"),
    candidate(category,3,"2026-10-24T08:00:00.000Z"),
    candidate(category,4,"2026-10-23T20:00:00.000Z"),
    candidate(category,5,"2026-10-24T10:00:00.000Z"),
    candidate(category,6,null),
   ];
   const picked=freshestPrivateOriginalFeedCandidates(input);
   expect(picked.map(x=>x.article_identity_sha256))
    .toEqual([2,5,3,4].map(i=>i.toString(16).padStart(64,"0")));
   expect(picked).toHaveLength(4);
   expect(input.map(x=>x.article_identity_sha256).slice(0,4))
    .not.toEqual(picked.map(x=>x.article_identity_sha256));
   expect(picked.every(x=>x.paid_delivery_allowed===false &&
     x.publisher_article_page_date_verified===false &&
     x.derived_commercial_rights_verified===false &&
     x.independent_same_event_verified===false)).toBe(true);
  }
 );
 it("keeps undated first-party Atom entries review-only without inventing a source time",()=>{
  const input=[
   candidate("rare_earth",1,null),
   candidate("rare_earth",2,"2026-10-24T09:00:00.000Z"),
   candidate("rare_earth",3,null),
  ];
  const selected=freshestPrivateOriginalFeedCandidates(input);
  expect(selected.map(x=>x.article_identity_sha256)).toEqual([2,1,3].map(
   i=>i.toString(16).padStart(64,"0")));
  expect(selected.slice(1).every(x=>x.feed_item_published_at===null &&
   x.source_native_feed_publication_date_verified===false)).toBe(true);
 });
 it("never expands per-publisher quota or mutates the input",()=>{
  const inFeed=Array.from({length:80},(_,i)=>candidate("geopolitics",i+1,
   new Date(Date.parse("2026-10-24T10:00:00.000Z")-i*60_000).toISOString()));
  const snapshot=JSON.stringify(inFeed);
  expect(freshestPrivateOriginalFeedCandidates(inFeed).length).toBe(4);
  expect(JSON.stringify(inFeed)).toBe(snapshot);
  expect(()=>freshestPrivateOriginalFeedCandidates([...inFeed,inFeed[0]])).toThrow();
  expect(()=>freshestPrivateOriginalFeedCandidates([],5)).toThrow();
  expect(()=>freshestPrivateOriginalFeedCandidates([],0)).toThrow();
 });
});
