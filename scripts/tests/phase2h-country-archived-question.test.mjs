import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PHASE2H_COUNTRIES_195,phase2hCountry,phase2hHeadlineCountryCandidate,
 phase2hCountrySqlHints} from "../lib/phase2h-country-originals-195.mjs";
import {buildPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
import {phase2hPrivateRawGet} from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";

const now=new Date("2026-10-30T09:00:00.000Z");
const derive=items=>items.map(x=>({
 category:x.category,published_at:x.publishedAt,
 topic:x.category==="macro"?"monetary policy rates":"mineral supply",
 what_changed:"Publisher reports "+x.title+".",
 why_it_matters:"This observed announcement concerns "+x.title+
  "; realized market movements are unverified.",
}));
const make=(category,title,n)=>buildPhase2hPrivateRawRecords([{
 category,title,sourceId:"original_publisher_"+n,
 publishedAt:"2026-10-30T08:00:00.000Z",
 articleUrl:"https://official.example.org/releases/"+n,
 credit:null,
}],{now,derive}).records[0];
const rawRows=[
 make("macro","India announces new monetary policy rates",1),
 make("rare_earth","India announces new lithium supply programme",2),
 make("macro","China announces monetary policy rates",3),
 make("macro","India and China discuss monetary policy rates",4),
];

function workerDb(rows){
 const statements=[];
 return {
  statements,
  DB:{prepare(sql){
   statements.push({sql,binds:[]});
   const entry=statements.at(-1);
   return {bind(...binds){
    entry.binds=binds;
    return {all:async()=>({results:rows.map(row=>({
     record_id:row.record_id,category:row.category,raw_sha256:row.raw_sha256,
     raw_json:JSON.stringify(row),b2_object_sha256:"f".repeat(64)
    }))})};
   }};
  }}
 };
}

test("canonical 195 country projection never drifts from fixed query universe",()=>{
 const source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
 const actual=source.match(/const COUNTRY_ROWS=`([\s\S]*?)`;/u)?.[1].trim();
 assert.ok(actual);
 const canonical=actual.split("\n").map(line=>line.split("|"));
 assert.equal(canonical.length,195);
 assert.deepEqual(PHASE2H_COUNTRIES_195.map(c=>[c.iso3,c.iso2,c.name]),canonical);
 assert.equal(phase2hCountry("PSE")?.name,"State of Palestine");
 assert.equal(phase2hCountry("VAT")?.name,"Holy See");
 assert.equal(phase2hCountry("XXX"),null);
 for(const country of PHASE2H_COUNTRIES_195)for(const category of
  ["geopolitics","macro","rare_earth"]){
  assert.ok(phase2hCountrySqlHints(country.iso3).length>0,category+":"+country.iso3);
 }
});
test("original headline, not publisher or two-country story, controls country match",()=>{
 assert.equal(phase2hHeadlineCountryCandidate("India announces lithium programme"),"IND");
 assert.equal(phase2hHeadlineCountryCandidate("China announces lithium programme"),"CHN");
 assert.equal(phase2hHeadlineCountryCandidate("India and China discuss lithium"),null);
 assert.equal(phase2hHeadlineCountryCandidate("Lithium programme announced"),null);
 assert.ok(phase2hCountrySqlHints("IND").includes("india"));
 assert.equal(phase2hCountrySqlHints("XXX").length,0);
});
test("protected archived news returns only same-country, same-category, question-specific five part",async()=>{
 const {DB,statements}=workerDb(rawRows);
 const params=new URLSearchParams({country_iso3:"IND",category:"macro",
   question:"What did India announce on monetary policy rates?"});
 const response=await phase2hPrivateRawGet({DB},params,now.getTime());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.schema,"geomacro.phase2h.private-question-fivepart.v1");
 assert.equal(body.requested_country_iso3,"IND");
 assert.equal(body.requested_category,"macro");
 assert.equal(body.country_event_independently_verified,false);
 assert.equal(body.global_search_complete,false);
 assert.equal(body.private_research_only,true);
 assert.equal(body.paid_eligible,false);
 assert.equal(body.chargeable,false);
 assert.equal(body.question_matches.length,1);
 assert.equal(body.question_matches[0].record_id,rawRows[0].record_id);
 assert.equal(body.question_matches[0].country_iso3,"IND");
 assert.deepEqual(Object.keys(body.question_matches[0].five_part),
  ["schema","what_happened","why_it_matters","market_relevance","what_to_watch","evidence_and_confidence"]);
 assert.equal(JSON.stringify(body).includes("https://official.example.org"),false);
 assert.equal(statements.length,1);
 assert.match(statements[0].sql,/b2_object_sha256 IS NOT NULL/u);
 assert.match(statements[0].sql,/category=\?/u);
 assert.match(statements[0].sql,/ESCAPE '!'/u);
 assert.equal(statements[0].binds[0],"macro");
 assert.ok(statements[0].binds.some(x=>x==="%india%"));
});
test("no candidate matching the exact country/topic is an honest empty no-charge answer",async()=>{
 const {DB}=workerDb(rawRows);
 const params=new URLSearchParams({country_iso3:"IND",category:"macro",
  question:"What happened to India's natural gas pipeline exports?"});
 const body=await (await phase2hPrivateRawGet({DB},params,now.getTime())).json();
 assert.equal(body.question_matches.length,0);
 assert.equal(body.chargeable,false);
 assert.equal(body.global_search_complete,false);
});
test("ambiguous, invalid, and unrelated cross-category requests do not leak raw records",async()=>{
 for(const params of [
  {country_iso3:"XXX",category:"macro",question:"India monetary rates"},
  {country_iso3:"IND",category:"other",question:"India monetary rates"},
  {country_iso3:"IND",question:"India monetary rates"},
  {category:"macro",question:"India monetary rates"},
  {country_iso3:"IND",category:"macro"},
  {country_iso3:"IND",category:"macro",question:"India monetary rates",record_id:"a".repeat(64)}
 ]){
  const response=await phase2hPrivateRawGet({DB:{}},new URLSearchParams(params),now.getTime());
  assert.equal(response.status,400,JSON.stringify(params));
 }
 const {DB}=workerDb(rawRows);
 const empty=await (await phase2hPrivateRawGet({DB},new URLSearchParams({
  country_iso3:"IND",category:"geopolitics",question:"India monetary policy rates"
 }),now.getTime())).json();
 assert.equal(empty.question_matches.length,0);
});
