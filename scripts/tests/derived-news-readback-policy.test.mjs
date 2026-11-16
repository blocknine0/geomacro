import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeMonitoredFeedCredit,
  isSafeDerivedNewsReadbackSignal,
  isSourceNeutralOsintSignal,
  projectSourceNeutralOsintSignal,
} from "../lib/derived-news-readback-policy.mjs";

const osint = (overrides={}) => ({
  id:"macro-1234abcd", category:"macro",
  title:"Canadian authorities publish a new economic statistics update",
  what_changed:"A monitored source feed contains a dated item about economic statistics.",
  why_it_matters:"A structured macro signal for follow-up.",
  topic:"official economic statistics", geography:"Canada",country_iso3:"CAN",corridor:null,event_direction:"tightening",
  development_type:"unverified OSINT feed observation",
  published_at:"2026-10-25T11:25:00.000Z", date_precision:"exact",
  observed_release_count:1, sources_credited:[],
  status:"osint_feed_observed_unverified",
  same_event_corrob_verified:false, severity:null,
  ...overrides,
});

test("accepts only hostname-shaped monitored feed credit, with one known aggregator suffix",()=>{
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: www.bankofcanada.ca"),true);
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: news.un.org"),true);
  assert.equal(isSafeMonitoredFeedCredit("Monitored feed: news.google.com (aggregator; original publisher not verified)"),true);
  for(const value of [
    "Monitored feed: https://www.bankofcanada.ca",
    "Monitored feed: www.bankofcanada.ca/rss.xml",
    "Monitored feed: www.bankofcanada.ca?query=x",
    "Monitored feed: www.bankofcanada.ca#latest",
    "Monitored feed: www.bankofcanada.ca.evil/example",
    "Monitored feed: news.google.com (aggregator; original publisher not verified) extra",
    "Monitored feed: fake..example.com",
    "Monitored feed: -bankofcanada.ca",
    "Monitored feed: bank of canada",
    "Monitored feed: news.un.org (aggregator; original publisher not verified)",
  ]) assert.equal(isSafeMonitoredFeedCredit(value),false,value);
});

test("allows valid unverified OSINT attribution in derived-only journal without confusing hostname with article URL",()=>{
  const projected=projectSourceNeutralOsintSignal(osint());
  assert.equal(isSafeDerivedNewsReadbackSignal(projected),true);
  assert.equal(isSafeDerivedNewsReadbackSignal({...projected,sources_credited:[
    "Monitored feed: news.google.com (aggregator; original publisher not verified)"]}),true);
});

test("rejects URL/path/HTML leakage in prose or malformed monitored-feed attribution",()=>{
  const base=projectSourceNeutralOsintSignal(osint());
  for(const changes of [
    {what_changed:"The source reports https://publisher.example/article. This is unverified."},
    {why_it_matters:"Read www.bankofcanada.ca/article for details before making a decision."},
    {what_changed:"Read bankofcanada.ca/rss.xml before making a decision."},
    {sources_credited:["Monitored feed: https://www.bankofcanada.ca"]},
    {sources_credited:["Monitored feed: www.bankofcanada.ca/rss"]},
    {sources_credited:["Monitored feed: www.bankofcanada.ca","Monitored feed: news.un.org"]},
    {development_type:"official update"},
    {date_precision:"day"},
    {title:"GeoMacro Brief https://publisher.example/article"},
    {topic:"https://publisher.example/article"},
    {development_type:"source example.com/path"},
    {geography:"https://publisher.example"},
  ]) assert.equal(isSafeDerivedNewsReadbackSignal({...base,...changes}),false,JSON.stringify(changes));
});

test("official derived cards never gain permission to include monitored-feed provenance or upstream URL",()=>{
  const official={...projectSourceNeutralOsintSignal(osint()),status:"official_release_observed_unscored",
    development_type:"policy update",geography:"Canada",
    topic:"official economic statistics",sources_credited:["Bank of Canada"]};
  assert.equal(isSafeDerivedNewsReadbackSignal(official),true);
  assert.equal(isSafeDerivedNewsReadbackSignal({...official,sources_credited:["Monitored feed: www.bankofcanada.ca"]}),false);
  assert.equal(isSafeDerivedNewsReadbackSignal({...official,sources_credited:["https://bankofcanada.ca"]}),false);
});

test("country and topic classified OSINT rows project to concrete source-neutral GeoMacro briefs",()=>{
  for(const [category,topic,label] of [
    ["geopolitics","sanctions and trade restrictions","geopolitical"],
    ["macro","inflation and prices","macro"],
    ["rare_earth","critical-mineral inputs","critical-minerals"],
  ]){
    const raw=osint({id:category+"-abcdef12",category,topic,
      title:"Canadian authorities publish a headline containing a restricted publisher phrase",
      what_changed:"A monitored source feed reports a named entity and unpublished article sentence.",
      geography:"Canada",country_iso3:"CAN",corridor:null,event_direction:"tightening",
      sources_credited:["Monitored feed: publisher.example"]});
    const safe=projectSourceNeutralOsintSignal(raw);
    assert.ok(isSafeDerivedNewsReadbackSignal(safe));
    assert.equal(isSourceNeutralOsintSignal(safe),true);
    assert.match(safe.title,/^GeoMacro (Geopolitics|Macro\/FX|Critical Minerals) Brief · .+ — Canada \(CAN\)$/u);
    assert.match(safe.what_changed,/^WHAT CHANGED: GeoMacro's dated observation records a/u);
    assert.match(safe.why_it_matters,/Risk: .* → Downstream effect: .* → Price impact channel: .*Action Posture: (CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE)/u);
    assert.doesNotMatch(safe.title+safe.what_changed+safe.why_it_matters,/unverified|watch signal|not independently verified|does not establish production|publisher\.example|https?:\/\//iu);
    assert.deepEqual(safe.sources_credited,[]);
    assert.doesNotMatch(JSON.stringify(safe),/restricted publisher|unpublished article|publisher\.example/u);
    assert.equal(isSourceNeutralOsintSignal({...safe,raw_source_url:"https://publisher.example/a"}),false);
  }
});
