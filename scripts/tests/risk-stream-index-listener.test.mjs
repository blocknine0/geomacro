import test from "node:test";
import assert from "node:assert/strict";
import {canonicalUntrustedIndexLead,acceptScopedUntrustedRiskStreamLeads}
 from "../../workers/control-plane/src/risk-stream-index-listener.mjs";
const now=Date.parse("2026-11-12T01:00:00.000Z");
const token="k".repeat(64);
const lead=(category="macro",country="USA")=>({
 category,country_iso3:country,
 source:"RSS",event_type:"INFLATION",
 source_record_id:"official-release-2026-11-11",
 published_at:"2026-11-11T21:00:00.000Z",
 source_url:"https://www.bls.gov/news.release/cpi.htm",
 headline:"COPYRIGHTED_PUBLISHER_HEADLINE_NOT_TO_BE_FORWARDED",
 commercial_rights_approved:true
});
test("Hot50 source metadata becomes untrusted index with no article body or rights claim",async()=>{
 const r=await canonicalUntrustedIndexLead(lead(),{now});
 assert.equal(r.kind,"INDEX_ONLY");
 assert.equal(r.category,"MACRO_FX");
 assert.equal(r.raw_payload,null);
 assert.equal(r.proof,null);
 assert.equal(r.publisher_root_domain,"bls.gov");
 assert.equal(r.original_page_sha256.length,64);
 assert.equal(JSON.stringify(r).includes("COPYRIGHTED"),false);
 assert.equal(JSON.stringify(r).includes("commercial_rights_approved"),false);
});
test("scoped 10-record stream registration is disabled and rights-unapproved, with durable Queue receipt",async()=>{
 const sends=[];const sources=new Map();
 const db={prepare(sql){return {sql,
  bind(...args){this.args=args;return this},
  async all(){
   if(sql.includes("FROM risk_stream_sources")){
    const ids=JSON.parse(this.args[0]);return {results:ids.map(id=>sources.get(id)).filter(Boolean)}
   }
   throw Error("UNEXPECTED_SELECT")
  }
 }},async batch(stmts){
  for(const st of stmts){
   assert(st.sql.includes("INSERT OR IGNORE INTO risk_stream_sources"));
   assert(st.sql.includes("0,0"));
   for(let i=0;i<st.args.length;i+=5){
    const [id,domain,parent,role]=st.args.slice(i,i+5);
    sources.set(id,{source_id:id,publisher_root_domain:domain,
     parent_media_entity:parent,source_role:role,
     commercial_rights_approved:0,enabled:0});
   }
  }
  return [{success:true}]
 }};
 const env={DB:db,RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  RISK_STREAM_INDEX_LEAD_BEARER:token,
  RISK_STREAM_QUEUE:{async sendBatch(x){sends.push(...x)}}};
 const items=Array.from({length:10},(_,i)=>({...lead(),source_record_id:"original-"+i}));
 const req=new Request("https://api.geomacro.live/v1/internal/risk-stream/index-leads",{
  method:"POST",headers:{Authorization:"Bearer "+token},
  body:JSON.stringify({schema:"geomacro.risk-stream-untrusted-leads.v1",items})
 });
 const res=await acceptScopedUntrustedRiskStreamLeads(req,env,{now});
 const body=await res.json();
 assert.equal(res.status,202,JSON.stringify(body));
 assert.equal(body.status,"DURABLY_QUEUED_INDEX_ONLY");
 assert.equal(body.accepted,10);
 assert.equal(sends.length,10);
 assert(sends.every(x=>x.body.kind==="INDEX_ONLY"&&x.body.proof===null));
 assert(sources.size>0);
 assert([...sources.values()].every(x=>x.enabled===0&&x.commercial_rights_approved===0));
});
test("no root admin creds: invalid scoped token never mutates D1 or Queue",async()=>{
 let called=0;
 const env={RISK_STREAM_INDEX_LEAD_BEARER:token,
  DB:{prepare(){called++;throw Error("MUTATED")}}};
 const req=new Request("https://api.geomacro.live/v1/internal/risk-stream/index-leads",{
  method:"POST",headers:{Authorization:"Bearer "+"x".repeat(64)},
  body:JSON.stringify({schema:"geomacro.risk-stream-untrusted-leads.v1",items:[lead()]})});
 const res=await acceptScopedUntrustedRiskStreamLeads(req,env,{now});
 assert.equal(res.status,403);assert.equal(called,0);
});
test("unknown ISO, stale publication and inaccessible nonpublisher host are held",async()=>{
 await assert.rejects(canonicalUntrustedIndexLead(lead("macro","GLOBAL"),{now}),
  /LEAD_COUNTRY_CATEGORY_OR_SOURCE_INVALID/);
 await assert.rejects(canonicalUntrustedIndexLead({...lead(),published_at:"1970-01-01T00:00:00Z"},{now}),
  /LEAD_COUNTRY_CATEGORY_OR_SOURCE_INVALID/);
 await assert.rejects(canonicalUntrustedIndexLead({...lead(),source_url:"http://localhost/private"},{now}),
  /LEAD_COUNTRY_CATEGORY_OR_SOURCE_INVALID/);
});
