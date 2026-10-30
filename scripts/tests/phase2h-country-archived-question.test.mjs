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

function workerDb(rows,{archived=true}={}){
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
     raw_json:JSON.stringify(row),b2_object_sha256:archived?"f".repeat(64):null
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
 assert.equal(Object.hasOwn(body.question_matches[0],"original_url"),false);
 assert.equal(Object.hasOwn(body.question_matches[0],"article_url"),false);
 assert.equal(Object.hasOwn(body.question_matches[0],"original"),false);
 assert.equal(Object.hasOwn(body.question_matches[0],"source_credit"),false);
 assert.equal(statements.length,1);
 assert.doesNotMatch(statements[0].sql,/b2_object_sha256 IS NOT NULL/u);
 assert.equal(body.d1_staged_unarchived_research_allowed,true);
 assert.match(statements[0].sql,/category=\?/u);
 assert.match(statements[0].sql,/ESCAPE '!'/u);
 assert.equal(statements[0].binds[0],"macro");
 assert.ok(JSON.parse(statements[0].binds[1]).includes("india"));
 assert.match(statements[0].sql,/json_each\(\?\)/u);
 assert.equal(statements[0].binds.length,2);
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

test("one canonical D1-staged source original yields research-only five-part before B2",async()=>{
 const {DB,statements}=workerDb([rawRows[0]],{archived:false});
 const params=new URLSearchParams({country_iso3:"IND",category:"macro",
  question:"What did India announce on monetary policy rates?"});
 const response=await phase2hPrivateRawGet({DB},params,now.getTime());
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.source,"CANONICAL_D1_PRIVATE_ORIGINAL_RESEARCH");
 assert.equal(payload.question_matches.length,1);
 assert.equal(payload.question_matches[0].archive_d1_ack_present,false);
 assert.equal(payload.question_matches[0].five_part.what_happened.text,
  rawRows[0].analysis.what_happened.text);
 assert.equal(payload.staged_row_never_paid_eligible,true);
 assert.equal(payload.chargeable,false);
 assert.equal(payload.paid_eligible,false);
 assert.doesNotMatch(statements[0].sql,/b2_object_sha256 IS NOT NULL/u);
});

test("one genuine native-dated country original gives five populated private research parts even without a derived signal",async()=>{
 const original=buildPhase2hPrivateRawRecords([{
  category:"rare_earth",sourceId:"ind_official",
  title:"India announces lithium recycling policy",
  articleUrl:"https://official.example.org/news/india-lithium-policy",
  publishedAt:"2026-10-30T08:00:00.000Z",credit:null
 }],{now,derive:()=>[]}).records[0];
 assert.equal(original.analysis.what_happened.text,null);
 assert.equal(original.analysis.why_it_matters.text,null);
 const {DB}=workerDb([original],{archived:false});
 const params=new URLSearchParams({country_iso3:"IND",category:"rare_earth",
  question:"What is India lithium policy news?"});
 const resp=await phase2hPrivateRawGet({DB},params,now.getTime());
 assert.equal(resp.status,200);
 const reply=await resp.json();
 assert.equal(reply.question_matches.length,1);
 const one=reply.question_matches[0];
 assert.equal(one.source_title_only_research_fallback_used,true);
 assert.match(one.five_part.what_happened.text,/India announces lithium recycling policy/u);
 assert.match(one.five_part.why_it_matters.text,/India announces lithium recycling policy/u);
 assert.ok(one.five_part.market_relevance);
 assert.ok(one.five_part.what_to_watch);
 assert.ok(one.five_part.evidence_and_confidence);
 assert.equal(one.five_part.evidence_and_confidence.paid_eligible,false);
 assert.equal(one.original_page_independently_verified,false);
 assert.equal(one.commercial_rights_verified,false);
 assert.equal(one.archive_d1_ack_present,false);
 assert.equal(reply.private_research_only,true);
 assert.equal(reply.chargeable,false);
 assert.equal(reply.paid_eligible,false);
 // The immutable D1/B2 row is never rewritten merely to fill the response.
 assert.equal(original.analysis.what_happened.text,null);
 assert.equal(original.analysis.why_it_matters.text,null);
});
test("event-specific existing analysis and original identity are never changed by one-original projection",async()=>{
 const original=rawRows[0];
 const {DB}=workerDb([original],{archived:true});
 const params=new URLSearchParams({country_iso3:"IND",category:"macro",
  question:"Why India monetary policy rates matter?"});
 const res=await phase2hPrivateRawGet({DB},params,now.getTime());
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.question_matches.length,1);
 assert.equal(body.question_matches[0].source_title_only_research_fallback_used,false);
 assert.deepEqual(body.question_matches[0].five_part,original.analysis);
 assert.equal(body.question_matches[0].archive_d1_ack_present,true);
});
test("market-focused one-source private research never invents a price move",async()=>{
 const one=buildPhase2hPrivateRawRecords([{
  category:"macro",sourceId:"official_bangladesh",
  title:"Bangladesh monetary policy rates announcement",
  articleUrl:"https://official.example.org/bgd-macro",
  publishedAt:"2026-10-30T08:00:00.000Z",credit:null
 }],{now,derive:()=>[]}).records[0];
 const {DB}=workerDb([one],{archived:false});
 const q=new URLSearchParams({country_iso3:"BGD",category:"macro",
  question:"Bangladesh monetary policy rates market"});
 const response=await phase2hPrivateRawGet({DB},q,now.getTime());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.question_matches.length,1);
 assert.equal(body.question_matches[0].focus,"market_relevance");
 assert.match(body.question_matches[0].direct_answer,/not independently verified/u);
 assert.equal(body.question_matches[0].five_part.market_relevance.price_direction,null);
 assert.equal(body.chargeable,false);
});
