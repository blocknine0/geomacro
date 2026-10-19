import {test} from "node:test";
import {strict as assert} from "node:assert";
import {evaluatePublicNews} from "../ops/verify-public-intelligence-browser-freshness.mjs";

const NOW=Date.parse("2026-10-13T08:00:00Z");
const names=["geopolitics","macro","rare_earth"];
function row(category,i=1,when="2026-10-12T12:00:00Z"){
  return {id:category+"-"+String(i).padStart(8,"0"),
    title:"Geomacro finds official update on " + category,
    category,published_at:when,date_precision:"exact",
    severity:null,same_event_corrob_verified:false};
}
function doc(signals=names.map(x=>row(x))){
  return {ok:true,schema:"geomacro.website-derived-news-feed.v1",
    original_release_delay_minutes:15,retention_days:3,retention_hours:72,
    delivery_scope:"free_website_only",signals};
}
const article=(label)=>
  '<article><div>GEOMACRO FINDS · '+label+'</div><h2>Geomacro finds original release update</h2></article>';
const tabs='<main data-testid="geomacro-derived-news-desk">'+
  '<button>Geopolitics <span>1</span></button>'+
  '<button>Macro / FX <span>1</span></button>'+
  '<button>Critical Minerals <span>1</span></button>';
const html=()=>tabs+article("Geopolitics")+article("Macro / FX")+
  article("Critical Minerals")+'</main>';
test("verified D1 3-domain journal and actual three published DOM cards pass",()=>{
  const x=evaluatePublicNews(doc(),html(),NOW);
  assert.equal(x.accepted,true);
  assert.deepEqual(x.browser_domains_rendered,names.slice().sort());
  assert.deepEqual(x.d1_domains_present,names);
  assert.equal(x.category_counts.macro.original_last_24h,1);
  assert.equal(x.current_signed_gro_verified,false);
  assert.equal(x.publisher_realtime_guaranteed,false);
  assert.equal(x.raw_source_data_logged,false);
});
test("website only showing geopolitics fails even if D1 includes three",()=>{
  const x=evaluatePublicNews(doc(),tabs+article("Geopolitics")+"</main>",NOW);
  assert.equal(x.accepted,false);
  assert.deepEqual(x.browser_domains_rendered,["geopolitics"]);
});
test("does not count Loading or source health as an actual story",()=>{
  const x=evaluatePublicNews(doc(),html().replace(
    article("Critical Minerals"),'<p>Loading Critical Minerals from official publishers</p>'),NOW);
  assert.equal(x.accepted,false);
  assert.ok(!x.browser_domains_rendered.includes("rare_earth"));
});
test("quiet macro/minerals sources do not fail a genuine three-tab browser",()=>{
  const result=evaluatePublicNews(doc([row("geopolitics")]),
    tabs+article("Geopolitics")+"</main>",NOW);
  assert.equal(result.accepted,true);
  assert.deepEqual(result.d1_domains_present,["geopolitics"]);
  assert.deepEqual(result.browser_tabs_available,names.slice().sort());
  assert.equal(result.category_counts.macro.stored_72h,0);
  assert.equal(result.category_counts.rare_earth.stored_72h,0);
});
test("empty publisher day requires a real rendered three-tab desk",()=>{
  assert.equal(evaluatePublicNews(doc([]),tabs+"</main>",NOW).accepted,true);
  assert.equal(evaluatePublicNews(doc([]),"<main>Geopolitics Macro / FX Critical Minerals</main>",NOW).accepted,false);
});
test("zero original last-24h is truthful observation and not fabricated news",()=>{
  const x=evaluatePublicNews(doc(names.map(n=>row(n,1,"2026-10-11T12:00:00Z"))),html(),NOW);
  assert.equal(x.accepted,true);
  assert.equal(x.category_counts.rare_earth.original_last_24h,0);
  assert.equal(x.category_counts.rare_earth.original_last_7d,1);
});
test("reject old, future, malformed and unscored-contract-breaking rows",()=>{
  for(const bad of [
    {published_at:"2026-10-14T09:00:00Z"},
    {published_at:"2026-10-09T07:59:59Z"},
    {published_at:"2026-08-11T12:00:00Z"},
    {published_at:"garbled"},
    {id:"private-external-identity"},
    {severity:99},
    {same_event_corrob_verified:true},
    {title:"Raw article headline"},
  ]){
    const signals=[{...row("geopolitics"),...bad},row("macro"),row("rare_earth")];
    assert.throws(()=>evaluatePublicNews(doc(signals),html(),NOW));
  }
});
test("reject compromised D1 schema and missing category even if browser paints three",()=>{
  assert.throws(()=>evaluatePublicNews({...doc(),original_release_delay_minutes:0},html(),NOW));
  const x=evaluatePublicNews(doc([row("geopolitics"),row("rare_earth")]),html(),NOW);
  assert.equal(x.accepted,true);
  assert.equal(evaluatePublicNews(doc(),tabs+article("Geopolitics")+"</main>",NOW).accepted,false);
  assert.deepEqual(x.d1_domains_present,["geopolitics","rare_earth"]);
});