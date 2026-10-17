import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {originalPublisherPrivateCandidates} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {parseOfficialNativeRss} from "../../scripts/lib/official-native-rss.mjs";
import {parseOfficialThirdRss} from "../../scripts/lib/official-native-third-fallback.mjs";
import {privateOriginalMatchesPulse} from "../../scripts/lib/private-novel-pulse-match.mjs";

const now=new Date("2026-10-14T16:40:00.000Z");
const SHA=value=>createHash("sha256").update(value).digest("hex");
const getSource=id=>{
 const source=EXPANDED_OFFICIAL_SOURCES.find(s=>s.id===id);
 if(!source)throw Error("SOURCE_FIXTURE_MISSING");
 return source;
};
const unId="1199001";
const canon="https://news.un.org/en/story/2026/10/"+unId;
const router="https://news.un.org/feed/view/en/story/2026/10/"+unId;
const unItem=(link=router,guid=canon,permalink="true")=>
 '<item><title>UN Security Council announces international ceasefire talks</title>'+
 '<pubDate>Wed, 14 Oct 2026 12:00:00 GMT</pubDate>'+
 '<link>'+link+'</link>'+
 '<guid isPermaLink="'+permalink+'">'+guid+'</guid></item>';
const unRss=item=>'<rss version="2.0"><channel>'+item+'</channel></rss>';
const ecbCanon="https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261014.en.html";
const ecbDouble="https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.mp261014.en.html";
const ecbRss=link=>
 '<rss version="2.0"><channel><item>'+
 '<title>ECB press announcement on euro area inflation and monetary conditions</title>'+
 '<pubDate>Wed, 14 Oct 2026 00:00:00 GMT</pubDate>'+
 '<link>'+link+'</link></item></channel></rss>';
function assertUnlicensedD1Matched(article,candidate){
 expect(article.url).toBeDefined();
 expect(article.publishedAt).toBe(candidate.native_published_at);
 expect(SHA(article.url)).toBe(candidate.original_article_sha256);
 expect(article.privateOnly).toBe(true);
 expect(article.nativePublishedAtVerified).toBe(true);
 expect(article.rightsVerified).toBe(false);
 expect(article.commercialEligible).toBe(false);
 expect(candidate.eligible_for_scoring).toBe(false);
 expect(candidate.eligible_for_publication).toBe(false);
 expect(privateOriginalMatchesPulse(article,new Set([candidate.original_article_sha256]),
   now.getTime(),new Map([[candidate.original_article_sha256,candidate.native_published_at]])))
   .toBe(true);
}
describe("#2229 source pulse → canonical private classifier exact original URL SHA binding",()=>{
 it("UN News /feed/view link with same-ID first-party permalink GUID has identical D1 and scorer original",()=>{
  const xml=unRss(unItem());
  const pulse=originalPublisherPrivateCandidates(xml,getSource("un_news_security_original_rss_review"),
    now,{captureAllTopics:true});
  const scorer=parseOfficialNativeRss(xml,"geopolitics",now,86400000,null,true);
  expect(pulse).toHaveLength(1);
  expect(scorer).toHaveLength(1);
  expect(scorer[0].url).toBe(canon);
  assertUnlicensedD1Matched(scorer[0],pulse[0]);
 });
 it("UN News wrong GUID, off-host GUID or non-permalink feed router never enters scorer",()=>{
  const failures=[
   unItem(router,"https://news.un.org/en/story/2026/10/1199002"),
   unItem(router,canon,"false"),
   unItem(router,"https://evil.example/en/story/2026/10/1199001"),
   unItem("https://news.un.org/feed/view/en/story/2026/10/1199001?redirect=1"),
  ];
  for(const item of failures){
   const xml=unRss(item);
   expect(originalPublisherPrivateCandidates(xml,getSource("un_news_security_original_rss_review"),
    now,{captureAllTopics:true})).toHaveLength(0);
   expect(parseOfficialNativeRss(xml,"geopolitics",now,86400000,null,true)).toHaveLength(0);
  }
 });
 it("ECB RSS double separator resolves only reviewed original press permalink and matches D1 SHA + timestamp",()=>{
  const xml=ecbRss(ecbDouble);
  const pulse=originalPublisherPrivateCandidates(xml,getSource("ecb_press_original_rss_review"),
    now,{captureAllTopics:true});
  const scorer=parseOfficialThirdRss(xml,"macro",{now,broadPrivateIntake:true});
  expect(pulse).toHaveLength(1);
  expect(scorer).toHaveLength(1);
  expect(scorer[0].url).toBe(ecbCanon);
  assertUnlicensedD1Matched(scorer[0],pulse[0]);
 });
 it("ECB unknown source path, forged host, mismatched timestamp and 25h old release never match D1",()=>{
  const wrong=[
   "https://www.ecb.europa.eu//press/pr/date/2026/html/not-an-original",
   "https://evil.example//press/pr/date/2026/html/ecb.mp261014.en.html",
  ];
  for(const u of wrong){
   const xml=ecbRss(u);
   expect(originalPublisherPrivateCandidates(xml,getSource("ecb_press_original_rss_review"),
    now,{captureAllTopics:true})).toHaveLength(0);
   // May remain an untrusted same-host discovery hint, but not the D1 identity.
   const scorer=parseOfficialThirdRss(xml,"macro",{now,broadPrivateIntake:true});
   expect(scorer.some(a=>privateOriginalMatchesPulse(a,new Set([SHA(ecbCanon)]),
    now.getTime(),new Map([[SHA(ecbCanon),"2026-10-14T00:00:00.000Z"]])))).toBe(false);
  }
  const valid=parseOfficialThirdRss(ecbRss(ecbDouble),"macro",{now,broadPrivateIntake:true});
  expect(valid).toHaveLength(1);
  expect(privateOriginalMatchesPulse(valid[0],new Set([SHA(ecbCanon)]),
    now.getTime(),new Map([[SHA(ecbCanon),"2026-10-14T00:00:01.000Z"]]))).toBe(false);
  const old=ecbRss(ecbDouble).replace("Wed, 14 Oct 2026 00:00:00 GMT","Mon, 12 Oct 2026 00:00:00 GMT");
  expect(parseOfficialThirdRss(old,"macro",{now,broadPrivateIntake:true})).toHaveLength(0);
 });
});
