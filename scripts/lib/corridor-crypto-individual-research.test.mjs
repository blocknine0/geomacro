import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cryptoIndividualRecord,cryptoNewsTopic,normalizedCryptoArticleUrl,
 validCryptoIndividual,CRYPTO_NEWS_SCHEMA}
 from "../../lib/crypto-news-individual-structured.mjs";
import {collectCredentialCorridorContext}
 from "./corridor-credential-context.mjs";
import {validateCryptoNewsResearchPacket,putPrivateCryptoNewsResearch,
 readPrivateCryptoNewsResearch,purgePrivateCryptoNewsResearch}
 from "../../workers/control-plane/src/corridor-crypto-individual-research.mjs";
import {publishPrivateCryptoIndividualNews}
 from "../ops/publish-private-crypto-individual-research.mjs";
import {readFileSync} from "node:fs";
const NOW=new Date("2026-11-02T06:06:00.000Z");
const hash=s=>createHash("sha256").update(s).digest("hex");
const uri="https://www.coindesk.com/markets/2026/11/02/etf-activity";
const published=new Date(NOW.getTime()-3600000).toISOString();
const base=()=>({
 id:hash(["cryptocompare_news","1001",published,uri].join("\x1f")),
 provider_id:"1001",article_url:uri,source_name:"CoinDesk",
 published_at:published,title_sha256:hash("Bitcoin ETF market activity"),
 topic:"CRYPTO_MARKET",categories:["macro"],
 attribution:"CRYPTOCOMPARE_NEWS_API_AGGREGATOR_METADATA",
 source_time_is_not_event_time:true,original_article_verified:false,
 independent_corroboration_verified:false,commercial_rights_verified:false,
 customer_delivery_enabled:false
});
const pack=(candidate=base())=>{
 const record=cryptoIndividualRecord(candidate);
 return {schema:CRYPTO_NEWS_SCHEMA,channel:"CORRIDOR_ONLY",
 checked_at:NOW.toISOString(),items:[{record,record_sha256:hash(JSON.stringify(record))}],
 website_intelligence_enabled:false,commercial_rights_verified:false};
};
test("existing 24h API sample converts separately to per-article candidates",async()=>{
 const title="Bitcoin ETF market activity";
 const api={Data:[{id:"1001",url:uri+"?utm_source=feed",
   source:"CoinDesk",title,published_on:Math.floor(Date.parse(published)/1000)},
  {id:"1001",url:uri,source:"CoinDesk",title,published_on:Math.floor(Date.parse(published)/1000)},
  {id:"1002",url:"http://localhost/x",source:"X",title:"Invalid",
   published_on:Math.floor(Date.parse(published)/1000)}]};
 const out=await collectCredentialCorridorContext({now:NOW,force:true,
  keys:{GEOMACRO_CRYPTOCOMPARE_API_KEY:"C".repeat(40)},
  fetchImpl:async()=>Response.json(api)});
 assert.equal(out.crypto_news_candidate_count,1);
 assert.equal(out.crypto_news_candidates[0].article_url,uri);
 assert.equal(out.crypto_news_candidates[0].topic,"CRYPTO_MARKET");
 assert.equal(out.observations.find(x=>x.source_id==="cryptocompare_news").numeric_value,2);
 assert.equal(out.source_checks.find(x=>x.id==="cryptocompare_news").state,"OFFICIAL_REFERENCE_OBSERVED");
 const serialized=JSON.stringify(out);
 assert.ok(!serialized.includes(title));
 assert.ok(!serialized.includes("utm_source"));
 assert.ok(!serialized.includes("C".repeat(40)));
});
test("five-part output is conservative and never claims a verified event",()=>{
 const record=cryptoIndividualRecord(base());
 assert.deepEqual(Object.keys(record.structured),["what_happened","why_it_matters",
  "market_relevance","what_to_watch","evidence_and_confidence"]);
 assert.equal(record.structured.evidence_and_confidence.confidence,"INDEX_METADATA_ONLY");
 assert.equal(record.verified_news_event,false);
 assert.equal(record.customer_delivery_authorized,false);
 assert.equal(record.signed_gro,false);
 assert.equal(cryptoNewsTopic("Government sanctions bitcoin services"),"CRYPTO_POLICY");
 assert.equal(normalizedCryptoArticleUrl("http://127.0.0.1/internal"),null);
 assert.equal(validCryptoIndividual({...base(),original_article_verified:true},NOW.getTime()),false);
});
class MockD1{
 constructor(){this.rows=new Map()}
 prepare(query){return {bind:(...params)=>({
  all:async()=>{
   const rows=[...this.rows.values()];
   if(query.includes("article_id IN"))return {results:rows.filter(r=>
    params.slice(0,-1).includes(r.article_id)&&r.published_at>=params.at(-1))};
   return {results:rows.filter(r=>r.published_at>=params[0])
    .sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,params[1])};
  },
  run:async()=>{
   if(query.startsWith("DELETE"))for(const [key,row] of this.rows)
    if(row.published_at<params[0])this.rows.delete(key);
   return {success:true};
  },
  query,params
 })}}
 async batch(statements){
  for(const s of statements){
   assert.match(s.query,/INSERT INTO corridor_crypto_individual_research/);
   const p=s.params,prev=this.rows.get(p[0]);
   if(prev&&(prev.provider_id!==p[1]||prev.published_at!==p[2]||
      prev.article_url!==p[3]))continue;
   this.rows.set(p[0],{
    article_id:p[0],provider_id:p[1],published_at:p[2],article_url:p[3],
    source_name:p[4],title_sha256:p[5],topic:p[6],
    record_sha256:p[7],structured_json:p[8]
   });
  }
 }
}
test("D1 verifies individual five-part rows, rejects tampering, and purges expired data",async()=>{
 const db=new MockD1(),packet=pack();
 const valid=await validateCryptoNewsResearchPacket(packet,NOW.getTime());
 assert.equal(valid.length,1);
 const put=await putPrivateCryptoNewsResearch({DB:db},packet,NOW.getTime());
 assert.equal(put.status,200);
 assert.equal((await put.json()).verified,1);
 const read=await readPrivateCryptoNewsResearch({DB:db},new URLSearchParams("limit=20"),NOW.getTime());
 const body=await read.json();
 assert.equal(body.count,1);
 assert.equal(body.records[0].structured.evidence_and_confidence.original_article_verified,false);
 const mutated={...packet,items:[{...packet.items[0],record:{
  ...packet.items[0].record,structured:{...packet.items[0].record.structured,
    market_relevance:"BTC ROSE 100% due to ETF news"}
 }}]};
 assert.equal((await putPrivateCryptoNewsResearch({DB:db},mutated,NOW.getTime())).status,422);
 assert.equal((await putPrivateCryptoNewsResearch({DB:db},
  pack({...base(),article_url:"https://evil.internal/"}),NOW.getTime())).status,422);
 assert.equal((await putPrivateCryptoNewsResearch({},packet,NOW.getTime())).status,503);
 await purgePrivateCryptoNewsResearch({DB:db},NOW.getTime()+73*3600000);
 assert.equal(db.rows.size,0);
});
test("scheduled private publisher requires PUT and GET independent readback",async()=>{
 const db=new MockD1(),root="A".repeat(64),receipt=pack();
 let putCalls=0,getCalls=0;
 const out=await publishPrivateCryptoIndividualNews({receipt,rootToken:root,
  now:NOW,fetchImpl:async(_,opts)=>{
   assert.match(opts.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
   if(opts.method==="PUT"){putCalls++;
    return putPrivateCryptoNewsResearch({DB:db},JSON.parse(opts.body),NOW.getTime());}
   getCalls++;
   return readPrivateCryptoNewsResearch({DB:db},
    new URLSearchParams("limit=50"),NOW.getTime());
  }});
 assert.equal(out.d1_five_part_records_verified,1);
 assert.equal(out.authenticated_put_exact_readback,true);
 assert.equal(out.authenticated_get_verified,true);
 assert.equal(putCalls,1);assert.equal(getCalls,1);
});
test("production adapter remains admin-only, PREDGE unchanged and no public lane",()=>{
 const index=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(index.indexOf('const auth = authorized(request, env)')<
  index.indexOf('if(url.pathname==="/v1/internal/corridor-crypto-individual-research")'));
 assert.ok(!index.includes("/v1/public/corridor-crypto-individual-research"));
 const workflow=readFileSync(new URL("../..//.github/workflows/direct-global-corridor-intake.yml",import.meta.url),"utf8");
 assert.ok(workflow.includes("publish-private-crypto-individual-research.mjs"));
 assert.ok(workflow.includes("crypto-individual-d1-readback.json"));
});
