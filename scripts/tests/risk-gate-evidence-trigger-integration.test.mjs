import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {riskGapEnrichmentTick} from "../../workers/control-plane/src/risk-gap-enrichment.mjs";
import {composeRiskGateThreeTierResponse} from "../../workers/control-plane/src/risk-gate-three-tier-product.mjs";
const at=Date.parse("2026-11-06T12:00:00Z");
const stamp=n=>new Date(n).toISOString();
const escapeXml=x=>String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;");
function fakeSource(host,title="India central bank announces rate decision"){
 return '<?xml version="1.0"?><rss><channel><item><title>'+escapeXml(title)+
  '</title><link>https://'+host+'/world/real-original</link>'+
  '<pubDate>Fri, 06 Nov 2026 11:30:00 GMT</pubDate>'+
  '<source url="https://'+host+'">Publisher</source></item></channel></rss>';
}
function mock(){
 let cursor=0,cursorAt=null;const inserted=new Map(),queries=[];
 const DB={
  prepare(sql){return {async first(){
    if(sql.includes("FROM risk_gap_enrichment_cursor"))
     return cursorAt?{next_offset:cursor,last_run_at:cursorAt}:null;
    throw Error("UNEXPECTED_SQL_UNBOUND_FIRST");
   },bind(...args){return {
   sql,args,
   async all(){
    if(sql.startsWith("SELECT entity_type,entity_id,category FROM unverified_observations")||
       sql.startsWith("SELECT entity_type,entity_id,category,MAX(discovered_at)")){
     return {results:[...inserted.values()].map(x=>({
      entity_type:x.entity_type,entity_id:x.entity_id,category:x.category}))};
    }
    if(sql.startsWith("SELECT entity_type,entity_id,category FROM risk_observations"))
     return {results:[]};
    if(sql.startsWith("SELECT observation_id,event_id FROM unverified_observations"))
     return {results:[...inserted.values()].filter(x=>JSON.parse(args[0])
      .some(w=>w.observation_id===x.observation_id))
      .map(x=>({observation_id:x.observation_id,event_id:x.event_id}))};
    throw Error("UNEXPECTED_SQL_READ:"+sql.slice(0,80));
   },
   async first(){
    if(sql.includes("FROM risk_gap_enrichment_cursor"))
     return cursorAt?{next_offset:cursor,last_run_at:cursorAt}:null;
    throw Error("UNEXPECTED_SQL_FIRST");
   },
  }}}},
  async batch(stmts){
   for(const stmt of stmts){
    if(stmt.sql.startsWith("INSERT INTO unverified_observations"))
     for(const row of JSON.parse(stmt.args[0]))inserted.set(row.observation_id,row);
    if(stmt.sql.startsWith("INSERT INTO risk_gap_enrichment_cursor")){
     cursor=stmt.args[0];cursorAt=stmt.args[1];
    }
   }
   return stmts.map(()=>({success:true}));
  },
 };
 const fetcher=async(url)=>{
  const u=new URL(url);queries.push(u);
  if(u.hostname==="news.google.com"){
   const focused=u.searchParams.get("q").includes("site:");
   return new Response(fakeSource(focused?"www.reuters.com":"www.bbc.com"),{
    status:200,headers:{"content-type":"application/xml"}});
  }
  return new Response("Forbidden",{status:403});
 };
 return {DB,inserted,queries,fetcher};
}
test("real 20m gap tick scans global Reuters/ANI publisher index, caps writes, keeps followups alive",async()=>{
 const m=mock(),env={DB:m.DB,RISK_GATE_COUNTRY_SCOPE:"HOT50"};
 const one=await riskGapEnrichmentTick(env,{now:at,fetcher:m.fetcher});
 assert.equal(one.ok,true,JSON.stringify(one));
 assert.equal(one.searched_cells,12);
 assert.equal(one.global_index_queries,12);
 assert.equal(one.publisher_focused_queries,4);
 assert.ok(one.observations<=24);
 assert.ok(one.observations>0);
 assert.equal(one.provisional_only,true);
 assert.equal(one.original_fulltext_stored,false);
 assert.equal(m.queries.filter(x=>x.hostname==="news.google.com"&&
  x.searchParams.get("q").includes("site:")).length,4);
 assert.equal([...m.inserted.values()].every(x=>x.status==="OBSERVED"&&
  x.original_page_fetched===0&&x.fact_basis==="SEARCH_TITLE_ONLY"),true);
 const two=await riskGapEnrichmentTick(env,{now:at+20*60000,fetcher:m.fetcher});
 assert.equal(two.ok,true,JSON.stringify(two));
 assert.ok(two.followup_cells>0,"previously observed cells remain eligible for enrichment");
 assert.equal(two.searched_cells,12);
});
test("actual Basic/Standard/Complex assemblers emit evidence activation conditions without charging",()=>{
 const snapshot={target_type:"COUNTRY",target_id:"IND",day_utc:"2026-11-06",
  categories:{GEOPOLITICS:{source_count:1},MACRO_FX:{source_count:0},
   CRITICAL_MINERALS:{source_count:0}}};
 const observations=[{category:"GEOPOLITICS",source_count:1,evidence_payload:JSON.stringify({
  schema:"geomacro.risk-observation.v1",
  sources:[{id:"original",published_at:stamp(at-30*60000),
   title_hash:"a".repeat(64),origin:"D1_ORIGINAL_METADATA"}]})}];
 const base={snapshot,observations,now:at};
 const basic=composeRiskGateThreeTierResponse({tier:"basic_focused",...base});
 assert.equal(basic.status,"READY");
 assert.equal(basic.activation_triggers.state,"ACTIVE");
 assert.deepEqual(basic.activation_triggers.category_triggers.map(x=>x.triggered),[true,false,false]);
 const standard=composeRiskGateThreeTierResponse({tier:"standard",...base});
 assert.equal(standard.activation_triggers.ready_now,false);
 assert.ok(standard.activation_triggers.pending_conditions.length>0);
 const complex=composeRiskGateThreeTierResponse({tier:"complex_full",...base});
 assert.equal(complex.activation_triggers.ready_now,false);
 assert.ok(complex.activation_triggers.pending_conditions.includes("CURRENT_UNEXPIRED_GRO"));
 for(const r of [basic,standard,complex]){
  assert.equal(r.activation_triggers.payment_performed,false);
  assert.equal(r.execution_authorized,false);
  assert.equal(r.charged,false);
 }
});
test("source and event truth gates remain distinct and automatic signing remains independent",()=>{
 const source=readFileSync("workers/control-plane/src/risk-gap-enrichment.mjs","utf8");
 const signing=readFileSync(".github/workflows/permanent-qualified-signed-gro-production.yml","utf8");
 assert.match(source,/isPublisherFullTextRestricted/);
 assert.match(source,/private|provisional_only:true/);
 assert.match(source,/x\.fact_basis='ARTICLE_FULL_TEXT' AND x\.original_page_fetched=1/);
 assert.match(source,/riskPublisherSearchPlan/);
 assert.match(signing,/Machine Dual-Authority Intelligence Publication/);
 assert.match(signing,/run-automatic-gro-signing.ts/);
 assert.doesNotMatch(source,/settleCoinbase|COINBASE_X402_MAINNET_ACK/);
});
