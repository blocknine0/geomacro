import test from "node:test";
import assert from "node:assert/strict";
import {unverifiedWebsiteSignalFromOsint} from "./private-osint-website-bridge.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const titles={
 geopolitics:"United Nations leaders announce new sanctions and security measures",
 macro:"Central bank reports monetary policy and inflation developments",
 rare_earth:"Government announces new critical mineral mining supply strategy",
};
test("all three unverified OSINT source feed cards pass the production website journal and remain unscored",()=>{
 for(const [category,title] of Object.entries(titles)){
  const signal=unverifiedWebsiteSignalFromOsint({
   news_id:"news-"+"b".repeat(64),category,title,published_at:"2026-10-25T11:40:00.000Z",
   source_url:"https://news.google.com/rss/search?q=official",article_url:null,
  },now);
  assert.ok(signal,category);
  assert.equal(verifyDerivedStory(signal,now),true,category);
  assert.equal(verifyDerivedStory({...signal,severity:44},now),false);
  assert.equal(verifyDerivedStory({...signal,status:"official_release_observed_unscored"},now),false);
  assert.equal(verifyDerivedStory({...signal,sources_credited:["United Nations"]},now),false);
  assert.equal(verifyDerivedStory({...signal,what_changed:"https://example.com/raw-article"},now),false);
  assert.equal(verifyDerivedStory({...signal,published_at:"2026-10-27T11:40:00.000Z"},now),false);
 }
});
