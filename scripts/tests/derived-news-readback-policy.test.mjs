import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeMonitoredFeedCredit,
  isSafeDerivedNewsReadbackSignal,
} from "../lib/derived-news-readback-policy.mjs";

const osint = (overrides={}) => ({
  id:"macro-1234abcd", category:"macro",
  title:"Geomacro finds official economic statistics source-feed observation",
  what_changed:"A monitored source feed contains a dated item about official economic statistics. The event actor, precise action and impact have not been independently verified.",
  why_it_matters:"This observation can guide follow-up checks, but it does not establish a macroeconomic value, market move or verified consequence.",
  topic:"official economic statistics", geography:null,
  development_type:"unverified OSINT feed observation",
  published_at:"2026-10-25T11:25:00.000Z", date_precision:"exact",
  observed_release_count:1, sources_credited:["Monitored feed: www.bankofcanada.ca"],
  status:"osint_feed_observed_unverified",
  same_event_corrob_verified:false, severity:null,
  ...overrides,
});

test("accepts only pinned-host-style monitored feed credit, with one known aggregator suffix",()=>{
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: www.bankofcanada.ca"),true);
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: news.un.org"),true);
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: news.google.com (aggregator; original publisher not verified)"),true);
  for(const value of [
    "Monitored feed: https://www.bankofcanada.ca",
    "Monitored feed: www.bankofcanada.ca/rss.xml",
    "Monitored feed: www.bankofcanada.ca?query=x",
    "Monitored feed: www.bankofcanada.ca#latest",
    "Monitored feed: www.bankofcanada.ca.evil.example",
    "Monitored feed: news.google.com (aggregator; original publisher not verified) extra",
    "Monitored feed: fake..example.com",
    "Monitored feed: -bankofcanada.ca",
    "Monitored feed: bank of canada",
    "Monitored feed: news.un.org (aggregator; original publisher not verified)",
  ]) assert.equal(isSafeMonitoredFeedCredit(value),false,value);
});

test("allows valid unverified OSINT attribution in derived-only journal without confusing hostname with article URL",()=>{
  assert.equal(isSafeDerivedNewsReadbackSignal(osint()),true);
  assert.equal(isSafeDerivedNewsReadbackSignal(osint({
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"],
  })),true);
});

test("rejects URL/path/HTML leakage in prose or malformed monitored-feed attribution",()=>{
  for(const signal of [
    osint({what_changed:"The source reports https://publisher.example/article. This is unverified."}),
    osint({why_it_matters:"Read www.bankofcanada.ca/article for details before making a decision."}),
    osint({sources_credited:["Monitored feed: https://www.bankofcanada.ca"]}),
    osint({sources_credited:["Monitored feed: www.bankofcanada.ca/rss"]}),
    osint({sources_credited:["Monitored feed: www.bankofcanada.ca","Monitored feed: news.un.org"]}),
    osint({development_type:"official update"}),
    osint({date_precision:"day"}),
    osint({geography:"Canada"}),
    osint({title:"Geomacro finds source https://publisher.example/article"}),
  ]) assert.equal(isSafeDerivedNewsReadbackSignal(signal),false,JSON.stringify(signal));
});

test("official derived cards never gain permission to include monitored-feed provenance or upstream URL",()=>{
  const official={...osint(),status:"official_release_observed_unscored",
    development_type:"policy update",geography:"Canada",
    topic:"official economic statistics",sources_credited:["Bank of Canada"]};
  assert.equal(isSafeDerivedNewsReadbackSignal(official),true);
  assert.equal(isSafeDerivedNewsReadbackSignal({...official,sources_credited:["Monitored feed: www.bankofcanada.ca"]}),false);
  assert.equal(isSafeDerivedNewsReadbackSignal({...official,sources_credited:["https://bankofcanada.ca"]}),false);
});
