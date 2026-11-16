import test from "node:test";
import assert from "node:assert/strict";
import {unverifiedWebsiteSignalFromOsint} from "./private-osint-website-bridge.mjs";
import {verifyDerivedStory,readDerivedStories,readDerivedStoriesBundle} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {actorActionNewsObservation} from "../../src/lib/release-news-observation.ts";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const titles={
 geopolitics:"Yemen Ministry of Transport introduces Red Sea tanker transit controls",
 macro:"Bank of Japan announces policy rate decision for Japan",
 rare_earth:"Chile Ministry of Mines approves lithium processing project",
};
test("all three unverified OSINT source feed cards pass the production website journal and remain unscored",()=>{
 for(const [category,title] of Object.entries(titles)){
  const signal=unverifiedWebsiteSignalFromOsint({
   news_id:"news-"+"b".repeat(64),category,title,published_at:"2026-10-25T11:40:00.000Z",
   source_url:"https://news.google.com/rss/search?q=official",article_url:null,
  },now,actorActionNewsObservation);
  assert.ok(signal,category);
  assert.equal(verifyDerivedStory(signal,now),true,category);
  assert.equal(verifyDerivedStory({...signal,severity:44},now),false);
  assert.equal(verifyDerivedStory({...signal,status:"official_release_observed_unscored"},now),false);
  assert.equal(verifyDerivedStory({...signal,sources_credited:["United Nations"]},now),false);
  assert.equal(verifyDerivedStory({...signal,what_changed:"https://example.com/raw-article"},now),false);
  assert.equal(verifyDerivedStory({...signal,published_at:"2026-10-27T11:40:00.000Z"},now),false);
 }
});

test("public Worker read projects stored private headlines and feed hosts into browser-admissible watch cards",async()=>{
 const headlines={
  geopolitics:"Yemen Ministry of Transport introduces Red Sea tanker transit controls",
  macro:"Bank of Japan announces policy rate decision for Japan",
  rare_earth:"Chile Ministry of Mines approves lithium processing project",
 };
 for(const category of Object.keys(headlines)){
  const raw=unverifiedWebsiteSignalFromOsint({news_id:"news-"+"c".repeat(64),category,
   title:headlines[category],source_url:"https://private-publisher.example/rss",
   published_at:"2026-10-25T11:40:00.000Z"},now,actorActionNewsObservation);
  assert.ok(raw);
  const env={DB:{prepare(){return {bind(){return {all:async()=>({results:[{
   story_json:JSON.stringify(raw),first_seen_at:"2026-10-25T11:41:00.000Z"}]})}}}}}};
  const response=await readDerivedStories(env,now,0,0,false);
  const doc=await response.json();
  assert.equal(response.status,200);
  assert.equal(doc.signals.length,1);
  const [publicSignal]=doc.signals;
  assert.equal(publicSignal.sources_credited.length,0);
  assert.match(publicSignal.title,/· .+ — (?:Red Sea Maritime Corridor|Japan|Chile)$/u);
  assert.doesNotMatch(publicSignal.title,/unverified .* watch signal|publisher headline|source title/iu);
  assert.doesNotMatch(JSON.stringify(doc),/private-publisher\.example|https?:\/\//u);
  const bundle=await readDerivedStoriesBundle(env,now,false);
  const bundleDoc=await bundle.json();
  assert.doesNotMatch(JSON.stringify(bundleDoc),/private-publisher\.example|https?:\/\//u);
 }
});
